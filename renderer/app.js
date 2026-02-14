import { createKonvaCanvas, drawGrid, mmToScreen, screenToMm } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { findSnapPoint } from './cad/snap.js';
import { parseDxf, dxfEntitiesToShapes, exportDxf } from './io/dxf.js';
import { parseJww, parseJwwBinary, jwwEntitiesToShapes } from './io/jww.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';
import { initCommandLine } from './ui/commandline.js';

// ──────────────────────────────────────────────
// DXF デコード（CP932 対応）
// ──────────────────────────────────────────────
function decodeDxfBase64(base64) {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(bytes);
    } catch {
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  }
}

// ──────────────────────────────────────────────
// 座標入力パーサー
// ──────────────────────────────────────────────
function handleCoordInput(str, currentPoint, prevPoint) {
  str = str.trim();
  // @x,y 相対座標
  const relMatch = str.match(/^@([-\d.]+),([-\d.]+)$/);
  if (relMatch && currentPoint) {
    return { x: currentPoint.x + parseFloat(relMatch[1]), y: currentPoint.y - parseFloat(relMatch[2]) };
  }
  // @dist<angle 極座標
  const polarMatch = str.match(/^@([\d.]+)<([-\d.]+)$/);
  if (polarMatch && currentPoint) {
    const dist = parseFloat(polarMatch[1]);
    const angle = parseFloat(polarMatch[2]) * Math.PI / 180;
    return { x: currentPoint.x + dist * Math.cos(angle), y: currentPoint.y - dist * Math.sin(angle) };
  }
  // x,y 絶対座標
  const absMatch = str.match(/^([-\d.]+),([-\d.]+)$/);
  if (absMatch) return { x: parseFloat(absMatch[1]), y: parseFloat(absMatch[2]) };
  // 数値のみ（長さ）→ 現在方向に伸ばす
  const num = parseFloat(str);
  if (!isNaN(num) && currentPoint && prevPoint) {
    const angle = Math.atan2(currentPoint.y - prevPoint.y, currentPoint.x - prevPoint.x);
    return { x: currentPoint.x + num * Math.cos(angle), y: currentPoint.y + num * Math.sin(angle) };
  }
  if (!isNaN(num) && currentPoint) {
    // 方向不明 → X方向に伸ばす
    return { x: currentPoint.x + num, y: currentPoint.y };
  }
  return null;
}

// ──────────────────────────────────────────────
// オルソ適用
// ──────────────────────────────────────────────
function applyOrtho(start, end) {
  if (!start) return end;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx >= dy) return { x: end.x, y: start.y };
  return { x: start.x, y: end.y };
}

// ──────────────────────────────────────────────
// 線分交点計算
// ──────────────────────────────────────────────
function lineIntersection(l1, l2) {
  const d1x = l1.x2 - l1.x1, d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1, d2y = l2.y2 - l2.y1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / cross;
  const u = ((l2.x1 - l1.x1) * d1y - (l2.y1 - l1.y1) * d1x) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: l1.x1 + t * d1x, y: l1.y1 + t * d1y };
}

// 無限延長線の交点（TRIMで境界の延長線も使う）
function lineIntersectionUnbounded(l1, l2) {
  const d1x = l1.x2 - l1.x1, d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1, d2y = l2.y2 - l2.y1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;
  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / cross;
  return { t, x: l1.x1 + t * d1x, y: l1.y1 + t * d1y };
}

// ──────────────────────────────────────────────
// Konva キャンバス
// ──────────────────────────────────────────────
const container = document.getElementById('cad-root');
const { stage, gridLayer, drawingLayer, snapLayer } = createKonvaCanvas(container);

const viewport = { x: 0, y: 0, scale: 1 };
const shapes = [];

let tool = Tool.SELECT;
let drawingStart = null;
let previewShape = null;
let selectedId = null;
let selectedIds = new Set();
let isPanning = false;
let panStart = null;
let dragState = null;
let polylinePoints = [];
let clipboard = null;
let moveState = null;
let copyState = null;
let rotateState = null;
let dimState = { p1: null, p2: null };
let latestSnap = { x: 0, y: 0, type: 'grid' };

// オフセット状態
let offsetState = { dist: null, base: null };
// ミラー状態
let mirrorState = { p1: null };
// トリム状態
let trimState = { boundaries: [], phase: 0 };
// フィレット状態
let filletState = { r: null, first: null };
// テキスト入力状態
let textState = { point: null, inputEl: null };

let orthoMode = false;
let snapMode = true;
let gridVisible = true;

const history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

// ──────────────────────────────────────────────
// 履歴管理
// ──────────────────────────────────────────────
function saveHistory() {
  history.splice(historyIndex + 1);
  history.push(JSON.parse(JSON.stringify(shapes)));
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  shapes.length = 0;
  for (const s of history[historyIndex]) shapes.push(s);
  selectedId = null;
  selectedIds.clear();
  cmdline.addHistory('元に戻す', '#8aa8c0');
  redraw();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  shapes.length = 0;
  for (const s of history[historyIndex]) shapes.push(s);
  selectedId = null;
  selectedIds.clear();
  cmdline.addHistory('やり直し', '#8aa8c0');
  redraw();
}

saveHistory();

// ──────────────────────────────────────────────
// ツール切替
// ──────────────────────────────────────────────
function changeTool(nextTool) {
  // テキスト入力中のインプットを削除
  if (textState.inputEl) {
    textState.inputEl.remove();
    textState.inputEl = null;
  }
  tool = nextTool;
  drawingStart = null;
  previewShape = null;
  polylinePoints = [];
  moveState = null;
  copyState = null;
  rotateState = null;
  dimState = { p1: null, p2: null };
  offsetState = { dist: null, base: null };
  mirrorState = { p1: null };
  trimState = { boundaries: [], phase: 0 };
  filletState = { r: null, first: null };
  textState = { point: null, inputEl: null };
  toolbar.setActive(tool);
  statusbar.setTool(tool);
  statusbar.setGuide(tool, 0);
  redraw();

  // ツール別の初期メッセージ
  if (tool === Tool.OFFSET) {
    cmdline.setLabel('[オフセット] 距離を入力 [Enter]:');
    statusbar.setCustomGuide('オフセット距離を入力してEnter');
  } else if (tool === Tool.FILLET) {
    cmdline.setLabel('[フィレット] 半径を入力 [Enter] (0=直角):');
    statusbar.setCustomGuide('フィレット半径を入力してEnter');
  }
}

// ──────────────────────────────────────────────
// UI初期化
// ──────────────────────────────────────────────
const toolbar = initToolbar({
  onChangeTool: changeTool,
  onOpenFile: openCadFile,
  onExportDxf: exportCurrentDxf,
  onUndo: undo,
  onRedo: redo,
  onFitView: () => fitView(),
});
toolbar.setActive(tool);

const statusbar = initStatusbar({
  onOrthoChange(on) { orthoMode = on; },
  onSnapChange(on) { snapMode = on; },
  onGridChange(on) { gridVisible = on; redraw(); },
});
statusbar.setTool(tool);
statusbar.setGuide(tool, 0);

if (window.cadBridge?.onMenuOpenFile) window.cadBridge.onMenuOpenFile(() => openCadFile());

const cmdline = initCommandLine({
  onToolChange(toolId) {
    changeTool(toolId);
  },
  onCoordInput(str) {
    handleCmdlineCoord(str);
  },
  onSpecialCommand(cmd) {
    if (cmd === 'escape') escapeCurrentTool();
    else if (cmd === 'undo') undo();
    else if (cmd === 'redo') redo();
    else if (cmd === 'zoomAll') fitView();
    else if (cmd === 'erase') deleteSelected();
  },
});

initSidebar({
  getDrawingContext() {
    const elements = shapes.map((s) => {
      if (s.type === 'line') return { type: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer: 'default' };
      if (s.type === 'arc') return { type: 'arc', cx: s.cx, cy: s.cy, r: s.r, startAngle: s.startAngle, endAngle: s.endAngle, layer: 'default' };
      if (s.type === 'circle') return { type: 'circle', cx: s.cx, cy: s.cy, r: s.r, layer: 'default' };
      if (s.type === 'text') return { type: 'text', x: s.x, y: s.y, text: s.text, height: s.height, rotation: s.rotation, layer: 'default' };
      if (s.type === 'point') return { type: 'point', x: s.x, y: s.y, layer: 'default' };
      if (s.type === 'dim') return { type: 'dim', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer: 'default' };
      return { type: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, layer: 'default' };
    });
    return { layers: [{ name: 'default', visible: true }], elements, selected: selectedId ? [selectedId] : [], bbox: computeBoundingBox(elements) };
  },
  onAiResponse(text) {
    // AI応答からJSON描画指示を抽出
    executeAiDraw(text);
  },
});

// ──────────────────────────────────────────────
// AI自動作図
// ──────────────────────────────────────────────
function executeAiDraw(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.action !== 'draw' || !Array.isArray(parsed.shapes)) return;
    for (const s of parsed.shapes) {
      shapes.push({ id: `shape_${crypto.randomUUID()}`, ...s });
    }
    saveHistory();
    fitView();
    redraw();
    cmdline.addHistory(`AI作図: ${parsed.shapes.length}個の図形を追加`, '#4da6ff');
  } catch (e) {
    console.error('AI draw parse error', e);
  }
}

// ──────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────
function computeBoundingBox(elements) {
  if (!elements.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = [], ys = [];
  for (const e of elements) {
    if (e.type === 'line') { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
    else if (e.type === 'arc' || e.type === 'circle') { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
    else if (e.type === 'text' || e.type === 'point') { xs.push(e.x); ys.push(e.y); }
    else if (e.type === 'dim') { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
    else { xs.push(e.x, e.x + e.w); ys.push(e.y, e.y + e.h); }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function pointerToMm() {
  const pointer = stage.getPointerPosition();
  if (!pointer) return { x: 0, y: 0 };
  return screenToMm(pointer, viewport);
}

function getSnap() {
  const raw = pointerToMm();
  if (!snapMode) {
    latestSnap = { x: raw.x, y: raw.y, type: 'grid' };
    return { x: raw.x, y: raw.y };
  }
  latestSnap = findSnapPoint(raw, shapes, viewport);
  return { x: latestSnap.x, y: latestSnap.y };
}

function pickShape(mmPoint) {
  const threshold = 12 / viewport.scale;
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const s = shapes[i];
    if (s.type === 'rect') {
      if (mmPoint.x >= s.x && mmPoint.x <= s.x + s.w && mmPoint.y >= s.y && mmPoint.y <= s.y + s.h) return s;
      continue;
    }
    if (s.type === 'line') {
      if (distancePointToSegment(mmPoint, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= threshold) return s;
      continue;
    }
    if (s.type === 'arc' || s.type === 'circle') {
      if (Math.abs(Math.hypot(mmPoint.x - s.cx, mmPoint.y - s.cy) - s.r) <= threshold) return s;
      continue;
    }
    if (s.type === 'text') {
      const approxW = s.text.length * (s.height || 2.5) * 0.7;
      if (mmPoint.x >= s.x - threshold && mmPoint.x <= s.x + approxW + threshold && mmPoint.y >= s.y - (s.height || 2.5) - threshold && mmPoint.y <= s.y + threshold) return s;
      continue;
    }
    if (s.type === 'point') {
      if (Math.hypot(mmPoint.x - s.x, mmPoint.y - s.y) <= threshold * 2) return s;
    }
  }
  return null;
}

function distancePointToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx ** 2 + dy ** 2)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function shapeClone(shape) { return JSON.parse(JSON.stringify(shape)); }

function applyMove(shape, dx, dy) {
  if (shape.type === 'rect') { shape.x += dx; shape.y += dy; return; }
  if (shape.type === 'line' || shape.type === 'dim') { shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy; return; }
  if (shape.type === 'arc' || shape.type === 'circle') { shape.cx += dx; shape.cy += dy; return; }
  if (shape.type === 'text' || shape.type === 'point') { shape.x += dx; shape.y += dy; }
}

function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: cx + (px - cx) * cos - (py - cy) * sin, y: cy + (px - cx) * sin + (py - cy) * cos };
}

function applyRotate(shape, center, angleDeg) {
  if (shape.type === 'line' || shape.type === 'dim') {
    const p1 = rotatePoint(shape.x1, shape.y1, center.x, center.y, angleDeg);
    const p2 = rotatePoint(shape.x2, shape.y2, center.x, center.y, angleDeg);
    shape.x1 = p1.x; shape.y1 = p1.y; shape.x2 = p2.x; shape.y2 = p2.y;
  } else if (shape.type === 'rect') {
    const corners = [
      rotatePoint(shape.x, shape.y, center.x, center.y, angleDeg),
      rotatePoint(shape.x + shape.w, shape.y, center.x, center.y, angleDeg),
      rotatePoint(shape.x + shape.w, shape.y + shape.h, center.x, center.y, angleDeg),
      rotatePoint(shape.x, shape.y + shape.h, center.x, center.y, angleDeg),
    ];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    shape.x = Math.min(...xs); shape.y = Math.min(...ys);
    shape.w = Math.max(...xs) - shape.x; shape.h = Math.max(...ys) - shape.y;
  } else if (shape.type === 'arc' || shape.type === 'circle') {
    const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
    shape.cx = c.x; shape.cy = c.y;
    if (shape.type === 'arc') { shape.startAngle += angleDeg; shape.endAngle += angleDeg; }
  } else if (shape.type === 'text' || shape.type === 'point') {
    const p = rotatePoint(shape.x, shape.y, center.x, center.y, angleDeg);
    shape.x = p.x; shape.y = p.y;
    if (shape.type === 'text') shape.rotation = (shape.rotation || 0) + angleDeg;
  }
}

// ──────────────────────────────────────────────
// オフセット
// ──────────────────────────────────────────────
function offsetShape(shape, dist) {
  if (shape.type === 'line') {
    const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return null;
    const nx = -dy / len * dist, ny = dx / len * dist;
    return { type: 'line', x1: shape.x1 + nx, y1: shape.y1 + ny, x2: shape.x2 + nx, y2: shape.y2 + ny };
  }
  if (shape.type === 'circle') {
    const newR = shape.r + dist;
    return newR > 0 ? { ...shapeClone(shape), r: newR } : null;
  }
  if (shape.type === 'arc') {
    const newR = shape.r + dist;
    return newR > 0 ? { ...shapeClone(shape), r: newR } : null;
  }
  return null;
}

function pointSideOfLine(line, pt) {
  const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
  return (pt.x - line.x1) * dy - (pt.y - line.y1) * dx;
}

// ──────────────────────────────────────────────
// ミラー
// ──────────────────────────────────────────────
function mirrorPoint(px, py, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return { x: px, y: py };
  const t = ((px - p1.x) * dx + (py - p1.y) * dy) / lenSq;
  const fx = p1.x + t * dx, fy = p1.y + t * dy;
  return { x: 2 * fx - px, y: 2 * fy - py };
}

function mirrorShape(shape, p1, p2) {
  const s = shapeClone(shape);
  s.id = `shape_${crypto.randomUUID()}`;
  if (s.type === 'line' || s.type === 'dim') {
    const mp1 = mirrorPoint(s.x1, s.y1, p1, p2);
    const mp2 = mirrorPoint(s.x2, s.y2, p1, p2);
    s.x1 = mp1.x; s.y1 = mp1.y; s.x2 = mp2.x; s.y2 = mp2.y;
  } else if (s.type === 'arc' || s.type === 'circle') {
    const mc = mirrorPoint(s.cx, s.cy, p1, p2);
    s.cx = mc.x; s.cy = mc.y;
  } else if (s.type === 'rect') {
    const corners = [
      mirrorPoint(s.x, s.y, p1, p2),
      mirrorPoint(s.x + s.w, s.y, p1, p2),
      mirrorPoint(s.x + s.w, s.y + s.h, p1, p2),
      mirrorPoint(s.x, s.y + s.h, p1, p2),
    ];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    s.x = Math.min(...xs); s.y = Math.min(...ys);
    s.w = Math.max(...xs) - s.x; s.h = Math.max(...ys) - s.y;
  } else if (s.type === 'text' || s.type === 'point') {
    const mp = mirrorPoint(s.x, s.y, p1, p2);
    s.x = mp.x; s.y = mp.y;
  }
  return s;
}

// ──────────────────────────────────────────────
// トリム
// ──────────────────────────────────────────────
function trimLine(line, boundaries, clickPt) {
  // 各境界との交点を見つけ、クリック点から最も近い交点でカット
  const intersections = [];
  for (const b of boundaries) {
    if (b.id === line.id) continue;
    if (b.type !== 'line') continue;
    const p = lineIntersectionUnbounded(line, b);
    if (p && p.t >= -1e-9 && p.t <= 1 + 1e-9) {
      intersections.push({ t: p.t, x: p.x, y: p.y });
    }
  }
  if (!intersections.length) return null;
  intersections.sort((a, b) => a.t - b.t);

  // クリック点がどのセグメントにあるか判断
  const lineLen = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
  const clickT = ((clickPt.x - line.x1) * (line.x2 - line.x1) + (clickPt.y - line.y1) * (line.y2 - line.y1)) / (lineLen * lineLen);

  // クリック点を囲む区間を削除
  const ts = [0, ...intersections.map((p) => p.t), 1].sort((a, b) => a - b);
  for (let i = 0; i < ts.length - 1; i++) {
    const mid = (ts[i] + ts[i + 1]) / 2;
    if (Math.abs(mid - clickT) < Math.abs(ts[i + 1] - ts[i]) / 2 + 0.01) {
      // このセグメントを削除（端を短くした2線分を返す）
      const results = [];
      if (ts[i] > 1e-9) {
        results.push({
          ...shapeClone(line), id: `shape_${crypto.randomUUID()}`,
          x2: line.x1 + ts[i] * (line.x2 - line.x1),
          y2: line.y1 + ts[i] * (line.y2 - line.y1),
        });
      }
      if (ts[i + 1] < 1 - 1e-9) {
        results.push({
          ...shapeClone(line), id: `shape_${crypto.randomUUID()}`,
          x1: line.x1 + ts[i + 1] * (line.x2 - line.x1),
          y1: line.y1 + ts[i + 1] * (line.y2 - line.y1),
        });
      }
      return results;
    }
  }
  return null;
}

// ──────────────────────────────────────────────
// fitView / redraw
// ──────────────────────────────────────────────
function fitView(targetShapes) {
  const all = targetShapes || shapes;
  if (!all.length) return;
  const xs = [], ys = [];
  for (const s of all) {
    if (s.type === 'line' || s.type === 'dim') { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    else if (s.type === 'arc' || s.type === 'circle') { xs.push(s.cx - s.r, s.cx + s.r); ys.push(s.cy - s.r, s.cy + s.r); }
    else if (s.type === 'rect') { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
    else if (s.type === 'text' || s.type === 'point') { xs.push(s.x); ys.push(s.y); }
  }
  if (!xs.length) return;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1, h = maxY - minY || 1;
  viewport.scale = Math.min((stage.width() * 0.9) / w, (stage.height() * 0.9) / h);
  viewport.x = minX - (stage.width() / viewport.scale - w) / 2;
  viewport.y = minY - (stage.height() / viewport.scale - h) / 2;
  redraw();
}

function redrawSnapMarker() {
  snapLayer.destroyChildren();
  if (!latestSnap || latestSnap.type === 'grid') { snapLayer.draw(); return; }
  const p = mmToScreen(latestSnap, viewport);
  if (latestSnap.type === 'endpoint' || latestSnap.type === 'quadrant') {
    snapLayer.add(new Konva.Rect({ x: p.x - 4, y: p.y - 4, width: 8, height: 8, stroke: '#00ff66', strokeWidth: 1 }));
  } else if (latestSnap.type === 'midpoint') {
    snapLayer.add(new Konva.Line({ points: [p.x, p.y - 5, p.x - 5, p.y + 4, p.x + 5, p.y + 4, p.x, p.y - 5], stroke: '#ffdd33', strokeWidth: 1, closed: true }));
  }
  snapLayer.draw();
}

function redraw() {
  if (gridVisible) {
    drawGrid(gridLayer, stage, viewport);
  } else {
    gridLayer.destroyChildren();
    gridLayer.draw();
  }
  drawingLayer.destroyChildren();
  for (const shape of shapes) {
    const isSelected = shape.id === selectedId || selectedIds.has(shape.id);
    drawingLayer.add(buildShapeNode(shape, viewport, { isSelected }));
  }
  if (previewShape) drawingLayer.add(buildShapeNode(previewShape, viewport, { isPreview: true }));
  drawingLayer.draw();
  redrawSnapMarker();
}

// ──────────────────────────────────────────────
// ESC / 削除
// ──────────────────────────────────────────────
function escapeCurrentTool() {
  if (textState.inputEl) { textState.inputEl.remove(); textState.inputEl = null; }
  drawingStart = null;
  previewShape = null;
  polylinePoints = [];
  moveState = null;
  copyState = null;
  rotateState = null;
  dimState = { p1: null, p2: null };
  offsetState = { dist: null, base: null };
  mirrorState = { p1: null };
  trimState = { boundaries: [], phase: 0 };
  filletState = { r: null, first: null };
  textState = { point: null, inputEl: null };
  tool = Tool.SELECT;
  toolbar.setActive(tool);
  statusbar.setTool(tool);
  statusbar.setGuide(tool, 0);
  cmdline.setLabel('コマンド:');
  redraw();
}

function deleteSelected() {
  if (!selectedId && selectedIds.size === 0) return;
  const toDelete = new Set(selectedIds);
  if (selectedId) toDelete.add(selectedId);
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (toDelete.has(shapes[i].id)) shapes.splice(i, 1);
  }
  selectedId = null;
  selectedIds.clear();
  saveHistory();
  redraw();
}

// ──────────────────────────────────────────────
// コマンドライン座標入力処理
// ──────────────────────────────────────────────
function handleCmdlineCoord(str) {
  // ツール状態に応じて座標を解釈
  if (tool === Tool.LINE) {
    if (!drawingStart) {
      const pt = handleCoordInput(str, null, null);
      if (!pt) return;
      drawingStart = pt;
      statusbar.setGuide(tool, 1);
      cmdline.setPrompt(tool, 1);
    } else {
      const pt = handleCoordInput(str, drawingStart, null);
      if (!pt) return;
      const end = orthoMode ? applyOrtho(drawingStart, pt) : pt;
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: end.x, y2: end.y });
      selectedId = id;
      drawingStart = end; // 連続入力
      saveHistory();
      redraw();
    }
  } else if (tool === Tool.RECT) {
    if (!drawingStart) {
      const pt = handleCoordInput(str, null, null);
      if (!pt) return;
      drawingStart = pt;
      statusbar.setGuide(tool, 1);
    } else {
      const pt = handleCoordInput(str, drawingStart, null);
      if (!pt) return;
      const rect = normalizeRect(drawingStart, pt);
      if (rect.w > 0 && rect.h > 0) {
        const id = `shape_${crypto.randomUUID()}`;
        shapes.push({ id, type: 'rect', ...rect });
        selectedId = id;
        saveHistory();
        redraw();
      }
      drawingStart = null;
    }
  } else if (tool === Tool.CIRCLE) {
    if (!drawingStart) {
      const pt = handleCoordInput(str, null, null);
      if (!pt) return;
      drawingStart = pt;
      statusbar.setGuide(tool, 1);
    } else {
      // 数値のみ→半径
      const num = parseFloat(str);
      if (!isNaN(num) && num > 0) {
        const id = `shape_${crypto.randomUUID()}`;
        shapes.push({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r: num });
        selectedId = id;
        drawingStart = null;
        previewShape = null;
        saveHistory();
        redraw();
        return;
      }
      const pt = handleCoordInput(str, drawingStart, null);
      if (!pt) return;
      const r = Math.hypot(pt.x - drawingStart.x, pt.y - drawingStart.y);
      if (r > 0) {
        const id = `shape_${crypto.randomUUID()}`;
        shapes.push({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r });
        selectedId = id;
        saveHistory();
        redraw();
      }
      drawingStart = null;
      previewShape = null;
    }
  } else if (tool === Tool.OFFSET) {
    if (offsetState.dist === null) {
      const num = parseFloat(str);
      if (!isNaN(num) && num > 0) {
        offsetState.dist = num;
        cmdline.setLabel(`[オフセット] 元の線をクリック (距離: ${num}mm):`);
        statusbar.setGuide(tool, 1);
        cmdline.addHistory(`オフセット距離: ${num}mm`, '#4da6ff');
      }
    }
  } else if (tool === Tool.FILLET) {
    if (filletState.r === null) {
      const num = parseFloat(str);
      if (!isNaN(num) && num >= 0) {
        filletState.r = num;
        cmdline.setLabel(`[フィレット] 1本目の線をクリック (半径: ${num}mm):`);
        statusbar.setGuide(tool, 1);
        cmdline.addHistory(`フィレット半径: ${num}mm`, '#4da6ff');
      }
    }
  } else if (tool === Tool.ROTATE && rotateState) {
    // 角度入力
    const num = parseFloat(str);
    if (!isNaN(num)) {
      const target = shapes.find((s) => s.id === selectedId);
      if (target) {
        applyRotate(target, rotateState.base, num);
        saveHistory();
        redraw();
      }
      rotateState = null;
      changeTool(Tool.SELECT);
    }
  } else if (tool === Tool.MOVE && moveState) {
    const pt = handleCoordInput(str, moveState.base, null);
    if (!pt) return;
    const target = shapes.find((s) => s.id === selectedId);
    if (target) {
      applyMove(target, pt.x - moveState.base.x, pt.y - moveState.base.y);
      saveHistory();
      redraw();
    }
    moveState = null;
    changeTool(Tool.SELECT);
  }
}

// ──────────────────────────────────────────────
// テキスト入力UI
// ──────────────────────────────────────────────
function startTextInput(mm) {
  if (textState.inputEl) { textState.inputEl.remove(); }
  const screen = mmToScreen(mm, viewport);
  const el = document.createElement('input');
  el.type = 'text';
  el.style.position = 'absolute';
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y - 20}px`;
  el.style.background = 'rgba(0,0,0,0.8)';
  el.style.color = '#ffff00';
  el.style.border = '1px solid #4da6ff';
  el.style.borderRadius = '3px';
  el.style.padding = '2px 6px';
  el.style.fontSize = `${Math.max(12, 2.5 * viewport.scale)}px`;
  el.style.fontFamily = 'monospace';
  el.style.zIndex = '100';
  el.style.minWidth = '80px';
  container.appendChild(el);
  el.focus();
  textState.point = mm;
  textState.inputEl = el;
  statusbar.setCustomGuide('文字を入力 [Enter:確定] [Esc:キャンセル]');

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = el.value.trim();
      if (text) {
        const id = `shape_${crypto.randomUUID()}`;
        shapes.push({ id, type: 'text', x: mm.x, y: mm.y, text, height: 2.5, rotation: 0, align: 0 });
        saveHistory();
        redraw();
        cmdline.addHistory(`文字追加: "${text}"`, '#4da6ff');
      }
      el.remove();
      textState.inputEl = null;
      textState.point = null;
      changeTool(Tool.SELECT);
    } else if (e.key === 'Escape') {
      el.remove();
      textState.inputEl = null;
      textState.point = null;
      escapeCurrentTool();
    }
    e.stopPropagation();
  });
}

// ──────────────────────────────────────────────
// ポリライン完成
// ──────────────────────────────────────────────
function finishPolyline(closeLoop = false) {
  if (polylinePoints.length < 2) return;
  const points = [...polylinePoints];
  if (closeLoop) points.push(points[0]);
  for (let i = 1; i < points.length; i++) {
    shapes.push({ id: `shape_${crypto.randomUUID()}`, type: 'line', x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
  }
  selectedId = null;
  saveHistory();
  polylinePoints = [];
  previewShape = null;
  redraw();
  cmdline.addHistory(`ポリライン確定 (${points.length - 1}本)`, '#4da6ff');
}

function cloneWithOffset(shape, dx, dy) {
  const c = shapeClone(shape);
  c.id = `shape_${crypto.randomUUID()}`;
  applyMove(c, dx, dy);
  return c;
}

function exportCurrentDxf() {
  if (!window.cadBridge?.saveDxf) return;
  const content = exportDxf(shapes);
  window.cadBridge.saveDxf(content);
}

// ──────────────────────────────────────────────
// マウスイベント
// ──────────────────────────────────────────────
stage.on('mousemove', () => {
  let mm = getSnap();
  statusbar.updateCursor(mm);

  if (isPanning && panStart) {
    const now = stage.getPointerPosition();
    if (!now) return;
    viewport.x -= (now.x - panStart.x) / viewport.scale;
    viewport.y -= (now.y - panStart.y) / viewport.scale;
    panStart = now;
    redraw();
    return;
  }

  // オルソ適用
  const orthoRef = drawingStart || (polylinePoints.length ? polylinePoints[polylinePoints.length - 1] : null)
    || (moveState?.base) || (copyState?.base);
  if (orthoMode && orthoRef) mm = applyOrtho(orthoRef, mm);

  if (tool === Tool.LINE && drawingStart) {
    previewShape = { type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y };
  } else if (tool === Tool.RECT && drawingStart) {
    const rect = normalizeRect(drawingStart, mm);
    previewShape = rect.w > 0 && rect.h > 0 ? { type: 'rect', ...rect } : null;
  } else if (tool === Tool.CIRCLE && drawingStart) {
    previewShape = { type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r: Math.hypot(mm.x - drawingStart.x, mm.y - drawingStart.y) };
  } else if (tool === Tool.POLYLINE && polylinePoints.length) {
    previewShape = { type: 'polyline_preview', points: [...polylinePoints, mm] };
  } else if (tool === Tool.DIM && dimState.p1 && dimState.p2) {
    const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
    const offset = dir === 'h' ? mm.y - dimState.p1.y : mm.x - dimState.p1.x;
    previewShape = { type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir };
  } else if (dragState) {
    const dx = mm.x - dragState.anchor.x, dy = mm.y - dragState.anchor.y;
    const target = shapes.find((s) => s.id === dragState.id);
    if (target) { Object.assign(target, shapeClone(dragState.original)); applyMove(target, dx, dy); }
  } else if (moveState?.base) {
    const target = shapes.find((s) => s.id === selectedId);
    if (target) { Object.assign(target, shapeClone(moveState.original)); applyMove(target, mm.x - moveState.base.x, mm.y - moveState.base.y); }
  } else if (copyState?.base) {
    if (copyState.preview) {
      const idx = shapes.findIndex((s) => s.id === copyState.preview.id);
      if (idx !== -1) shapes.splice(idx, 1);
    }
    const src = shapes.find((s) => s.id === selectedId);
    if (src) {
      copyState.preview = cloneWithOffset(src, mm.x - copyState.base.x, mm.y - copyState.base.y);
      shapes.push(copyState.preview);
    }
  }

  if (rotateState?.base && rotateState.target) {
    const angle = Math.atan2(mm.y - rotateState.base.y, mm.x - rotateState.base.x) * 180 / Math.PI;
    Object.assign(rotateState.target, shapeClone(rotateState.original));
    applyRotate(rotateState.target, rotateState.base, angle - rotateState.startAngle);
  }

  redraw();
});

stage.on('mousedown', (event) => {
  if (event.evt.button === 1) {
    const now = Date.now();
    if (!stage._lastMiddleTime || now - stage._lastMiddleTime < 400) {
      if (stage._lastMiddleTime && now - stage._lastMiddleTime < 400) { fitView(); stage._lastMiddleTime = 0; }
      else { stage._lastMiddleTime = now; isPanning = true; panStart = stage.getPointerPosition(); }
    }
    return;
  }

  let mm = getSnap();
  const orthoRef = drawingStart || (polylinePoints.length ? polylinePoints[polylinePoints.length - 1] : null)
    || moveState?.base || copyState?.base;
  if (orthoMode && orthoRef) mm = applyOrtho(orthoRef, mm);

  // ──── 各ツール処理 ────

  if (tool === Tool.SELECT) {
    const hit = pickShape(mm);
    selectedId = hit?.id || null;
    selectedIds.clear();
    dragState = hit ? { id: hit.id, anchor: mm, original: shapeClone(hit) } : null;
    statusbar.setGuide(tool, 0);
    redraw();
    return;
  }

  if (tool === Tool.LINE) {
    if (!drawingStart) {
      drawingStart = mm;
      statusbar.setGuide(tool, 1);
      cmdline.setPrompt(tool, 1);
      return;
    }
    const id = `shape_${crypto.randomUUID()}`;
    shapes.push({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y });
    selectedId = id;
    drawingStart = mm; // 連続作図
    saveHistory();
    redraw();
    return;
  }

  if (tool === Tool.CIRCLE) {
    if (!drawingStart) { drawingStart = mm; statusbar.setGuide(tool, 1); return; }
    const r = Math.hypot(mm.x - drawingStart.x, mm.y - drawingStart.y);
    if (r > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r });
      selectedId = id;
      saveHistory();
    }
    drawingStart = null; previewShape = null; redraw();
    return;
  }

  if (tool === Tool.POLYLINE) {
    if (!polylinePoints.length) { polylinePoints.push(mm); statusbar.setGuide(tool, 1); return; }
    if (Math.hypot(mm.x - polylinePoints[0].x, mm.y - polylinePoints[0].y) < 6 / viewport.scale && polylinePoints.length > 2) {
      finishPolyline(true); return;
    }
    polylinePoints.push(mm);
    redraw();
    return;
  }

  if (tool === Tool.DIM) {
    if (!dimState.p1) { dimState.p1 = mm; statusbar.setGuide(tool, 1); return; }
    if (!dimState.p2) { dimState.p2 = mm; statusbar.setGuide(tool, 2); return; }
    const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
    const offset = dir === 'h' ? mm.y - dimState.p1.y : mm.x - dimState.p1.x;
    shapes.push({ id: `shape_${crypto.randomUUID()}`, type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir });
    dimState = { p1: null, p2: null }; previewShape = null;
    saveHistory(); redraw();
    return;
  }

  if (tool === Tool.TEXT) {
    startTextInput(mm);
    return;
  }

  if (tool === Tool.MOVE) {
    if (!selectedId) return;
    if (!moveState) {
      const target = shapes.find((s) => s.id === selectedId);
      if (!target) return;
      moveState = { base: mm, original: shapeClone(target) };
      statusbar.setGuide(tool, 1);
      return;
    }
    saveHistory();
    moveState = null;
    changeTool(Tool.SELECT);
    return;
  }

  if (tool === Tool.COPY) {
    if (!selectedId) return;
    if (!copyState) {
      copyState = { base: mm, preview: null };
      statusbar.setGuide(tool, 1);
      return;
    }
    // コピー確定（preview が shapes にある）
    if (copyState.preview) {
      copyState.preview.id = `shape_${crypto.randomUUID()}`;
      copyState.preview = null;
    }
    saveHistory();
    copyState = { base: mm, preview: null }; // 連続コピー
    return;
  }

  if (tool === Tool.ROTATE) {
    if (!selectedId) return;
    if (!rotateState) {
      const target = shapes.find((s) => s.id === selectedId);
      if (!target) return;
      const startAngle = Math.atan2(mm.y - mm.y, mm.x - mm.x) * 180 / Math.PI;
      rotateState = { base: mm, target, original: shapeClone(target), startAngle };
      statusbar.setGuide(tool, 1);
      return;
    }
    rotateState = null;
    changeTool(Tool.SELECT);
    saveHistory(); redraw();
    return;
  }

  if (tool === Tool.OFFSET) {
    if (offsetState.dist === null) {
      cmdline.addHistory('先に距離を入力してEnterを押してください', '#ff6666');
      return;
    }
    if (!offsetState.base) {
      const hit = pickShape(mm);
      if (!hit) return;
      offsetState.base = hit;
      statusbar.setGuide(tool, 2);
      cmdline.setLabel(`[オフセット] 方向をクリック:`);
      redraw();
      return;
    }
    // 方向クリック → オフセット実行
    const side = pointSideOfLine(offsetState.base, mm);
    const dist = side >= 0 ? offsetState.dist : -offsetState.dist;
    const newShape = offsetShape(offsetState.base, dist);
    if (newShape) {
      newShape.id = `shape_${crypto.randomUUID()}`;
      shapes.push(newShape);
      saveHistory();
      cmdline.addHistory(`オフセット完了 (${offsetState.dist}mm)`, '#4da6ff');
    }
    offsetState.base = null;
    statusbar.setGuide(tool, 1);
    cmdline.setLabel(`[オフセット] 元の線をクリック (距離: ${offsetState.dist}mm):`);
    redraw();
    return;
  }

  if (tool === Tool.MIRROR) {
    if (!selectedId) { cmdline.addHistory('先に図形を選択してください', '#ff6666'); return; }
    if (!mirrorState.p1) {
      mirrorState.p1 = mm;
      statusbar.setGuide(tool, 1);
      return;
    }
    // 鏡像実行
    const src = shapes.find((s) => s.id === selectedId);
    if (src) {
      const mirrored = mirrorShape(src, mirrorState.p1, mm);
      shapes.push(mirrored);
      saveHistory();
      cmdline.addHistory('鏡像完了', '#4da6ff');
    }
    mirrorState.p1 = null;
    changeTool(Tool.SELECT);
    return;
  }

  if (tool === Tool.TRIM) {
    if (trimState.phase === 0) {
      const hit = pickShape(mm);
      if (hit && hit.type === 'line') {
        trimState.boundaries.push(hit);
        selectedIds.add(hit.id);
        cmdline.addHistory(`境界: ${trimState.boundaries.length}本選択`, '#8aa8c0');
        redraw();
      }
      return;
    }
    if (trimState.phase === 1) {
      const hit = pickShape(mm);
      if (!hit || hit.type !== 'line') return;
      const result = trimLine(hit, trimState.boundaries, mm);
      if (result !== null) {
        const idx = shapes.findIndex((s) => s.id === hit.id);
        if (idx !== -1) {
          shapes.splice(idx, 1, ...result);
          saveHistory();
          cmdline.addHistory('トリム完了', '#4da6ff');
        }
      }
      redraw();
      return;
    }
    return;
  }

  if (tool === Tool.FILLET) {
    if (filletState.r === null) {
      cmdline.addHistory('先に半径を入力してEnterを押してください', '#ff6666');
      return;
    }
    if (!filletState.first) {
      const hit = pickShape(mm);
      if (hit && hit.type === 'line') {
        filletState.first = hit;
        statusbar.setGuide(tool, 2);
        cmdline.setLabel('[フィレット] 2本目の線をクリック:');
        selectedId = hit.id;
        redraw();
      }
      return;
    }
    const hit = pickShape(mm);
    if (!hit || hit.type !== 'line' || hit.id === filletState.first.id) return;
    const l1 = filletState.first, l2 = hit;
    if (filletState.r === 0) {
      // 直角コーナー（延長/トリムで交点まで）
      const inter = lineIntersectionUnbounded(l1, l2);
      if (inter) {
        const idx1 = shapes.findIndex((s) => s.id === l1.id);
        const idx2 = shapes.findIndex((s) => s.id === l2.id);
        const newL1 = shapeClone(l1);
        const newL2 = shapeClone(l2);
        // t=0→p1, t=1→p2。クリック点に近い端を交点に移動
        const t1 = inter.t;
        if (t1 < 0.5) { newL1.x1 = inter.x; newL1.y1 = inter.y; }
        else { newL1.x2 = inter.x; newL1.y2 = inter.y; }
        const t2inter = lineIntersectionUnbounded(l2, l1);
        if (t2inter) {
          if (t2inter.t < 0.5) { newL2.x1 = t2inter.x; newL2.y1 = t2inter.y; }
          else { newL2.x2 = t2inter.x; newL2.y2 = t2inter.y; }
        }
        if (idx1 !== -1) shapes[idx1] = newL1;
        if (idx2 !== -1) shapes[idx2] = newL2;
        saveHistory();
        cmdline.addHistory('フィレット（直角）完了', '#4da6ff');
      }
    }
    filletState = { r: filletState.r, first: null };
    statusbar.setGuide(tool, 1);
    cmdline.setLabel(`[フィレット] 1本目の線をクリック (半径: ${filletState.r}mm):`);
    redraw();
    return;
  }

  if (tool === Tool.RECT) drawingStart = mm;
});

stage.on('mouseup', (event) => {
  if (event.evt.button === 1) { isPanning = false; panStart = null; return; }
  if (tool === Tool.RECT && drawingStart) {
    let mm = getSnap();
    if (orthoMode) mm = applyOrtho(drawingStart, mm);
    const rect = normalizeRect(drawingStart, mm);
    if (rect.w > 0 && rect.h > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push({ id, type: 'rect', ...rect });
      selectedId = id;
      saveHistory();
    }
    drawingStart = null; previewShape = null; redraw();
    return;
  }
  if (dragState) { saveHistory(); dragState = null; }
});

stage.on('contextmenu', (event) => {
  event.evt.preventDefault();
  if (tool === Tool.POLYLINE) finishPolyline(false);
  else if (tool === Tool.LINE) {
    drawingStart = null; previewShape = null;
    changeTool(Tool.SELECT);
  } else if (tool === Tool.COPY) {
    if (copyState?.preview) {
      const idx = shapes.findIndex((s) => s.id === copyState.preview.id);
      if (idx !== -1) shapes.splice(idx, 1);
      copyState.preview = null;
    }
    copyState = null;
    changeTool(Tool.SELECT);
  }
});

stage.on('wheel', (event) => {
  event.evt.preventDefault();
  const pointer = stage.getPointerPosition();
  if (!pointer) return;
  const before = screenToMm(pointer, viewport);
  const direction = event.evt.deltaY > 0 ? -1 : 1;
  viewport.scale = Math.max(0.001, Math.min(200, viewport.scale * (direction > 0 ? 1.25 : 1 / 1.25)));
  viewport.x = before.x - pointer.x / viewport.scale;
  viewport.y = before.y - pointer.y / viewport.scale;
  redraw();
});

// ──────────────────────────────────────────────
// キーボードイベント
// ──────────────────────────────────────────────
document.addEventListener('keydown', (event) => {
  const key = event.key;
  const lKey = key.toLowerCase();
  const tag = document.activeElement?.tagName;
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

  // Ctrl + キー (どこでも有効)
  if (event.ctrlKey || event.metaKey) {
    if (lKey === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
    if (lKey === 'y' || (lKey === 'z' && event.shiftKey)) { event.preventDefault(); redo(); return; }
    if (lKey === 's') { event.preventDefault(); exportCurrentDxf(); return; }
    if (lKey === 'c' && selectedId) {
      const t = shapes.find((s) => s.id === selectedId);
      if (t) clipboard = shapeClone(t);
      return;
    }
    if (lKey === 'v' && clipboard) {
      const pasted = cloneWithOffset(clipboard, 10, 10);
      shapes.push(pasted);
      selectedId = pasted.id;
      saveHistory();
      redraw();
      return;
    }
    return;
  }

  if (inInput) return; // テキスト入力中はここ以降スキップ

  // Escape
  if (key === 'Escape') { escapeCurrentTool(); return; }

  // Delete
  if (key === 'Delete' && (selectedId || selectedIds.size > 0)) {
    deleteSelected();
    return;
  }

  // Enter（ポリライン確定 / トリムフェーズ切替）
  if (key === 'Enter') {
    if (tool === Tool.POLYLINE) { finishPolyline(false); return; }
    if (tool === Tool.TRIM && trimState.phase === 0) {
      trimState.phase = 1;
      selectedIds.clear();
      cmdline.addHistory('切断する部分をクリック [Esc:終了]', '#8aa8c0');
      statusbar.setGuide(tool, 1);
      redraw();
      return;
    }
    return;
  }

  // C キー（ポリライン閉じる）
  if (lKey === 'c' && tool === Tool.POLYLINE) { finishPolyline(true); return; }

  // F8: オルソ切替
  if (key === 'F8') { orthoMode = statusbar.toggleOrtho(); return; }
  // F7: グリッド切替
  if (key === 'F7') { gridVisible = statusbar.toggleGrid(); redraw(); return; }
  // F9: スナップ切替
  if (key === 'F9') { snapMode = statusbar.toggleSnap(); return; }

  // ショートカットキー（ツール切替）
  if (lKey === 'f' && !event.shiftKey) { fitView(); return; }
  if (lKey === 'm' && selectedId) { changeTool(Tool.MOVE); return; }
  if (lKey === 'r' && selectedId) { changeTool(Tool.ROTATE); return; }

  // ZA: 全体表示
  if (document._lastKey === 'z' && lKey === 'a') { fitView(); document._lastKey = ''; return; }
  document._lastKey = lKey;
});

// ──────────────────────────────────────────────
// リサイズ
// ──────────────────────────────────────────────
window.addEventListener('resize', () => {
  stage.width(container.clientWidth);
  stage.height(container.clientHeight);
  redraw();
});

// ──────────────────────────────────────────────
// ファイル操作
// ──────────────────────────────────────────────
async function openCadFile() {
  if (!window.cadBridge?.openFile) return;
  try {
    const result = await window.cadBridge.openFile();
    if (!result || result.canceled) return;
    const ext = result.filePath.split('.').pop()?.toLowerCase();
    let imported = [];

    if (ext === 'dxf') {
      imported = dxfEntitiesToShapes(parseDxf(decodeDxfBase64(result.base64)));
    } else if (ext === 'jww' || ext === 'jwc') {
      imported = result.isBinary && result.base64
        ? jwwEntitiesToShapes(parseJwwBinary(result.base64))
        : jwwEntitiesToShapes(parseJww(result.content));
    }

    if (!imported.length) {
      cmdline.addHistory('図形が見つかりませんでした', '#ff6666');
      return;
    }
    for (const shape of imported) shapes.push({ id: `shape_${crypto.randomUUID()}`, ...shape });
    selectedId = null;
    saveHistory();
    fitView();
    cmdline.addHistory(`ファイル読み込み: ${imported.length}個の図形`, '#4da6ff');
  } catch (error) {
    console.error('ファイル読み込みエラー', error);
    cmdline.addHistory(`エラー: ${error.message}`, '#ff6666');
  }
}

// ──────────────────────────────────────────────
// 初期描画
// ──────────────────────────────────────────────
redraw();
