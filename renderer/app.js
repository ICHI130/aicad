import { createKonvaCanvas, drawGrid, mmToScreen, screenToMm } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { findSnapPoint } from './cad/snap.js';
import { parseDxf, dxfEntitiesToShapes, exportDxf } from './io/dxf.js';
import { parseJww, parseJwwBinary, jwwEntitiesToShapes } from './io/jww.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';
import { initCommandLine } from './ui/commandline.js';
import { parseAiDrawCommand } from './ai/commandSchema.js';
import { buildPreviewShape } from './cad/interaction.js';
import { DEFAULT_LAYER_COLOR } from './cad/colors.js';
import { initLayerPanel } from './ui/layerpanel.js';
import { initI18n } from './ui/i18n.js';
import { initPropertyPanel } from './ui/propertypanel.js';
import { initDynInput } from './ui/dyninput.js';
import { getDimStyle, setDimStyle } from './ui/dimstyle.js';

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


function parseRectSizeInput(str, start) {
  const match = str.trim().match(/^@([\-\d.]+),([\-\d.]+)$/);
  if (!match || !start) return null;
  const w = parseFloat(match[1]);
  const h = parseFloat(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { x: start.x + w, y: start.y + h };
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


function angleFromCenter(center, point) {
  const deg = Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI;
  return (deg + 360) % 360;
}

function arcFromThreePoints(p1, p2, p3) {
  const ax = p1.x; const ay = p1.y;
  const bx = p2.x; const by = p2.y;
  const cx = p3.x; const cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-8) return null;

  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;

  const center = { x: ux, y: uy };
  const r = Math.hypot(ax - ux, ay - uy);
  if (!isFinite(r) || r <= 1e-6) return null;

  const a1 = angleFromCenter(center, p1);
  const a2 = angleFromCenter(center, p2);
  const a3 = angleFromCenter(center, p3);

  const ccwContainsMid = ((a2 - a1 + 360) % 360) <= ((a3 - a1 + 360) % 360);
  let startAngle = a1;
  let endAngle = a3;
  if (!ccwContainsMid) {
    startAngle = a3;
    endAngle = a1;
  }

  return { type: 'arc', cx: center.x, cy: center.y, r, startAngle, endAngle };
}

initI18n();

// ──────────────────────────────────────────────
// Konva キャンバス
// ──────────────────────────────────────────────
const container = document.getElementById('cad-root');
const { stage, gridLayer, drawingLayer, snapLayer } = createKonvaCanvas(container);

const viewport = { x: 0, y: 0, scale: 1 };
const shapes = [];
const layers = [{ id: 'default', name: 'default', visible: true, locked: false, color: DEFAULT_LAYER_COLOR, linetype: 'CONTINUOUS', linewidth: 0.25 }];
let currentLayerId = 'default';
const LAYER_STATE_STORAGE_KEY = 'aicad:layer-state:v1';

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
let scaleState = null;
let arcState = { p1: null, p2: null };
let ellipseState = { center: null, rx: null };
let arrayState = { base: null, source: null, count: 4 };
let dimState = { p1: null, p2: null, circle: null, mode: 'linear' };
let mleaderState = { p1: null, p2: null, text: '' };
let latestSnap = { x: 0, y: 0, type: 'grid' };
let lastNonSelectTool = Tool.LINE;

// オフセット状態
let offsetState = { dist: null, base: null };
// ミラー状態
let mirrorState = { p1: null };
// トリム状態
let trimState = { boundaries: [], phase: 0 };
let extendState = { boundaries: [], phase: 0 };
let breakState = { shapeId: null, pt1: null };
let lengthenState = { delta: null };
let chamferState = { d1: null, d2: null, first: null };
// フィレット状態
let filletState = { r: null, first: null };
// テキスト入力状態
let textState = { point: null, inputEl: null };

let orthoMode = false;
let snapMode = true;
let gridVisible = true;
let rightClickMode = 'autocad_like';
let oneShotSnapMode = null;
let shiftRightSnapMenu = null;

const persistentSnapModes = new Set(['endpoint', 'midpoint', 'intersection', 'quadrant', 'center']);

try {
  rightClickMode = localStorage.getItem('cad.rightClickMode') || 'autocad_like';
} catch {
  rightClickMode = 'autocad_like';
}

// 矩形選択状態
let boxSelectStart = null; // スクリーン座標
let isBoxSelecting = false;

// ホイール中ボタンパン状態（安定版）
let middleDown = false;
let middleDownTime = 0;

// グリップ編集状態
let gripState = null; // { shapeId, gripIndex } or null

const history = [];
let historyIndex = -1;
const auditTrail = [];
const MAX_AUDIT = 120;
const MAX_HISTORY = 50;



function initDimStyleControls() {
  const textHeight = document.getElementById('dim-text-height');
  const arrowSize = document.getElementById('dim-arrow-size');
  const unit = document.getElementById('dim-unit');
  const precision = document.getElementById('dim-precision');
  if (!textHeight || !arrowSize || !unit || !precision) return;

  const style = getDimStyle();
  textHeight.value = String(style.textHeight);
  arrowSize.value = String(style.arrowSize);
  unit.value = style.unit;
  precision.value = String(style.precision);

  const apply = () => {
    const next = {
      textHeight: Math.max(0.5, parseFloat(textHeight.value) || style.textHeight),
      arrowSize: Math.max(0.5, parseFloat(arrowSize.value) || style.arrowSize),
      unit: unit.value || style.unit,
      precision: Math.max(0, Math.min(4, parseInt(precision.value, 10) || 0)),
    };
    setDimStyle(next);
    redraw();
  };

  textHeight.addEventListener('input', apply);
  arrowSize.addEventListener('input', apply);
  unit.addEventListener('change', apply);
  precision.addEventListener('change', apply);
}

function normalizeLayerId(raw) {
  return String(raw || '').trim().replace(/\s+/g, '_').toLowerCase();
}

function getLayer(layerId) {
  return layers.find((l) => l.id === layerId);
}

function ensureLayer(layerId, name = layerId) {
  const id = normalizeLayerId(layerId) || 'default';
  let layer = getLayer(id);
  if (!layer) {
    layer = { id, name: String(name || id), visible: true, locked: false, color: DEFAULT_LAYER_COLOR, linetype: 'CONTINUOUS', linewidth: 0.25 };
    layers.push(layer);
  }
  return layer;
}

function getShapeLayerId(shape) {
  const fallback = currentLayerId || 'default';
  const layerId = normalizeLayerId(shape.layerId || fallback) || 'default';
  ensureLayer(layerId, layerId);
  if (!shape.layerId) shape.layerId = layerId;
  return layerId;
}

function isLayerVisible(shape) {
  const layer = getLayer(getShapeLayerId(shape));
  return layer ? layer.visible !== false : true;
}

function isLayerLocked(shape) {
  const layer = getLayer(getShapeLayerId(shape));
  return layer ? layer.locked === true : false;
}

function assignCurrentLayer(shape) {
  const sourceLayer = shape.layerId || shape.layer || currentLayerId;
  const layer = ensureLayer(sourceLayer, sourceLayer);
  return { ...shape, layerId: layer.id };
}

function saveLayerState() {
  const payload = {
    currentLayerId,
    layers: layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      color: layer.color || DEFAULT_LAYER_COLOR,
      linetype: layer.linetype || 'CONTINUOUS',
      linewidth: Number(layer.linewidth ?? 0.25),
    })),
  };
  localStorage.setItem(LAYER_STATE_STORAGE_KEY, JSON.stringify(payload));
}

function loadLayerState() {
  const raw = localStorage.getItem(LAYER_STATE_STORAGE_KEY);
  if (!raw) return false;

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || !Array.isArray(parsed.layers)) return false;

  layers.length = 0;
  for (const row of parsed.layers) {
    const id = normalizeLayerId(row.id || row.name);
    if (!id) continue;
    layers.push({
      id,
      name: String(row.name || id),
      visible: row.visible !== false,
      locked: row.locked === true,
      color: String(row.color || DEFAULT_LAYER_COLOR),
      linetype: String(row.linetype || 'CONTINUOUS'),
      linewidth: Math.max(0.05, Number(row.linewidth ?? 0.25) || 0.25),
    });
  }

  if (!layers.length) {
    layers.push({ id: 'default', name: 'default', visible: true, locked: false, color: DEFAULT_LAYER_COLOR, linetype: 'CONTINUOUS', linewidth: 0.25 });
  }

  const loadedCurrent = normalizeLayerId(parsed.currentLayerId || 'default');
  currentLayerId = getLayer(loadedCurrent)?.id || layers[0].id;
  return true;
}


loadLayerState();

// ──────────────────────────────────────────────
// 履歴管理
// ──────────────────────────────────────────────
function saveHistory() {
  const prev = history[historyIndex] || [];
  const next = JSON.parse(JSON.stringify(shapes));
  pushAuditEntry(prev, next);
  history.splice(historyIndex + 1);
  history.push(next);
  if (history.length > MAX_HISTORY) history.shift();
  historyIndex = history.length - 1;
}

function pushAuditEntry(prevShapes, nextShapes) {
  const diff = buildShapeDiff(prevShapes, nextShapes);
  if (!diff.added && !diff.removed && !diff.changed) return;
  auditTrail.push({
    ts: new Date().toISOString(),
    ...diff,
  });
  if (auditTrail.length > MAX_AUDIT) auditTrail.shift();
}

function buildShapeDiff(prevShapes, nextShapes) {
  const prevById = new Map(prevShapes.map((shape) => [shape.id, shape]));
  const nextById = new Map(nextShapes.map((shape) => [shape.id, shape]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  const types = {};

  for (const shape of nextShapes) {
    if (!prevById.has(shape.id)) {
      added += 1;
      types[shape.type] = (types[shape.type] || 0) + 1;
      continue;
    }
    const prev = prevById.get(shape.id);
    if (JSON.stringify(prev) !== JSON.stringify(shape)) {
      changed += 1;
      types[shape.type] = (types[shape.type] || 0) + 1;
    }
  }

  for (const shape of prevShapes) {
    if (!nextById.has(shape.id)) {
      removed += 1;
      types[shape.type] = (types[shape.type] || 0) + 1;
    }
  }

  const changedByType = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');

  return { added, removed, changed, changedByType };
}

function showAuditTrail() {
  if (!auditTrail.length) {
    cmdline.addHistory('監査ログ: 変更履歴はまだありません', '#8aa8c0');
    return;
  }
  cmdline.addHistory('監査ログ（新しい順）', '#8aa8c0');
  const recent = auditTrail.slice(-5).reverse();
  for (const entry of recent) {
    const time = entry.ts.slice(11, 19);
    cmdline.addHistory(`${time} +${entry.added} / -${entry.removed} / ~${entry.changed} [${entry.changedByType || 'n/a'}]`, '#8aa8c0');
  }
}

function showLastHistoryDiff() {
  if (historyIndex <= 0) {
    cmdline.addHistory('直前差分: 比較対象がありません', '#8aa8c0');
    return;
  }
  const prev = history[historyIndex - 1] || [];
  const curr = history[historyIndex] || [];
  const diff = buildShapeDiff(prev, curr);
  cmdline.addHistory(`直前差分 +${diff.added} / -${diff.removed} / ~${diff.changed} [${diff.changedByType || 'n/a'}]`, '#8aa8c0');
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
  if (nextTool && nextTool !== Tool.SELECT) lastNonSelectTool = nextTool;
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
  scaleState = null;
  arcState = { p1: null, p2: null };
  ellipseState = { center: null, rx: null };
  arrayState = { base: null, source: null, count: 4 };
  dimState = { p1: null, p2: null, circle: null, mode: 'linear' };
  mleaderState = { p1: null, p2: null, text: '' };
  ellipseState = { center: null, rx: null };
  offsetState = { dist: null, base: null };
  mirrorState = { p1: null };
  trimState = { boundaries: [], phase: 0 };
  extendState = { boundaries: [], phase: 0 };
  breakState = { shapeId: null, pt1: null };
  lengthenState = { delta: null };
  chamferState = { d1: null, d2: null, first: null };
  filletState = { r: null, first: null };
  textState = { point: null, inputEl: null };
  toolbar.setActive(tool);
  statusbar.setTool(tool);
  statusbar.setGuide(tool, 0);
  cmdline.setActiveTool(tool);
  redraw();

  // ツール別の初期メッセージ
  if (tool === Tool.OFFSET) {
    cmdline.setLabel('[オフセット] 距離を入力 [Enter]:');
    statusbar.setCustomGuide('オフセット距離を入力してEnter');
  } else if (tool === Tool.LENGTHEN) {
    cmdline.setLabel('[長さ変更] 増減長さを入力 [Enter]:');
    statusbar.setCustomGuide('長さ変更量を入力して線分端をクリック');
  } else if (tool === Tool.CHAMFER) {
    cmdline.setLabel('[面取り] 距離を入力 [Enter] (d または d1,d2):');
    statusbar.setCustomGuide('面取り距離を入力して2線を選択');
  } else if (tool === Tool.FILLET) {
    cmdline.setLabel('[フィレット] 半径を入力 [Enter] (0=直角):');
    statusbar.setCustomGuide('フィレット半径を入力してEnter');
  } else if (tool === Tool.SCALE) {
    cmdline.setLabel('[尺度変更] 基点をクリック:');
    statusbar.setCustomGuide('基点をクリックして尺度変更を開始');
  } else if (tool === Tool.EXTEND) {
    cmdline.setLabel('[延長] 境界をクリック [Enterで次へ]:');
    statusbar.setCustomGuide('延長先となる境界線を選択');
  } else if (tool === Tool.ARRAY) {
    cmdline.setLabel('[配列複写] 基点をクリック:');
    statusbar.setCustomGuide('配列複写の基点をクリック');
  } else if (tool === Tool.HATCH) {
    cmdline.setLabel('[ハッチ] 境界(矩形/円)をクリック:');
    statusbar.setCustomGuide('境界をクリックしてハッチ作成');
  } else if (tool === Tool.JOIN) {
    runJoinCommand();
    changeTool(Tool.SELECT);
    return;
  } else if (tool === Tool.EXPLODE) {
    runExplodeCommand();
    changeTool(Tool.SELECT);
    return;
  }
}

// ──────────────────────────────────────────────
// UI初期化
// ──────────────────────────────────────────────
const toolbar = initToolbar({
  onChangeTool: changeTool,
  onOpenFile: openCadFile,
  onExportDxf: exportCurrentDxf,
  onPrint: printCurrentViewAsPdf,
  onUndo: undo,
  onRedo: redo,
  onFitView: () => fitView(),
});
toolbar.setActive(tool);



const propertyPanel = initPropertyPanel({
  getSelection() {
    const ids = selectedId ? [selectedId] : [...selectedIds];
    return shapes.filter((shape) => ids.includes(shape.id));
  },
  getLayers: () => layers,
  onApply(ids, patch) {
    for (const shape of shapes) {
      if (!ids.includes(shape.id)) continue;
      Object.assign(shape, patch);
      ensureLayer(shape.layerId || currentLayerId, shape.layerId || currentLayerId);
    }
    saveHistory();
    redraw();
    propertyPanel.refresh();
  },
});

const layerPanel = initLayerPanel({
  getLayers: () => layers,
  getCurrentLayerId: () => currentLayerId,
  onSelectLayer(layerId) {
    const layer = ensureLayer(layerId, layerId);
    currentLayerId = layer.id;
  },
  onCreateLayer(name) {
    const id = normalizeLayerId(name);
    if (!id) return;
    const layer = ensureLayer(id, name);
    currentLayerId = layer.id;
    redraw();
    layerPanel.refresh();
  },
  onToggleLayerVisible(layerId) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    if (!layer.visible && selectedId) {
      const selected = shapes.find((shape) => shape.id === selectedId);
      if (selected && getShapeLayerId(selected) === layer.id) selectedId = null;
    }
    redraw();
    layerPanel.refresh();
  },
  onToggleLayerLocked(layerId) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.locked = !layer.locked;
    redraw();
    layerPanel.refresh();
  },
  onUpdateLayerColor(layerId, color) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.color = color;
    redraw();
    layerPanel.refresh();
  },
  onUpdateLayerLinetype(layerId, linetype) {
    const layer = getLayer(layerId);
    if (!layer) return;
    layer.linetype = linetype;
    redraw();
    layerPanel.refresh();
  },
  onUpdateLayerLinewidth(layerId, linewidth) {
    const layer = getLayer(layerId);
    if (!layer) return;
    const parsed = Number(linewidth);
    layer.linewidth = Math.max(0.05, Number.isFinite(parsed) ? parsed : 0.25);
    redraw();
    layerPanel.refresh();
  },
  onSaveLayerState() {
    saveLayerState();
    cmdline.addHistory('レイヤー状態を保存', '#8aa8c0');
  },
  onLoadLayerState() {
    if (!loadLayerState()) {
      cmdline.addHistory('保存済みレイヤー状態がありません', '#cc7777');
      return;
    }
    redraw();
    layerPanel.refresh();
    cmdline.addHistory('レイヤー状態を読込', '#8aa8c0');
  },
});

const statusbar = initStatusbar({
  onOrthoChange(on) { orthoMode = on; },
  onSnapChange(on) { snapMode = on; },
  onGridChange(on) { gridVisible = on; redraw(); },
});
statusbar.setTool(tool);
statusbar.setGuide(tool, 0);
const dynInput = initDynInput();

if (window.cadBridge?.onMenuOpenFile) window.cadBridge.onMenuOpenFile(() => openCadFile());
if (window.cadBridge?.onMenuPrint) window.cadBridge.onMenuPrint(() => printCurrentViewAsPdf());

const cmdline = initCommandLine({
  onToolChange(toolId) {
    changeTool(toolId);
  },
  onCoordInput(str) {
    handleCmdlineCoord(str);
  },
  onOptionInput({ toolId, option }) {
    return handleCommandOption(toolId, option);
  },
  onSpecialCommand(cmd) {
    if (cmd === 'escape') escapeCurrentTool();
    else if (cmd === 'undo') undo();
    else if (cmd === 'redo') redo();
    else if (cmd === 'zoomAll') fitView();
    else if (cmd === 'erase') deleteSelected();
    else if (cmd === 'print') printCurrentViewAsPdf();
    else if (cmd === 'audit') showAuditTrail();
    else if (cmd === 'compare') showLastHistoryDiff();
  },
});
cmdline.setActiveTool(tool);

initDimStyleControls();

initSidebar({
  getDrawingContext() {
    const elements = shapes.map((s) => {
      const layer = getShapeLayerId(s);
      if (s.type === 'line') return { id: s.id, type: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer };
      if (s.type === 'arc') return { id: s.id, type: 'arc', cx: s.cx, cy: s.cy, r: s.r, startAngle: s.startAngle, endAngle: s.endAngle, layer };
      if (s.type === 'circle') return { id: s.id, type: 'circle', cx: s.cx, cy: s.cy, r: s.r, layer };
      if (s.type === 'ellipse') return { id: s.id, type: 'ellipse', cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry, rotation: s.rotation || 0, layer };
      if (s.type === 'text') return { id: s.id, type: 'text', x: s.x, y: s.y, text: s.text, height: s.height, rotation: s.rotation, layer };
      if (s.type === 'point') return { id: s.id, type: 'point', x: s.x, y: s.y, layer };
      if (s.type === 'dim' && s.dimType === 'radius') return { id: s.id, type: 'dim', dimType: 'radius', cx: s.cx, cy: s.cy, r: s.r, px: s.px, py: s.py, layer };
      if (s.type === 'dim' && s.dimType === 'diameter') return { id: s.id, type: 'dim', dimType: 'diameter', cx: s.cx, cy: s.cy, r: s.r, layer };
      if (s.type === 'dim') return { id: s.id, type: 'dim', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer };
      if (s.type === 'hatch') return { id: s.id, type: 'hatch', hatchKind: s.hatchKind, x: s.x, y: s.y, w: s.w, h: s.h, cx: s.cx, cy: s.cy, r: s.r, layer };
      return { id: s.id, type: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, layer };
    });
    return { layers: layers.map((layer) => ({ name: layer.name, visible: layer.visible, locked: layer.locked })), elements, selected: selectedId ? [selectedId] : [], bbox: computeBoundingBox(elements) };
  },
  onAiResponse(result) {
    // AI応答からJSON描画指示を抽出
    executeAiDraw(result?.text || '');
  },
});

// ──────────────────────────────────────────────
// AI自動作図
// ──────────────────────────────────────────────
function executeAiDraw(text) {
  const parsed = parseAiDrawCommand(text);
  if (!parsed.ok) {
    if (!/no valid JSON payload found/.test(parsed.reason)) {
      cmdline.addHistory(`AIコマンド無効: ${parsed.reason}`, '#ff6666');
    }
    return;
  }

  const command = parsed.command;

  if (command.action === 'draw') {
    for (const s of command.shapes) {
      shapes.push(assignCurrentLayer({ id: `shape_${crypto.randomUUID()}`, ...s }));
    }
    saveHistory();
    fitView();
    redraw();
    cmdline.addHistory(`AI作図: ${command.shapes.length}個の図形を追加`, '#4da6ff');
    return;
  }

  if (command.action === 'mutate') {
    let changed = 0;

    for (const op of command.operations) {
      if (op.type === 'add') {
        shapes.push(assignCurrentLayer({ id: `shape_${crypto.randomUUID()}`, ...op.shape }));
        changed += 1;
        continue;
      }

      const targetIndex = shapes.findIndex((s) => s.id === op.id);
      if (targetIndex < 0) continue;

      if (op.type === 'delete') {
        shapes.splice(targetIndex, 1);
        changed += 1;
      } else if (op.type === 'update') {
        const current = shapes[targetIndex];
        if (!current) continue;
        const next = { ...current, ...op.patch, id: current.id, type: current.type };
        shapes[targetIndex] = next;
        changed += 1;
      }
    }

    if (changed > 0) {
      saveHistory();
      fitView();
      redraw();
      cmdline.addHistory(`AI編集: ${changed}件の変更を適用`, '#4da6ff');
    } else {
      cmdline.addHistory('AI編集: 適用対象が見つかりませんでした', '#ffbb66');
    }
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
    else if (e.type === 'ellipse') { xs.push(e.cx - e.rx, e.cx + e.rx); ys.push(e.cy - e.ry, e.cy + e.ry); }
    else if (e.type === 'text' || e.type === 'point') { xs.push(e.x); ys.push(e.y); }
    else if (e.type === 'dim' && e.dimType === 'radius') { xs.push(e.cx, e.px); ys.push(e.cy, e.py); }
    else if (e.type === 'dim' && e.dimType === 'diameter') { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
    else if (e.type === 'dim') { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
    else if (e.type === 'hatch') {
      if (e.hatchKind === 'circle') { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
      else { xs.push(e.x, e.x + e.w); ys.push(e.y, e.y + e.h); }
    }
    else { xs.push(e.x, e.x + e.w); ys.push(e.y, e.y + e.h); }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function pointerToMm() {
  const pointer = stage.getPointerPosition();
  if (!pointer) return { x: 0, y: 0 };
  return screenToMm(pointer, viewport);
}

function getActiveSnapModes() {
  if (oneShotSnapMode) return [oneShotSnapMode];
  return [...persistentSnapModes];
}

function consumeOneShotSnap() {
  if (!oneShotSnapMode) return;
  const consumed = oneShotSnapMode;
  oneShotSnapMode = null;
  cmdline.addHistory(`一時OSNAP消費: ${consumed.toUpperCase()}`, '#8aa8c0');
}

function hideShiftRightSnapMenu() {
  if (shiftRightSnapMenu) shiftRightSnapMenu.style.display = 'none';
}

function showShiftRightSnapMenu(clientX, clientY) {
  if (!shiftRightSnapMenu) {
    shiftRightSnapMenu = document.createElement('div');
    shiftRightSnapMenu.style.position = 'fixed';
    shiftRightSnapMenu.style.zIndex = '9999';
    shiftRightSnapMenu.style.background = 'rgba(20, 20, 20, 0.95)';
    shiftRightSnapMenu.style.border = '1px solid #4da6ff';
    shiftRightSnapMenu.style.borderRadius = '6px';
    shiftRightSnapMenu.style.padding = '6px';
    shiftRightSnapMenu.style.minWidth = '180px';
    shiftRightSnapMenu.style.boxShadow = '0 2px 12px rgba(0,0,0,0.35)';
    container.appendChild(shiftRightSnapMenu);
  }

  const defs = [
    { id: 'endpoint', label: 'Endpoint (端点)' },
    { id: 'midpoint', label: 'Midpoint (中点)' },
    { id: 'intersection', label: 'Intersection (交点)' },
    { id: 'center', label: 'Center (中心)' },
    { id: 'perpendicular', label: 'Perpendicular (垂線)' },
    { id: 'tangent', label: 'Tangent (接線)' },
    { id: 'nearest', label: 'Nearest (最近点)' },
  ];

  shiftRightSnapMenu.innerHTML = '';
  for (const def of defs) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = def.label;
    item.style.display = 'block';
    item.style.width = '100%';
    item.style.margin = '2px 0';
    item.style.padding = '4px 6px';
    item.style.textAlign = 'left';
    item.style.background = 'transparent';
    item.style.color = '#d8e8ff';
    item.style.border = '1px solid #333';
    item.style.borderRadius = '4px';
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
      oneShotSnapMode = def.id;
      statusbar.setCustomGuide(`一時OSNAP: ${def.label}（次クリックのみ有効）`);
      cmdline.addHistory(`一時OSNAP: ${def.label}`, '#8aa8c0');
      hideShiftRightSnapMenu();
    });
    shiftRightSnapMenu.appendChild(item);
  }

  shiftRightSnapMenu.style.left = `${clientX}px`;
  shiftRightSnapMenu.style.top = `${clientY}px`;
  shiftRightSnapMenu.style.display = 'block';
}

function getSnap() {
  const raw = pointerToMm();
  if (!snapMode) {
    latestSnap = { x: raw.x, y: raw.y, type: 'grid' };
    return { x: raw.x, y: raw.y };
  }
  latestSnap = findSnapPoint(raw, shapes, viewport, { enabledTypes: getActiveSnapModes() });
  return { x: latestSnap.x, y: latestSnap.y };
}

function pickShape(mmPoint) {
  const threshold = 12 / viewport.scale;
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    const s = shapes[i];
    if (!isLayerVisible(s) || isLayerLocked(s)) continue;
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
    if (s.type === 'ellipse') {
      const nx = (mmPoint.x - s.cx) / Math.max(s.rx, 1e-9);
      const ny = (mmPoint.y - s.cy) / Math.max(s.ry, 1e-9);
      if (Math.abs(nx * nx + ny * ny - 1) <= 0.12) return s;
      continue;
    }
    if (s.type === 'mleader') {
      const d1 = distancePointToSegment(mmPoint, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      const d2 = distancePointToSegment(mmPoint, { x: s.x2, y: s.y2 }, { x: s.x3, y: s.y3 });
      if (Math.min(d1, d2) <= threshold) return s;
      continue;
    }
    if (s.type === 'text') {
      const approxW = s.text.length * (s.height || 2.5) * 0.7;
      if (mmPoint.x >= s.x - threshold && mmPoint.x <= s.x + approxW + threshold && mmPoint.y >= s.y - (s.height || 2.5) - threshold && mmPoint.y <= s.y + threshold) return s;
      continue;
    }
    if (s.type === 'point') {
      if (Math.hypot(mmPoint.x - s.x, mmPoint.y - s.y) <= threshold * 2) return s;
      continue;
    }
    if (s.type === 'hatch') {
      if (s.hatchKind === 'circle') {
        if (Math.hypot(mmPoint.x - s.cx, mmPoint.y - s.cy) <= s.r + threshold) return s;
      } else if (mmPoint.x >= s.x && mmPoint.x <= s.x + s.w && mmPoint.y >= s.y && mmPoint.y <= s.y + s.h) {
        return s;
      }
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

function getSelectionIds() {
  const ids = new Set(selectedIds);
  if (selectedId) ids.add(selectedId);
  return ids;
}

function getSelectedShapes() {
  const ids = getSelectionIds();
  if (!ids.size) return [];
  return shapes.filter((shape) => ids.has(shape.id));
}

function copySelectionToClipboard() {
  const targets = getSelectedShapes();
  if (!targets.length) return false;

  clipboard = {
    items: targets.map((shape) => shapeClone(shape)),
    pasteCount: 0,
  };
  return true;
}

function pasteClipboard() {
  if (!clipboard?.items?.length) return 0;
  clipboard.pasteCount = (clipboard.pasteCount || 0) + 1;
  const offset = 10 * clipboard.pasteCount;
  const pastedIds = [];

  for (const item of clipboard.items) {
    const pasted = shapeClone(item);
    pasted.id = `shape_${crypto.randomUUID()}`;
    applyMove(pasted, offset, offset);
    shapes.push(pasted);
    pastedIds.push(pasted.id);
  }

  selectedId = null;
  selectedIds = new Set(pastedIds);
  if (pastedIds.length === 1) {
    selectedId = pastedIds[0];
    selectedIds.clear();
  }
  saveHistory();
  redraw();
  return pastedIds.length;
}

function pointsNear(a, b, eps = 1e-6) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function runJoinCommand() {
  const lines = getSelectedShapes().filter((shape) => shape.type === 'line');
  if (lines.length < 2) {
    cmdline.addHistory('JOIN: 2本の線を選択してください', '#ff6666');
    return;
  }
  if (lines.length > 2) {
    cmdline.addHistory('JOIN: 現在は2本の線のみ対応しています', '#ff6666');
    return;
  }

  const [a, b] = lines;
  const a1 = { x: a.x1, y: a.y1 }, a2 = { x: a.x2, y: a.y2 };
  const b1 = { x: b.x1, y: b.y1 }, b2 = { x: b.x2, y: b.y2 };

  let start = null;
  let end = null;
  if (pointsNear(a1, b1)) { start = a2; end = b2; }
  else if (pointsNear(a1, b2)) { start = a2; end = b1; }
  else if (pointsNear(a2, b1)) { start = a1; end = b2; }
  else if (pointsNear(a2, b2)) { start = a1; end = b1; }

  if (!start || !end) {
    cmdline.addHistory('JOIN: 端点が接続している線を選択してください', '#ff6666');
    return;
  }

  const removeIds = new Set([a.id, b.id]);
  for (let i = shapes.length - 1; i >= 0; i -= 1) {
    if (removeIds.has(shapes[i].id)) shapes.splice(i, 1);
  }

  const joined = assignCurrentLayer({
    id: `shape_${crypto.randomUUID()}`,
    type: 'line',
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    layerId: a.layerId,
  });

  shapes.push(joined);
  selectedId = joined.id;
  selectedIds.clear();
  saveHistory();
  redraw();
  cmdline.addHistory('JOIN: 2本の線を結合しました', '#4da6ff');
}

function explodeShape(shape) {
  if (shape.type === 'rect') {
    return [
      { type: 'line', x1: shape.x, y1: shape.y, x2: shape.x + shape.w, y2: shape.y },
      { type: 'line', x1: shape.x + shape.w, y1: shape.y, x2: shape.x + shape.w, y2: shape.y + shape.h },
      { type: 'line', x1: shape.x + shape.w, y1: shape.y + shape.h, x2: shape.x, y2: shape.y + shape.h },
      { type: 'line', x1: shape.x, y1: shape.y + shape.h, x2: shape.x, y2: shape.y },
    ];
  }
  if (shape.type === 'hatch') {
    if (shape.hatchKind === 'rect') return [{ type: 'rect', x: shape.x, y: shape.y, w: shape.w, h: shape.h }];
    if (shape.hatchKind === 'circle') return [{ type: 'circle', cx: shape.cx, cy: shape.cy, r: shape.r }];
  }
  return null;
}

function runExplodeCommand() {
  const targets = getSelectedShapes();
  if (!targets.length) {
    cmdline.addHistory('EXPLODE: 図形を選択してください', '#ff6666');
    return;
  }

  let changed = 0;
  const newSelection = [];
  for (const target of targets) {
    const fragments = explodeShape(target);
    if (!fragments || !fragments.length) continue;
    const idx = shapes.findIndex((shape) => shape.id === target.id);
    if (idx === -1) continue;
    const inserts = fragments.map((fragment) => assignCurrentLayer({
      ...fragment,
      id: `shape_${crypto.randomUUID()}`,
      layerId: target.layerId,
    }));
    shapes.splice(idx, 1, ...inserts);
    changed += 1;
    for (const ins of inserts) newSelection.push(ins.id);
  }

  if (!changed) {
    cmdline.addHistory('EXPLODE: 分解できる図形（矩形/ハッチ）を選択してください', '#ff6666');
    return;
  }

  selectedId = null;
  selectedIds = new Set(newSelection);
  if (newSelection.length === 1) {
    selectedId = newSelection[0];
    selectedIds.clear();
  }
  saveHistory();
  redraw();
  cmdline.addHistory(`EXPLODE: ${changed}個の図形を分解しました`, '#4da6ff');
}

function applyMove(shape, dx, dy) {
  if (shape.type === 'rect') { shape.x += dx; shape.y += dy; return; }
  if (shape.type === 'line') { shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy; return; }
  if (shape.type === 'dim') {
    if (shape.dimType === 'radius') { shape.cx += dx; shape.cy += dy; shape.px += dx; shape.py += dy; return; }
    if (shape.dimType === 'diameter') { shape.cx += dx; shape.cy += dy; return; }
    shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy;
    return;
  }
  if (shape.type === 'arc' || shape.type === 'circle' || shape.type === 'ellipse') { shape.cx += dx; shape.cy += dy; return; }
  if (shape.type === 'mleader') {
    shape.x1 += dx; shape.y1 += dy;
    shape.x2 += dx; shape.y2 += dy;
    shape.x3 += dx; shape.y3 += dy;
    return;
  }
  if (shape.type === 'text' || shape.type === 'point') { shape.x += dx; shape.y += dy; return; }
  if (shape.type === 'hatch') {
    if (shape.hatchKind === 'circle') { shape.cx += dx; shape.cy += dy; }
    else { shape.x += dx; shape.y += dy; }
  }
}

function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return { x: cx + (px - cx) * cos - (py - cy) * sin, y: cy + (px - cx) * sin + (py - cy) * cos };
}

function applyRotate(shape, center, angleDeg) {
  if (shape.type === 'line' || (shape.type === 'dim' && !shape.dimType)) {
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
  } else if (shape.type === 'dim' && shape.dimType === 'radius') {
    const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
    const p = rotatePoint(shape.px, shape.py, center.x, center.y, angleDeg);
    shape.cx = c.x; shape.cy = c.y; shape.px = p.x; shape.py = p.y;
  } else if (shape.type === 'dim' && shape.dimType === 'diameter') {
    const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
    shape.cx = c.x; shape.cy = c.y;
  } else if (shape.type === 'arc' || shape.type === 'circle' || shape.type === 'ellipse') {
    const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
    shape.cx = c.x; shape.cy = c.y;
    if (shape.type === 'arc') { shape.startAngle += angleDeg; shape.endAngle += angleDeg; }
  } else if (shape.type === 'hatch') {
    if (shape.hatchKind === 'circle') {
      const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
      shape.cx = c.x; shape.cy = c.y;
    } else {
      const p = rotatePoint(shape.x, shape.y, center.x, center.y, angleDeg);
      shape.x = p.x; shape.y = p.y;
    }
  } else if (shape.type === 'text' || shape.type === 'point') {
    const p = rotatePoint(shape.x, shape.y, center.x, center.y, angleDeg);
    shape.x = p.x; shape.y = p.y;
    if (shape.type === 'text') shape.rotation = (shape.rotation || 0) + angleDeg;
  }
}

function applyScale(shape, base, ratio) {
  if (!isFinite(ratio) || ratio <= 0) return;
  const scalePoint = (x, y) => ({ x: base.x + (x - base.x) * ratio, y: base.y + (y - base.y) * ratio });
  if (shape.type === 'line' || (shape.type === 'dim' && !shape.dimType)) {
    const p1 = scalePoint(shape.x1, shape.y1);
    const p2 = scalePoint(shape.x2, shape.y2);
    shape.x1 = p1.x; shape.y1 = p1.y; shape.x2 = p2.x; shape.y2 = p2.y;
    if (shape.type === 'dim' && shape.offset) shape.offset *= ratio;
    return;
  }
  if (shape.type === 'rect') {
    const p = scalePoint(shape.x, shape.y);
    shape.x = p.x;
    shape.y = p.y;
    shape.w *= ratio;
    shape.h *= ratio;
    return;
  }
  if (shape.type === 'dim' && shape.dimType === 'radius') {
    const c = scalePoint(shape.cx, shape.cy);
    const p = scalePoint(shape.px, shape.py);
    shape.cx = c.x; shape.cy = c.y; shape.px = p.x; shape.py = p.y; shape.r *= ratio;
    return;
  }
  if (shape.type === 'dim' && shape.dimType === 'diameter') {
    const c = scalePoint(shape.cx, shape.cy);
    shape.cx = c.x; shape.cy = c.y; shape.r *= ratio;
    return;
  }
  if (shape.type === 'arc' || shape.type === 'circle') {
    const c = scalePoint(shape.cx, shape.cy);
    shape.cx = c.x;
    shape.cy = c.y;
    shape.r *= ratio;
    return;
  }
  if (shape.type === 'ellipse') {
    const c = scalePoint(shape.cx, shape.cy);
    shape.cx = c.x;
    shape.cy = c.y;
    shape.rx *= ratio;
    shape.ry *= ratio;
    return;
  }
  if (shape.type === 'text') {
    const p = scalePoint(shape.x, shape.y);
    shape.x = p.x;
    shape.y = p.y;
    shape.height = Math.max(0.1, (shape.height || 2.5) * ratio);
    return;
  }
  if (shape.type === 'point') {
    const p = scalePoint(shape.x, shape.y);
    shape.x = p.x;
    shape.y = p.y;
    return;
  }
  if (shape.type === 'hatch') {
    if (shape.hatchKind === 'circle') {
      const c = scalePoint(shape.cx, shape.cy);
      shape.cx = c.x; shape.cy = c.y; shape.r *= ratio;
    } else {
      const p = scalePoint(shape.x, shape.y);
      shape.x = p.x; shape.y = p.y; shape.w *= ratio; shape.h *= ratio;
    }
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
  if (s.type === 'line' || (s.type === 'dim' && !s.dimType)) {
    const mp1 = mirrorPoint(s.x1, s.y1, p1, p2);
    const mp2 = mirrorPoint(s.x2, s.y2, p1, p2);
    s.x1 = mp1.x; s.y1 = mp1.y; s.x2 = mp2.x; s.y2 = mp2.y;
  } else if (s.type === 'dim' && s.dimType === 'radius') {
    const mc = mirrorPoint(s.cx, s.cy, p1, p2);
    const mp = mirrorPoint(s.px, s.py, p1, p2);
    s.cx = mc.x; s.cy = mc.y; s.px = mp.x; s.py = mp.y;
  } else if (s.type === 'dim' && s.dimType === 'diameter') {
    const mc = mirrorPoint(s.cx, s.cy, p1, p2);
    s.cx = mc.x; s.cy = mc.y;
  } else if (s.type === 'arc' || s.type === 'circle' || s.type === 'ellipse') {
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



function extendLine(line, boundaries, clickPt) {
  const dirX = line.x2 - line.x1;
  const dirY = line.y2 - line.y1;
  if (Math.hypot(dirX, dirY) < 1e-9) return null;

  const intersections = [];
  for (const b of boundaries) {
    if (b.id === line.id || b.type !== 'line') continue;
    const p = lineIntersectionUnbounded(line, b);
    if (p) intersections.push(p);
  }
  if (!intersections.length) return null;

  const nearP1 = Math.hypot(clickPt.x - line.x1, clickPt.y - line.y1)
    <= Math.hypot(clickPt.x - line.x2, clickPt.y - line.y2);
  const baseT = nearP1 ? 0 : 1;

  let candidate = null;
  for (const inter of intersections) {
    if (nearP1 && inter.t >= baseT - 1e-9) continue;
    if (!nearP1 && inter.t <= baseT + 1e-9) continue;
    if (!candidate || Math.abs(inter.t - baseT) < Math.abs(candidate.t - baseT)) {
      candidate = inter;
    }
  }
  if (!candidate) return null;

  if (nearP1) return { x1: candidate.x, y1: candidate.y };
  return { x2: candidate.x, y2: candidate.y };
}

// ──────────────────────────────────────────────
// fitView / redraw
// ──────────────────────────────────────────────
function fitView(targetShapes) {
  const all = targetShapes || shapes;
  if (!all.length) return;
  const xs = [], ys = [];
  for (const s of all) {
    if (s.type === 'line' || (s.type === 'dim' && !s.dimType)) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    else if (s.type === 'arc' || s.type === 'circle') { xs.push(s.cx - s.r, s.cx + s.r); ys.push(s.cy - s.r, s.cy + s.r); }
    else if (s.type === 'rect') { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
    else if (s.type === 'hatch') {
      if (s.hatchKind === 'circle') { xs.push(s.cx - s.r, s.cx + s.r); ys.push(s.cy - s.r, s.cy + s.r); }
      else { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
    }
    else if (s.type === 'text' || s.type === 'point') { xs.push(s.x); ys.push(s.y); }
    else if (s.type === 'mleader') { xs.push(s.x1, s.x2, s.x3); ys.push(s.y1, s.y2, s.y3); }
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
  // グリップ描画（選択中の図形）
  if (selectedId) {
    const sel = shapes.find((s) => s.id === selectedId);
    if (sel) drawGrips(sel);
  }
  if (!latestSnap || latestSnap.type === 'grid') { snapLayer.draw(); return; }
  const p = mmToScreen(latestSnap, viewport);
  if (latestSnap.type === 'endpoint' || latestSnap.type === 'quadrant') {
    snapLayer.add(new Konva.Rect({ x: p.x - 4, y: p.y - 4, width: 8, height: 8, stroke: '#00ff66', strokeWidth: 1 }));
  } else if (latestSnap.type === 'midpoint') {
    snapLayer.add(new Konva.Line({ points: [p.x, p.y - 5, p.x - 5, p.y + 4, p.x + 5, p.y + 4, p.x, p.y - 5], stroke: '#ffdd33', strokeWidth: 1, closed: true }));
  } else if (latestSnap.type === 'intersection') {
    snapLayer.add(new Konva.Line({ points: [p.x - 5, p.y - 5, p.x + 5, p.y + 5], stroke: '#66ccff', strokeWidth: 1 }));
    snapLayer.add(new Konva.Line({ points: [p.x + 5, p.y - 5, p.x - 5, p.y + 5], stroke: '#66ccff', strokeWidth: 1 }));
  } else if (latestSnap.type === 'center') {
    snapLayer.add(new Konva.Circle({ x: p.x, y: p.y, radius: 5, stroke: '#bb88ff', strokeWidth: 1 }));
    snapLayer.add(new Konva.Line({ points: [p.x - 6, p.y, p.x + 6, p.y], stroke: '#bb88ff', strokeWidth: 1 }));
    snapLayer.add(new Konva.Line({ points: [p.x, p.y - 6, p.x, p.y + 6], stroke: '#bb88ff', strokeWidth: 1 }));
  } else if (latestSnap.type === 'perpendicular') {
    snapLayer.add(new Konva.Line({ points: [p.x - 6, p.y + 4, p.x - 6, p.y - 4, p.x + 6, p.y - 4], stroke: '#ff9966', strokeWidth: 1 }));
  } else if (latestSnap.type === 'tangent') {
    snapLayer.add(new Konva.Circle({ x: p.x, y: p.y, radius: 4, stroke: '#ff66aa', strokeWidth: 1 }));
    snapLayer.add(new Konva.Line({ points: [p.x - 6, p.y + 6, p.x + 6, p.y - 6], stroke: '#ff66aa', strokeWidth: 1 }));
  } else if (latestSnap.type === 'nearest') {
    snapLayer.add(new Konva.Circle({ x: p.x, y: p.y, radius: 3, fill: '#66ffaa', stroke: '#66ffaa' }));
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
    if (!isLayerVisible(shape)) continue;
    const isSelected = shape.id === selectedId || selectedIds.has(shape.id);
    const layer = getLayer(getShapeLayerId(shape));
    drawingLayer.add(buildShapeNode(shape, viewport, { isSelected, layerStyle: layer }));
  }
  if (previewShape) drawingLayer.add(buildShapeNode(previewShape, viewport, { isPreview: true }));
  drawingLayer.draw();
  redrawSnapMarker();
  propertyPanel.refresh();
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
  scaleState = null;
  arcState = { p1: null, p2: null };
  ellipseState = { center: null, rx: null };
  arrayState = { base: null, source: null, count: 4 };
  dimState = { p1: null, p2: null, circle: null, mode: 'linear' };
  mleaderState = { p1: null, p2: null, text: '' };
  offsetState = { dist: null, base: null };
  mirrorState = { p1: null };
  trimState = { boundaries: [], phase: 0 };
  extendState = { boundaries: [], phase: 0 };
  breakState = { shapeId: null, pt1: null };
  lengthenState = { delta: null };
  chamferState = { d1: null, d2: null, first: null };
  filletState = { r: null, first: null };
  textState = { point: null, inputEl: null };
  tool = Tool.SELECT;
  toolbar.setActive(tool);
  statusbar.setTool(tool);
  statusbar.setGuide(tool, 0);
  cmdline.setActiveTool(tool);
  cmdline.setLabel('コマンド:');
  dynInput.hide();
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
function handleCommandOption(toolId, option) {
  if (toolId === Tool.POLYLINE) {
    if (option === 'close') {
      if (polylinePoints.length > 2) {
        finishPolyline(true);
        return true;
      }
      return false;
    }
    if (option === 'undo') {
      if (polylinePoints.length > 1) {
        polylinePoints.pop();
        statusbar.setGuide(tool, polylinePoints.length ? 1 : 0);
        redraw();
        return true;
      }
      return false;
    }
  }

  if (toolId === Tool.TRIM && option === 'all' && trimState.phase === 0) {
    trimState.boundaries = [];
    trimState.phase = 1;
    cmdline.addHistory('境界: 全図形を対象', '#8aa8c0');
    cmdline.addHistory('切断する部分をクリック [Esc:終了]', '#8aa8c0');
    cmdline.setPrompt(tool, 1);
    statusbar.setCustomGuide('切断する側をクリック（Escで終了）');
    redraw();
    return true;
  }

  if (toolId === Tool.EXTEND && option === 'all' && extendState.phase === 0) {
    extendState.boundaries = [];
    extendState.phase = 1;
    cmdline.addHistory('境界: 全図形を対象', '#8aa8c0');
    cmdline.addHistory('延長する線をクリック [Esc:終了]', '#8aa8c0');
    cmdline.setPrompt(tool, 1);
    statusbar.setCustomGuide('延長する側をクリック（Escで終了）');
    redraw();
    return true;
  }

  if (toolId === Tool.DIM && dimState.mode !== option && ['linear', 'radius', 'diameter'].includes(option)) {
    dimState = { p1: null, p2: null, circle: null, mode: option };
    if (option === 'radius') cmdline.setLabel('[寸法] 半径寸法: 円をクリック');
    else if (option === 'diameter') cmdline.setLabel('[寸法] 直径寸法: 円をクリック');
    else cmdline.setLabel('[寸法] 線形寸法: 始点をクリック');
    statusbar.setGuide(Tool.DIM, 0);
    redraw();
    return true;
  }

  return false;
}

function handleCmdlineCoord(str) {
  // ツール状態に応じて座標を解釈
  if (tool === Tool.DIM) {
    const mode = str.trim().toLowerCase();
    if (mode === 'r') {
      dimState = { p1: null, p2: null, circle: null, mode: 'radius' };
      cmdline.setLabel('[寸法] 半径寸法: 円をクリック');
      return;
    }
    if (mode === 'd') {
      dimState = { p1: null, p2: null, circle: null, mode: 'diameter' };
      cmdline.setLabel('[寸法] 直径寸法: 円をクリック');
      return;
    }
    if (mode === '' || mode === 'l') {
      dimState = { p1: null, p2: null, circle: null, mode: 'linear' };
      cmdline.setLabel('[寸法] 線形寸法: 始点をクリック');
      return;
    }
  }

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
      shapes.push(assignCurrentLayer({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: end.x, y2: end.y }));
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
      const sizePt = parseRectSizeInput(str, drawingStart);
      const pt = sizePt || handleCoordInput(str, drawingStart, null);
      if (!pt) return;
      const rect = normalizeRect(drawingStart, pt);
      if (rect.w > 0 && rect.h > 0) {
        const id = `shape_${crypto.randomUUID()}`;
        shapes.push(assignCurrentLayer({ id, type: 'rect', ...rect }));
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
        shapes.push(assignCurrentLayer({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r: num }));
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
        shapes.push(assignCurrentLayer({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r }));
        selectedId = id;
        saveHistory();
        redraw();
      }
      drawingStart = null;
      previewShape = null;
    }

  } else if (tool === Tool.ELLIPSE) {
    const pt = handleCoordInput(str, null, null);
    if (!pt) return;
    if (!ellipseState.center) {
      ellipseState.center = pt;
      statusbar.setGuide(tool, 1);
      return;
    }
    if (ellipseState.rx === null) {
      ellipseState.rx = Math.abs(pt.x - ellipseState.center.x);
      statusbar.setGuide(tool, 2);
      return;
    }
    const ry = Math.abs(pt.y - ellipseState.center.y);
    if (ellipseState.rx > 0 && ry > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push(assignCurrentLayer({ id, type: 'ellipse', cx: ellipseState.center.x, cy: ellipseState.center.y, rx: ellipseState.rx, ry, rotation: 0 }));
      selectedId = id;
      saveHistory();
      redraw();
    }
    ellipseState = { center: null, rx: null };
    previewShape = null;


  } else if (tool === Tool.ARC) {
    const pt = handleCoordInput(str, null, null);
    if (!pt) return;
    if (!arcState.p1) {
      arcState.p1 = pt;
      statusbar.setGuide(tool, 1);
      cmdline.setPrompt(tool, 1);
    } else if (!arcState.p2) {
      arcState.p2 = pt;
      statusbar.setGuide(tool, 2);
      cmdline.setPrompt(tool, 2);
    } else {
      const arc = arcFromThreePoints(arcState.p1, arcState.p2, pt);
      if (!arc) return;
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push(assignCurrentLayer({ id, ...arc }));
      selectedId = id;
      arcState = { p1: null, p2: null };
      saveHistory();
      redraw();
      cmdline.setPrompt(tool, 0);
    }
  } else if (tool === Tool.BREAK) {
    cmdline.setLabel('[ブレーク] 切断する線をクリック:');
    statusbar.setCustomGuide('切断する線を選択');
  } else if (tool === Tool.LENGTHEN || tool === Tool.CHAMFER) {
    cmdline.setLabel('[長さ変更] 増減長さを入力 [Enter]:');
    statusbar.setCustomGuide('長さ変更量を入力して線分端をクリック');
  } else if (tool === Tool.CHAMFER) {
    cmdline.setLabel('[面取り] 距離を入力 [Enter] (d または d1,d2):');
    statusbar.setCustomGuide('面取り距離を入力して2線を選択');
  } else if (tool === Tool.ARRAY) {
    if (!selectedId) return;
    const src = shapes.find((shape) => shape.id === selectedId);
    if (!src) return;

    const count = parseInt(str, 10);
    if (!isNaN(count) && count >= 2) {
      arrayState.count = Math.min(100, count);
      cmdline.addHistory(`配列個数: ${arrayState.count}`, '#8aa8c0');
      return;
    }

    const pt = handleCoordInput(str, arrayState.base || null, arrayState.base || null);
    if (!pt) return;
    if (!arrayState.base) {
      arrayState.base = pt;
      arrayState.source = shapeClone(src);
      statusbar.setGuide(tool, 1);
      cmdline.setLabel(`[配列複写] 方向点をクリック (個数: ${arrayState.count}):`);
      return;
    }

    const dx = pt.x - arrayState.base.x;
    const dy = pt.y - arrayState.base.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    for (let i = 1; i < arrayState.count; i += 1) {
      shapes.push(cloneWithOffset(src, dx * i, dy * i));
    }
    saveHistory();
    redraw();
    arrayState = { base: null, source: null, count: arrayState.count };
    statusbar.setGuide(tool, 0);
    return;
  } else if (tool === Tool.HATCH) {
    const hit = pickShape(pointerToMm());
    const hatch = createHatchFromBoundary(hit);
    if (!hatch) return;
    const id = `shape_${crypto.randomUUID()}`;
    shapes.push(assignCurrentLayer({ id, ...hatch }));
    selectedId = id;
    saveHistory();
    redraw();
    return;
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
  } else if (tool === Tool.LENGTHEN || tool === Tool.CHAMFER) {
    const num = parseFloat(str);
    if (!isNaN(num) && num !== 0) {
      lengthenState.delta = num;
      cmdline.setLabel(`[長さ変更] 線分端をクリック (Δ${num}mm):`);
      statusbar.setGuide(tool, 1);
    }
  } else if (tool === Tool.CHAMFER) {
    const parts = str.split(',').map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));
    if (parts.length === 1 && parts[0] > 0) {
      chamferState.d1 = parts[0];
      chamferState.d2 = parts[0];
    } else if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
      chamferState.d1 = parts[0];
      chamferState.d2 = parts[1];
    }
    if (chamferState.d1 !== null && chamferState.d2 !== null) {
      cmdline.setLabel(`[面取り] 1本目の線をクリック (d1=${chamferState.d1}, d2=${chamferState.d2})`);
      statusbar.setGuide(tool, 1);
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

function undoPolylineVertex() {
  if (!polylinePoints.length) return false;
  polylinePoints.pop();
  previewShape = null;
  redraw();

  if (polylinePoints.length === 0) {
    statusbar.setGuide(tool, 0);
    cmdline.addHistory('ポリライン: 始点を取り消しました', '#8aa8c0');
    return true;
  }

  statusbar.setGuide(tool, 1);
  cmdline.addHistory(`ポリライン: 頂点を取り消し (${polylinePoints.length}点)`, '#8aa8c0');
  return true;
}

function cloneWithOffset(shape, dx, dy) {
  const c = shapeClone(shape);
  c.id = `shape_${crypto.randomUUID()}`;
  applyMove(c, dx, dy);
  return c;
}

async function printCurrentViewAsPdf() {
  if (!window.cadBridge?.printPdf) return;
  const landscape = window.confirm('印刷方向を選択してください。OK=横向き / Cancel=縦向き');
  try {
    const result = await window.cadBridge.printPdf({ landscape });
    if (!result?.canceled) cmdline.addHistory(`PDF保存: ${result.filePath}`, '#4da6ff');
  } catch (error) {
    cmdline.addHistory(`印刷エラー: ${error.message}`, '#ff6666');
  }
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
  const activeModesText = oneShotSnapMode ? `TEMP:${oneShotSnapMode.toUpperCase()}` : [...persistentSnapModes].map((m) => m.slice(0, 3).toUpperCase()).join(',');
  statusbar.updateCursor(mm, latestSnap?.type || 'grid', snapMode, activeModesText);
  const pointer = stage.getPointerPosition();

  if (isPanning && panStart) {
    const now = stage.getPointerPosition();
    if (!now) return;
    viewport.x -= (now.x - panStart.x) / viewport.scale;
    viewport.y -= (now.y - panStart.y) / viewport.scale;
    panStart = now;
    redraw();
    return;
  }

  // グリップドラッグ
  if (gripState) {
    const shape = shapes.find((s) => s.id === gripState.shapeId);
    if (shape) {
      applyGripMove(shape, gripState.gripIndex, mm);
      redraw();
    }
    return;
  }

  // 矩形選択ビジュアル更新（窓=青実線 / 交差=緑破線）
  if (isBoxSelecting && boxSelectStart) {
    const pos = stage.getPointerPosition();
    if (pos) {
      const selRect = document.getElementById('select-rect');
      if (selRect) {
        const x0 = Math.min(boxSelectStart.x, pos.x);
        const y0 = Math.min(boxSelectStart.y, pos.y);
        const w = Math.abs(pos.x - boxSelectStart.x);
        const h = Math.abs(pos.y - boxSelectStart.y);
        // 右→左ドラッグ = 交差選択（緑破線）
        const isCrossing = pos.x < boxSelectStart.x;
        selRect.style.border = isCrossing ? '1px dashed #00cc44' : '1px solid #4da6ff';
        selRect.style.background = isCrossing ? 'rgba(0,204,68,0.05)' : 'rgba(77,166,255,0.06)';
        selRect.style.display = 'block';
        selRect.style.left = `${x0}px`;
        selRect.style.top = `${y0}px`;
        selRect.style.width = `${w}px`;
        selRect.style.height = `${h}px`;
      }
    }
    return;
  }

  // オルソ適用
  const orthoRef = drawingStart || (polylinePoints.length ? polylinePoints[polylinePoints.length - 1] : null)
    || (moveState?.base) || (copyState?.base) || (scaleState?.base) || (arrayState?.base);
  if (orthoMode && orthoRef) mm = applyOrtho(orthoRef, mm);

  if (pointer && ((tool === Tool.LINE || tool === Tool.RECT || tool === Tool.CIRCLE) && drawingStart
    || (tool === Tool.ELLIPSE && ellipseState.center)) ) {
    const from = tool === Tool.ELLIPSE ? ellipseState.center : drawingStart;
    dynInput.update(pointer.x, pointer.y, from, mm);
  } else {
    dynInput.hide();
  }

  previewShape = buildPreviewShape({
    tool,
    drawingStart,
    point: mm,
    polylinePoints,
    dimState,
    mleaderState,
    arcState,
    ellipseState,
    arrayState,
    normalizeRect,
    arcFromThreePoints,
    cloneWithOffset,
  });

  if (dragState) {
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

  if (scaleState?.base && scaleState.target) {
    const fromBase = Math.hypot(scaleState.ref.x - scaleState.base.x, scaleState.ref.y - scaleState.base.y);
    const toNow = Math.hypot(mm.x - scaleState.base.x, mm.y - scaleState.base.y);
    const ratio = fromBase > 1e-9 ? Math.max(0.001, toNow / fromBase) : 1;
    Object.assign(scaleState.target, shapeClone(scaleState.original));
    applyScale(scaleState.target, scaleState.base, ratio);
  }

  redraw();
});

stage.on('mousedown', (event) => {
  // ──── ホイール中ボタン（パン / ダブルクリックで全体表示） ────
  if (event.evt.button === 1) {
    event.evt.preventDefault();
    const now = Date.now();
    if (now - middleDownTime < 300) {
      // ダブルクリック → 全体表示
      fitView();
      middleDownTime = 0;
      middleDown = false;
    } else {
      middleDown = true;
      middleDownTime = now;
      isPanning = true;
      panStart = stage.getPointerPosition();
    }
    return;
  }

  let mm = getSnap();
  const orthoRef = drawingStart || (polylinePoints.length ? polylinePoints[polylinePoints.length - 1] : null)
    || moveState?.base || copyState?.base || scaleState?.base || arrayState?.base;
  if (orthoMode && orthoRef) mm = applyOrtho(orthoRef, mm);
  consumeOneShotSnap();

  // ──── 各ツール処理 ────

  if (tool === Tool.SELECT) {
    const pos = stage.getPointerPosition();

    // グリップヒットテスト（図形選択中のみ）
    const gripIdx = hitTestGrip(pos);
    if (gripIdx !== null) {
      gripState = { shapeId: selectedId, gripIndex: gripIdx };
      redraw();
      return;
    }

    const hit = pickShape(mm);
    if (hit) {
      // 図形をクリック → 選択
      selectedId = hit.id;
      selectedIds.clear();
      dragState = { id: hit.id, anchor: mm, original: shapeClone(hit) };
    } else {
      // 空白クリック → 矩形選択開始
      selectedId = null;
      selectedIds.clear();
      dragState = null;
      boxSelectStart = pos;
      isBoxSelecting = true;
    }
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
    shapes.push(assignCurrentLayer({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y }));
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
      shapes.push(assignCurrentLayer({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r }));
      selectedId = id;
      saveHistory();
    }
    drawingStart = null; previewShape = null; redraw();
    dynInput.hide();
    return;
  }


  if (tool === Tool.ELLIPSE) {
    if (!ellipseState.center) {
      ellipseState.center = mm;
      statusbar.setGuide(tool, 1);
      return;
    }
    if (ellipseState.rx === null) {
      ellipseState.rx = Math.abs(mm.x - ellipseState.center.x);
      statusbar.setGuide(tool, 2);
      return;
    }
    const ry = Math.abs(mm.y - ellipseState.center.y);
    if (ellipseState.rx > 0 && ry > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push(assignCurrentLayer({ id, type: 'ellipse', cx: ellipseState.center.x, cy: ellipseState.center.y, rx: ellipseState.rx, ry, rotation: 0 }));
      selectedId = id;
      saveHistory();
    }
    ellipseState = { center: null, rx: null };
    previewShape = null;
    redraw();
    return;
  }


  if (tool === Tool.ARC) {
    if (!arcState.p1) {
      arcState.p1 = mm;
      statusbar.setGuide(tool, 1);
      return;
    }
    if (!arcState.p2) {
      arcState.p2 = mm;
      statusbar.setGuide(tool, 2);
      return;
    }
    const arc = arcFromThreePoints(arcState.p1, arcState.p2, mm);
    if (arc) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push(assignCurrentLayer({ id, ...arc }));
      selectedId = id;
      saveHistory();
    }
    arcState = { p1: null, p2: null };
    previewShape = null;
    redraw();
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
    if (dimState.mode === 'radius') {
      if (!dimState.circle) {
        const hit = pickShape(mm);
        if (!hit || hit.type !== 'circle') return;
        dimState.circle = hit;
        statusbar.setGuide(tool, 1);
        cmdline.setLabel('[寸法] 引き出し点をクリック:');
        return;
      }
      shapes.push(assignCurrentLayer({
        id: `shape_${crypto.randomUUID()}`,
        type: 'dim',
        dimType: 'radius',
        cx: dimState.circle.cx,
        cy: dimState.circle.cy,
        r: dimState.circle.r,
        px: mm.x,
        py: mm.y,
      }));
      dimState = { p1: null, p2: null, circle: null, mode: 'radius' };
      previewShape = null;
      saveHistory();
      redraw();
      return;
    }
    if (dimState.mode === 'diameter') {
      const hit = pickShape(mm);
      if (!hit || hit.type !== 'circle') return;
      shapes.push(assignCurrentLayer({
        id: `shape_${crypto.randomUUID()}`,
        type: 'dim',
        dimType: 'diameter',
        cx: hit.cx,
        cy: hit.cy,
        r: hit.r,
      }));
      saveHistory();
      redraw();
      return;
    }
    if (!dimState.p1) { dimState.p1 = mm; statusbar.setGuide(tool, 1); return; }
    if (!dimState.p2) { dimState.p2 = mm; statusbar.setGuide(tool, 2); return; }
    const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
    const offset = dir === 'h' ? mm.y - dimState.p1.y : mm.x - dimState.p1.x;
    shapes.push(assignCurrentLayer({ id: `shape_${crypto.randomUUID()}`, type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir }));
    dimState = { p1: null, p2: null, circle: null, mode: 'linear' }; previewShape = null;
    saveHistory(); redraw();
    return;
  }

  if (tool === Tool.MLEADER) {
    if (!mleaderState.p1) {
      mleaderState.p1 = mm;
      statusbar.setGuide(tool, 1);
      return;
    }
    if (!mleaderState.p2) {
      mleaderState.p2 = mm;
      statusbar.setGuide(tool, 2);
      return;
    }
    const text = window.prompt('引出線テキストを入力', mleaderState.text || '注記') || '注記';
    shapes.push(assignCurrentLayer({
      id: `shape_${crypto.randomUUID()}`,
      type: 'mleader',
      x1: mleaderState.p1.x,
      y1: mleaderState.p1.y,
      x2: mleaderState.p2.x,
      y2: mleaderState.p2.y,
      x3: mm.x,
      y3: mm.y,
      text,
      textHeight: getDimStyle().textHeight,
    }));
    mleaderState = { p1: null, p2: null, text: '' };
    previewShape = null;
    saveHistory();
    redraw();
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

  if (tool === Tool.ARRAY) {
    if (!selectedId) return;
    const src = shapes.find((shape) => shape.id === selectedId);
    if (!src) return;
    if (!arrayState.base) {
      arrayState.base = mm;
      arrayState.source = shapeClone(src);
      statusbar.setGuide(tool, 1);
      cmdline.setLabel(`[配列複写] 方向点をクリック (個数: ${arrayState.count}):`);
      return;
    }
    const dx = mm.x - arrayState.base.x;
    const dy = mm.y - arrayState.base.y;
    if (Math.hypot(dx, dy) < 1e-6) return;
    for (let i = 1; i < arrayState.count; i += 1) {
      shapes.push(cloneWithOffset(src, dx * i, dy * i));
    }
    saveHistory();
    cmdline.addHistory(`配列複写完了 (${arrayState.count}個)`, '#4da6ff');
    arrayState = { base: null, source: null, count: arrayState.count };
    redraw();
    return;
  }

  if (tool === Tool.HATCH) {
    const hit = pickShape(mm);
    const hatch = createHatchFromBoundary(hit);
    if (!hatch) {
      cmdline.addHistory('矩形または円の境界を選択してください', '#ff6666');
      return;
    }
    const id = `shape_${crypto.randomUUID()}`;
    shapes.push(assignCurrentLayer({ id, ...hatch }));
    selectedId = id;
    saveHistory();
    redraw();
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



  if (tool === Tool.SCALE) {
    if (!selectedId) return;
    if (!scaleState) {
      const target = shapes.find((s) => s.id === selectedId);
      if (!target) return;
      scaleState = { base: mm, ref: { x: mm.x + 100, y: mm.y }, refFixed: false, target, original: shapeClone(target) };
      statusbar.setGuide(tool, 1);
      cmdline.setLabel('[尺度変更] 参照点をクリック:');
      return;
    }
    if (!scaleState.refFixed) {
      scaleState.ref = mm;
      scaleState.refFixed = true;
      statusbar.setGuide(tool, 2);
      cmdline.setLabel('[尺度変更] 目標点をクリック:');
      return;
    }
    scaleState = null;
    saveHistory();
    cmdline.addHistory('尺度変更完了', '#4da6ff');
    changeTool(Tool.SELECT);
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
      shapes.push(assignCurrentLayer(newShape));
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
      shapes.push(assignCurrentLayer(mirrored));
      saveHistory();
      cmdline.addHistory('鏡像完了', '#4da6ff');
    }
    mirrorState.p1 = null;
    changeTool(Tool.SELECT);
    return;
  }

  if (tool === Tool.BREAK) {
    if (!breakState.shapeId) {
      const hit = pickShape(mm);
      if (!hit || hit.type !== 'line') return;
      breakState.shapeId = hit.id;
      selectedId = hit.id;
      statusbar.setGuide(tool, 1);
      cmdline.setLabel('[ブレーク] 切断点1をクリック:');
      redraw();
      return;
    }
    const line = shapes.find((shape) => shape.id === breakState.shapeId);
    if (!line || line.type !== 'line') {
      breakState = { shapeId: null, pt1: null };
      return;
    }
    if (!breakState.pt1) {
      const t1 = pointToLineParam(line, mm);
      breakState.pt1 = pointOnLineByT(line, t1);
      statusbar.setGuide(tool, 2);
      cmdline.setLabel('[ブレーク] 切断点2をクリック:');
      redraw();
      return;
    }
    const t1 = pointToLineParam(line, breakState.pt1);
    const t2 = pointToLineParam(line, mm);
    const ta = Math.min(t1, t2);
    const tb = Math.max(t1, t2);
    if (Math.abs(tb - ta) < 1e-6) return;
    const pA = pointOnLineByT(line, ta);
    const pB = pointOnLineByT(line, tb);
    const inserts = [];
    if (ta > 1e-6) inserts.push(assignCurrentLayer({ ...shapeClone(line), id: `shape_${crypto.randomUUID()}`, x2: pA.x, y2: pA.y }));
    if (tb < 1 - 1e-6) inserts.push(assignCurrentLayer({ ...shapeClone(line), id: `shape_${crypto.randomUUID()}`, x1: pB.x, y1: pB.y }));
    const idxLine = shapes.findIndex((shape) => shape.id === line.id);
    if (idxLine !== -1) {
      shapes.splice(idxLine, 1, ...inserts);
      saveHistory();
      cmdline.addHistory('ブレーク完了', '#4da6ff');
    }
    breakState = { shapeId: null, pt1: null };
    selectedId = null;
    changeTool(Tool.SELECT);
    redraw();
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


  if (tool === Tool.EXTEND) {
    if (extendState.phase === 0) {
      const hit = pickShape(mm);
      if (hit && hit.type === 'line') {
        extendState.boundaries.push(hit);
        selectedIds.add(hit.id);
        cmdline.addHistory(`境界: ${extendState.boundaries.length}本選択`, '#8aa8c0');
        redraw();
      }
      return;
    }
    if (extendState.phase === 1) {
      const hit = pickShape(mm);
      if (!hit || hit.type !== 'line') return;
      const extended = extendLine(hit, extendState.boundaries, mm);
      if (extended) {
        const idx = shapes.findIndex((s) => s.id === hit.id);
        if (idx !== -1) {
          shapes[idx] = { ...hit, ...extended };
          saveHistory();
          cmdline.addHistory('延長完了', '#4da6ff');
        }
      }
      redraw();
      return;
    }
    return;
  }

  if (tool === Tool.CHAMFER) {
    if (chamferState.d1 === null || chamferState.d2 === null) {
      cmdline.addHistory('先に面取り距離を入力してください', '#ff6666');
      return;
    }
    if (!chamferState.first) {
      const hit = pickShape(mm);
      if (!hit || hit.type !== 'line') return;
      chamferState.first = { line: hit, click: mm };
      selectedId = hit.id;
      statusbar.setGuide(tool, 2);
      cmdline.setLabel('[面取り] 2本目の線をクリック:');
      redraw();
      return;
    }
    const hit = pickShape(mm);
    if (!hit || hit.type !== 'line' || hit.id === chamferState.first.line.id) return;
    const first = chamferState.first;
    const inter = lineIntersectionUnbounded(first.line, hit);
    const inter2 = lineIntersectionUnbounded(hit, first.line);
    if (!inter || !inter2) return;
    const p1Data = pointAlongFromIntersection(first.line, inter, chamferState.d1, first.click);
    const p2Data = pointAlongFromIntersection(hit, inter2, chamferState.d2, mm);
    const l1 = shapeClone(first.line);
    const l2 = shapeClone(hit);
    if (p1Data.useP1) { l1.x1 = p1Data.point.x; l1.y1 = p1Data.point.y; }
    else { l1.x2 = p1Data.point.x; l1.y2 = p1Data.point.y; }
    if (p2Data.useP1) { l2.x1 = p2Data.point.x; l2.y1 = p2Data.point.y; }
    else { l2.x2 = p2Data.point.x; l2.y2 = p2Data.point.y; }
    const idx1 = shapes.findIndex((shape) => shape.id === l1.id);
    const idx2 = shapes.findIndex((shape) => shape.id === l2.id);
    if (idx1 !== -1) shapes[idx1] = l1;
    if (idx2 !== -1) shapes[idx2] = l2;
    shapes.push(assignCurrentLayer({ id: `shape_${crypto.randomUUID()}`, type: 'line', x1: p1Data.point.x, y1: p1Data.point.y, x2: p2Data.point.x, y2: p2Data.point.y }));
    saveHistory();
    cmdline.addHistory('面取り完了', '#4da6ff');
    chamferState = { d1: chamferState.d1, d2: chamferState.d2, first: null };
    selectedId = null;
    redraw();
    return;
  }


  if (tool === Tool.LENGTHEN || tool === Tool.CHAMFER) {
    if (lengthenState.delta === null) {
      cmdline.addHistory('先に長さ変更量を入力してください', '#ff6666');
      return;
    }
    const hit = pickShape(mm);
    if (!hit || hit.type !== 'line') return;
    const dx = hit.x2 - hit.x1;
    const dy = hit.y2 - hit.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return;
    const nextLen = len + lengthenState.delta;
    if (nextLen <= 0.1) {
      cmdline.addHistory('長さが0以下になるため実行できません', '#ff6666');
      return;
    }
    const ux = dx / len;
    const uy = dy / len;
    const nearP1 = Math.hypot(mm.x - hit.x1, mm.y - hit.y1) <= Math.hypot(mm.x - hit.x2, mm.y - hit.y2);
    const line = shapeClone(hit);
    if (nearP1) {
      line.x1 = line.x2 - ux * nextLen;
      line.y1 = line.y2 - uy * nextLen;
    } else {
      line.x2 = line.x1 + ux * nextLen;
      line.y2 = line.y1 + uy * nextLen;
    }
    const idxLine = shapes.findIndex((shape) => shape.id === hit.id);
    if (idxLine !== -1) {
      shapes[idxLine] = line;
      saveHistory();
      cmdline.addHistory(`長さ変更完了: ${Math.round(len)}→${Math.round(nextLen)}mm`, '#4da6ff');
      redraw();
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
  if (event.evt.button === 1) {
    middleDown = false;
    isPanning = false;
    panStart = null;
    return;
  }
  // 矩形選択終了
  // グリップ確定
  if (gripState) {
    saveHistory();
    gripState = null;
    redraw();
    return;
  }

  if (isBoxSelecting) {
    const pos = stage.getPointerPosition();
    if (boxSelectStart && pos) {
      const rx0 = Math.min(boxSelectStart.x, pos.x);
      const ry0 = Math.min(boxSelectStart.y, pos.y);
      const rx1 = Math.max(boxSelectStart.x, pos.x);
      const ry1 = Math.max(boxSelectStart.y, pos.y);
      if (rx1 - rx0 > 4 || ry1 - ry0 > 4) {
        // 右→左ドラッグ = 交差選択（触れたもの全て）
        // 左→右ドラッグ = 窓選択（完全包含のみ）
        const isCrossing = pos.x < boxSelectStart.x;
        selectedIds.clear();
        selectedId = null;
        // mm座標に変換してから判定
        const mm0 = screenToMm({ x: rx0, y: ry0 }, viewport);
        const mm1 = screenToMm({ x: rx1, y: ry1 }, viewport);
        const bx0 = Math.min(mm0.x, mm1.x), bx1 = Math.max(mm0.x, mm1.x);
        const by0 = Math.min(mm0.y, mm1.y), by1 = Math.max(mm0.y, mm1.y);
        for (const s of shapes) {
          if (!isLayerVisible(s) || isLayerLocked(s)) continue;
          if (isCrossing) {
            if (shapeTouchesBbox(s, bx0, by0, bx1, by1)) selectedIds.add(s.id);
          } else {
            if (isShapeInBox(s, rx0, ry0, rx1, ry1)) selectedIds.add(s.id);
          }
        }
        if (selectedIds.size === 1) {
          selectedId = [...selectedIds][0];
          selectedIds.clear();
        }
        const count = selectedIds.size + (selectedId ? 1 : 0);
        const mode = isCrossing ? '交差選択' : '窓選択';
        cmdline.addHistory(`${mode}: ${count}個の図形を選択`, '#8aa8c0');
      }
    }
    isBoxSelecting = false;
    boxSelectStart = null;
    const selRect = document.getElementById('select-rect');
    if (selRect) selRect.style.display = 'none';
    redraw();
    return;
  }

  if (tool === Tool.RECT && drawingStart) {
    let mm = getSnap();
    if (orthoMode) mm = applyOrtho(drawingStart, mm);
    const rect = normalizeRect(drawingStart, mm);
    if (rect.w > 0 && rect.h > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push(assignCurrentLayer({ id, type: 'rect', ...rect }));
      selectedId = id;
      saveHistory();
    }
    drawingStart = null; previewShape = null; redraw();
    return;
  }
  if (dragState) { saveHistory(); dragState = null; }
  if (tool === Tool.SELECT) dynInput.hide();
});

stage.on('contextmenu', (event) => {
  event.evt.preventDefault();

  if (event.evt.shiftKey) {
    showShiftRightSnapMenu(event.evt.clientX, event.evt.clientY);
    return;
  }
  hideShiftRightSnapMenu();

  // AutoCAD互換: コマンド中は右クリックをEnter相当として扱う
  const commandRunning = tool !== Tool.SELECT;
  if (rightClickMode === 'autocad_like' && commandRunning) {
    if (tool === Tool.POLYLINE) { finishPolyline(false); return; }
    if (tool === Tool.LINE || tool === Tool.ARC || tool === Tool.ELLIPSE) {
      drawingStart = null;
      arcState = { p1: null, p2: null };
      ellipseState = { center: null, rx: null };
      previewShape = null;
      cmdline.addHistory('右クリック: Enter相当でコマンド終了', '#8aa8c0');
      changeTool(Tool.SELECT);
      return;
    }
    if (tool === Tool.TRIM && trimState.phase === 0) {
      trimState.phase = 1;
      cmdline.addHistory('切断する部分をクリック [Esc:終了]', '#8aa8c0');
      statusbar.setGuide(tool, 1);
      cmdline.setPrompt(tool, 1);
      return;
    }
    if (tool === Tool.EXTEND && extendState.phase === 0) {
      extendState.phase = 1;
      cmdline.addHistory('延長する線をクリック [Esc:終了]', '#8aa8c0');
      statusbar.setGuide(tool, 1);
      cmdline.setPrompt(tool, 1);
      return;
    }
  }

  // 互換モード: 旧来の右クリックキャンセル
  if (tool === Tool.POLYLINE) { finishPolyline(false); return; }
  if (tool === Tool.LINE || tool === Tool.ARC || tool === Tool.ELLIPSE) {
    drawingStart = null; arcState = { p1: null, p2: null }; previewShape = null;
    changeTool(Tool.SELECT); return;
  }
  if (tool === Tool.COPY) {
    if (copyState?.preview) {
      const idx = shapes.findIndex((s) => s.id === copyState.preview.id);
      if (idx !== -1) shapes.splice(idx, 1);
      copyState.preview = null;
    }
    copyState = null;
    changeTool(Tool.SELECT); return;
  }
  if (tool === Tool.SCALE || tool === Tool.EXTEND || tool === Tool.ARRAY || tool === Tool.HATCH || tool === Tool.BREAK || tool === Tool.LENGTHEN || tool === Tool.CHAMFER) {
    arrayState = { base: null, source: null, count: arrayState.count };
    changeTool(Tool.SELECT); return;
  }

  // 選択ツール: コンテキストメニューを表示
  showContextMenu(event.evt.clientX, event.evt.clientY);
});

document.addEventListener('mousedown', () => {
  hideShiftRightSnapMenu();
});

// ──────────────────────────────────────────────
// テキストダブルクリック再編集
// ──────────────────────────────────────────────
stage.on('dblclick', () => {
  if (tool !== Tool.SELECT) return;
  const mm = pointerToMm();
  const hit = pickShape(mm);
  if (!hit || hit.type !== 'text') return;

  const shape = hit;
  const screen = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  if (textState.inputEl) { textState.inputEl.remove(); }

  const el = document.createElement('input');
  el.type = 'text';
  el.value = shape.text || '';
  el.style.position = 'absolute';
  el.style.left = `${screen.x}px`;
  el.style.top = `${screen.y - 20}px`;
  el.style.background = 'rgba(0,0,0,0.85)';
  el.style.color = '#ffff00';
  el.style.border = '1px solid #ff8800';
  el.style.borderRadius = '3px';
  el.style.padding = '2px 6px';
  el.style.fontSize = `${Math.max(12, (shape.height || 2.5) * viewport.scale)}px`;
  el.style.fontFamily = 'monospace';
  el.style.zIndex = '100';
  el.style.minWidth = '80px';
  container.appendChild(el);
  el.focus();
  el.select();
  textState.inputEl = el;
  statusbar.setCustomGuide('文字を編集 [Enter:確定] [Esc:キャンセル]');

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const newText = el.value;
      shape.text = newText;
      saveHistory();
      redraw();
      cmdline.addHistory(`文字編集: "${newText}"`, '#4da6ff');
      el.remove();
      textState.inputEl = null;
      changeTool(Tool.SELECT);
    } else if (e.key === 'Escape') {
      el.remove();
      textState.inputEl = null;
      changeTool(Tool.SELECT);
    }
    e.stopPropagation();
  });
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
    if (lKey === 'p') { event.preventDefault(); printCurrentViewAsPdf(); return; }
    if (lKey === 'c') {
      event.preventDefault();
      const copied = copySelectionToClipboard();
      if (copied) cmdline.addHistory('クリップボードへコピー', '#8aa8c0');
      return;
    }
    if (lKey === 'v') {
      event.preventDefault();
      const count = pasteClipboard();
      if (count > 0) cmdline.addHistory(`貼り付け: ${count}個`, '#8aa8c0');
      return;
    }
    if (lKey === 'a') {
      event.preventDefault();
      selectedIds.clear();
      for (const s of shapes) selectedIds.add(s.id);
      selectedId = null;
      cmdline.addHistory(`すべて選択: ${shapes.length}個`, '#8aa8c0');
      redraw();
      return;
    }
    return;
  }

  if (inInput) return; // テキスト入力中はここ以降スキップ

  // Space/Enter: 直前コマンドの再実行（AutoCAD風）
  if ((key === ' ' || key === 'Enter') && tool === Tool.SELECT) {
    event.preventDefault();
    if (lastNonSelectTool && lastNonSelectTool !== Tool.SELECT) {
      changeTool(lastNonSelectTool);
      cmdline.addHistory(`直前コマンド再実行: ${lastNonSelectTool.toUpperCase()}`, '#8aa8c0');
    }
    return;
  }

  // Shift押下中は一時的にオルソON（AutoCAD風の補助）
  if (key === 'Shift' && !orthoMode) {
    orthoMode = statusbar.toggleOrtho(true);
    document._tempOrthoByShift = true;
    return;
  }

  // Escape
  if (key === 'Escape') { oneShotSnapMode = null; hideShiftRightSnapMenu(); escapeCurrentTool(); return; }

  // Backspace（ポリラインの直前頂点取り消し）
  if (key === 'Backspace' && tool === Tool.POLYLINE) {
    event.preventDefault();
    undoPolylineVertex();
    return;
  }

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
    if (tool === Tool.EXTEND && extendState.phase === 0) {
      extendState.phase = 1;
      selectedIds.clear();
      cmdline.addHistory('延長する線をクリック [Esc:終了]', '#8aa8c0');
      statusbar.setGuide(tool, 1);
      redraw();
      return;
    }
    return;
  }

  // C キー（ポリライン閉じる）
  if (lKey === 'c' && tool === Tool.POLYLINE) { finishPolyline(true); return; }

  // 2文字ショートカット（AutoCAD風）
  const chord = `${document._lastKey || ''}${lKey}`;
  const chord3 = `${document._last2Key || ''}${document._lastKey || ''}${lKey}`;
  const hasSelection = selectedId || selectedIds.size > 0;
  if (chord === 'za') { fitView(); document._lastKey = ''; return; }
  if (chord === 'pl') { changeTool(Tool.POLYLINE); document._lastKey = ''; return; }
  if (chord === 'el') { changeTool(Tool.ELLIPSE); document._lastKey = ''; return; }
  if (chord === 'tr') { changeTool(Tool.TRIM); document._lastKey = ''; return; }
  if (chord === 'br') { changeTool(Tool.BREAK); document._lastKey = ''; document._last2Key = ''; return; }
  if (chord3 === 'len') { changeTool(Tool.LENGTHEN); document._lastKey = ''; document._last2Key = ''; return; }
  if (chord3 === 'cha') { changeTool(Tool.CHAMFER); document._lastKey = ''; document._last2Key = ''; return; }
  if (chord === 'ex') { changeTool(Tool.EXTEND); document._lastKey = ''; return; }
  if (chord === 'mi') { changeTool(Tool.MIRROR); document._lastKey = ''; return; }
  if (chord === 'jo') { changeTool(Tool.JOIN); document._lastKey = ''; return; }
  if (chord === 'sc') { changeTool(Tool.SCALE); document._lastKey = ''; return; }
  if (chord === 'ar') { changeTool(Tool.ARRAY); document._lastKey = ''; return; }
  if (chord === 'di') { changeTool(Tool.DIM); document._lastKey = ''; return; }
  if (chord === 'ml') { changeTool(Tool.MLEADER); document._lastKey = ''; return; }
  if (chord === 'co' && hasSelection) { changeTool(Tool.COPY); document._lastKey = ''; return; }
  if (chord === 'ro' && hasSelection) { changeTool(Tool.ROTATE); document._lastKey = ''; return; }

  // F8: オルソ切替
  if (key === 'F8') { orthoMode = statusbar.toggleOrtho(); return; }
  // F7: グリッド切替
  if (key === 'F7') { gridVisible = statusbar.toggleGrid(); redraw(); return; }
  // F9: スナップ切替
  if (key === 'F9') { snapMode = statusbar.toggleSnap(); return; }
  // F11: 動的入力切替
  if (key === 'F11') {
    event.preventDefault();
    const enabled = dynInput.toggle();
    cmdline.addHistory(`動的入力: ${enabled ? 'ON' : 'OFF'}`, '#8aa8c0');
    return;
  }
  // F10: 右クリックモード切替
  if (key === 'F10') {
    rightClickMode = rightClickMode === 'autocad_like' ? 'legacy_cancel' : 'autocad_like';
    try { localStorage.setItem('cad.rightClickMode', rightClickMode); } catch {}
    cmdline.addHistory(`右クリックモード: ${rightClickMode}`, '#8aa8c0');
    return;
  }

  // ショートカットキー（ツール切替）
  if (lKey === 'l') { changeTool(Tool.LINE); return; }
  if (lKey === 'c') { changeTool(Tool.CIRCLE); return; }
  if (lKey === 'a') { changeTool(Tool.ARC); return; }
  if (lKey === 'p') { changeTool(Tool.POLYLINE); return; }
  if (lKey === 'd') { changeTool(Tool.DIM); return; }
  if (lKey === 'g') { changeTool(Tool.MLEADER); return; }
  if (lKey === 't') { changeTool(Tool.TEXT); return; }
  if (lKey === 'o') { changeTool(Tool.OFFSET); return; }
  if (lKey === 'h') { changeTool(Tool.HATCH); return; }
  if (lKey === 'x') { changeTool(Tool.EXPLODE); return; }
  if (lKey === 'f' && !event.shiftKey) { fitView(); return; }
  if (lKey === 'm' && hasSelection) { changeTool(Tool.MOVE); return; }
  if (lKey === 'r' && hasSelection) { changeTool(Tool.ROTATE); return; }

  document._last2Key = document._lastKey || '';
  document._lastKey = lKey;
});


document.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && document._tempOrthoByShift) {
    orthoMode = statusbar.toggleOrtho(false);
    document._tempOrthoByShift = false;
  }
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
    for (const shape of imported) shapes.push(assignCurrentLayer({ id: `shape_${crypto.randomUUID()}`, ...shape }));
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
// グリップ編集ヘルパー
// ──────────────────────────────────────────────
function getGripPoints(shape) {
  if (shape.type === 'line') return [
    { x: shape.x1, y: shape.y1 },
    { x: shape.x2, y: shape.y2 },
    { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 },
  ];
  if (shape.type === 'circle') return [
    { x: shape.cx, y: shape.cy },
    { x: shape.cx + shape.r, y: shape.cy },
    { x: shape.cx - shape.r, y: shape.cy },
    { x: shape.cx, y: shape.cy + shape.r },
    { x: shape.cx, y: shape.cy - shape.r },
  ];
  if (shape.type === 'arc') return [
    { x: shape.cx, y: shape.cy },
  ];
  if (shape.type === 'ellipse') return [
    { x: shape.cx, y: shape.cy },
    { x: shape.cx + shape.rx, y: shape.cy },
    { x: shape.cx, y: shape.cy + shape.ry },
  ];
  if (shape.type === 'rect') return [
    { x: shape.x,              y: shape.y              },
    { x: shape.x + shape.w,    y: shape.y              },
    { x: shape.x + shape.w,    y: shape.y + shape.h    },
    { x: shape.x,              y: shape.y + shape.h    },
    { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 },
  ];
  return [];
}

function drawGrips(shape) {
  const grips = getGripPoints(shape);
  for (let i = 0; i < grips.length; i++) {
    const sp = mmToScreen(grips[i], viewport);
    const isActive = gripState?.shapeId === shape.id && gripState?.gripIndex === i;
    snapLayer.add(new Konva.Rect({
      x: sp.x - 4, y: sp.y - 4,
      width: 8, height: 8,
      fill: isActive ? '#ff4444' : '#0066ff',
      stroke: '#ffffff',
      strokeWidth: 1,
    }));
  }
}

function hitTestGrip(screenPt) {
  if (!selectedId) return null;
  const shape = shapes.find((s) => s.id === selectedId);
  if (!shape) return null;
  const grips = getGripPoints(shape);
  for (let i = 0; i < grips.length; i++) {
    const sp = mmToScreen(grips[i], viewport);
    if (Math.hypot(screenPt.x - sp.x, screenPt.y - sp.y) < 8) return i;
  }
  return null;
}

function applyGripMove(shape, gripIndex, mm) {
  if (shape.type === 'line') {
    if (gripIndex === 0) { shape.x1 = mm.x; shape.y1 = mm.y; }
    else if (gripIndex === 1) { shape.x2 = mm.x; shape.y2 = mm.y; }
    else {
      const cx = (shape.x1 + shape.x2) / 2, cy = (shape.y1 + shape.y2) / 2;
      const dx = mm.x - cx, dy = mm.y - cy;
      shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy;
    }
  } else if (shape.type === 'circle') {
    if (gripIndex === 0) { shape.cx = mm.x; shape.cy = mm.y; }
    else { shape.r = Math.max(0.1, Math.hypot(mm.x - shape.cx, mm.y - shape.cy)); }
  } else if (shape.type === 'ellipse') {
    if (gripIndex === 0) { shape.cx = mm.x; shape.cy = mm.y; }
    else if (gripIndex === 1) { shape.rx = Math.max(0.1, Math.abs(mm.x - shape.cx)); }
    else if (gripIndex === 2) { shape.ry = Math.max(0.1, Math.abs(mm.y - shape.cy)); }
  } else if (shape.type === 'rect') {
    if (gripIndex === 0) {
      const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
      shape.x = mm.x; shape.y = mm.y;
      shape.w = Math.max(0.1, x2 - mm.x); shape.h = Math.max(0.1, y2 - mm.y);
    } else if (gripIndex === 1) {
      const y2 = shape.y + shape.h;
      shape.y = mm.y;
      shape.w = Math.max(0.1, mm.x - shape.x); shape.h = Math.max(0.1, y2 - mm.y);
    } else if (gripIndex === 2) {
      shape.w = Math.max(0.1, mm.x - shape.x); shape.h = Math.max(0.1, mm.y - shape.y);
    } else if (gripIndex === 3) {
      const x2 = shape.x + shape.w;
      shape.x = mm.x;
      shape.w = Math.max(0.1, x2 - mm.x); shape.h = Math.max(0.1, mm.y - shape.y);
    } else {
      const dx = mm.x - (shape.x + shape.w / 2);
      const dy = mm.y - (shape.y + shape.h / 2);
      shape.x += dx; shape.y += dy;
    }
  }
}

// ──────────────────────────────────────────────
// 交差選択ヘルパー（右→左ドラッグ）
// ──────────────────────────────────────────────
function shapeTouchesBbox(s, x0, y0, x1, y1) {
  if (s.type === 'line') {
    // 端点どちらかがbox内、またはboxの辺と交差
    const inBox = (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
    if (inBox(s.x1, s.y1) || inBox(s.x2, s.y2)) return true;
    // 簡易: lineとbbox辺が交差するか
    const segs = [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y1 }],
      [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ];
    const line = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
    for (const [a, b] of segs) {
      if (segmentsIntersect(line, { x1: a.x, y1: a.y, x2: b.x, y2: b.y })) return true;
    }
    return false;
  }
  if (s.type === 'rect') {
    return !(s.x > x1 || s.x + s.w < x0 || s.y > y1 || s.y + s.h < y0);
  }
  if (s.type === 'circle' || s.type === 'arc') {
    const clampedX = Math.max(x0, Math.min(x1, s.cx));
    const clampedY = Math.max(y0, Math.min(y1, s.cy));
    return Math.hypot(s.cx - clampedX, s.cy - clampedY) <= s.r;
  }
  if (s.type === 'text' || s.type === 'point') {
    return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
  }
  if (s.type === 'mleader') {
    const inBox = (px, py) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
    if (inBox(s.x1, s.y1) || inBox(s.x2, s.y2) || inBox(s.x3, s.y3)) return true;
    const segs = [
      [{ x: x0, y: y0 }, { x: x1, y: y0 }],
      [{ x: x1, y: y0 }, { x: x1, y: y1 }],
      [{ x: x1, y: y1 }, { x: x0, y: y1 }],
      [{ x: x0, y: y1 }, { x: x0, y: y0 }],
    ];
    const legs = [
      { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 },
      { x1: s.x2, y1: s.y2, x2: s.x3, y2: s.y3 },
    ];
    for (const leg of legs) {
      for (const [a, b] of segs) {
        if (segmentsIntersect(leg, { x1: a.x, y1: a.y, x2: b.x, y2: b.y })) return true;
      }
    }
    return false;
  }
  if (s.type === 'hatch') {
    if (s.hatchKind === 'circle') {
      const clampedX = Math.max(x0, Math.min(x1, s.cx));
      const clampedY = Math.max(y0, Math.min(y1, s.cy));
      return Math.hypot(s.cx - clampedX, s.cy - clampedY) <= s.r;
    }
    return !(s.x > x1 || s.x + s.w < x0 || s.y > y1 || s.y + s.h < y0);
  }
  return false;
}

function segmentsIntersect(l1, l2) {
  const d1x = l1.x2 - l1.x1, d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1, d2y = l2.y2 - l2.y1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false;
  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / cross;
  const u = ((l2.x1 - l1.x1) * d1y - (l2.y1 - l1.y1) * d1x) / cross;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// ──────────────────────────────────────────────
// 矩形選択ヘルパー
// ──────────────────────────────────────────────
function isShapeInBox(s, sx0, sy0, sx1, sy1) {
  // スクリーン座標のボックスをmm座標に変換
  const mm0 = screenToMm({ x: sx0, y: sy0 }, viewport);
  const mm1 = screenToMm({ x: sx1, y: sy1 }, viewport);
  const x0 = Math.min(mm0.x, mm1.x), x1 = Math.max(mm0.x, mm1.x);
  const y0 = Math.min(mm0.y, mm1.y), y1 = Math.max(mm0.y, mm1.y);
  if (s.type === 'line') {
    return x0 <= s.x1 && s.x1 <= x1 && y0 <= s.y1 && s.y1 <= y1
        && x0 <= s.x2 && s.x2 <= x1 && y0 <= s.y2 && s.y2 <= y1;
  }
  if (s.type === 'rect') {
    return x0 <= s.x && s.x + s.w <= x1 && y0 <= s.y && s.y + s.h <= y1;
  }
  if (s.type === 'circle' || s.type === 'arc') {
    return x0 <= s.cx - s.r && s.cx + s.r <= x1 && y0 <= s.cy - s.r && s.cy + s.r <= y1;
  }
  if (s.type === 'text' || s.type === 'point') {
    return x0 <= s.x && s.x <= x1 && y0 <= s.y && s.y <= y1;
  }
  if (s.type === 'hatch') {
    if (s.hatchKind === 'circle') return x0 <= s.cx - s.r && s.cx + s.r <= x1 && y0 <= s.cy - s.r && s.cy + s.r <= y1;
    return x0 <= s.x && s.x + s.w <= x1 && y0 <= s.y && s.y + s.h <= y1;
  }
  return false;
}

// ──────────────────────────────────────────────
// コンテキストメニュー
// ──────────────────────────────────────────────
const ctxMenu = document.getElementById('ctx-menu');

function showContextMenu(x, y) {
  if (!ctxMenu) return;
  const hasSelection = selectedId !== null || selectedIds.size > 0;
  // 選択状態に応じてアイテムのdisabled制御
  const items = ctxMenu.querySelectorAll('.ctx-item');
  for (const item of items) {
    const action = item.dataset.action;
    const needsSelection = ['copy', 'delete', 'move', 'rotate', 'scale', 'mirror', 'offset'].includes(action);
    if (needsSelection && !hasSelection) {
      item.classList.add('disabled');
    } else {
      item.classList.remove('disabled');
    }
  }
  // 表示位置
  ctxMenu.style.left = `${x}px`;
  ctxMenu.style.top = `${y}px`;
  ctxMenu.classList.add('visible');

  // 画面外に出ないよう調整
  const rect = ctxMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) ctxMenu.style.left = `${x - rect.width}px`;
  if (rect.bottom > window.innerHeight) ctxMenu.style.top = `${y - rect.height}px`;
}

function hideContextMenu() {
  ctxMenu?.classList.remove('visible');
}

ctxMenu?.addEventListener('click', (event) => {
  const item = event.target.closest('.ctx-item');
  if (!item || item.classList.contains('disabled')) return;
  hideContextMenu();
  const action = item.dataset.action;

  if (action === 'select-all') {
    selectedIds.clear();
    for (const s of shapes) selectedIds.add(s.id);
    selectedId = null;
    cmdline.addHistory(`すべて選択: ${shapes.length}個`, '#8aa8c0');
    redraw();
  } else if (action === 'copy') {
    if (copySelectionToClipboard()) cmdline.addHistory('コピー', '#8aa8c0');
  } else if (action === 'paste') {
    pasteClipboard();
  } else if (action === 'delete') {
    deleteSelected();
    cmdline.addHistory('削除', '#8aa8c0');
  } else if (action === 'move') {
    if (selectedId) changeTool(Tool.MOVE);
  } else if (action === 'rotate') {
    if (selectedId) changeTool(Tool.ROTATE);
  } else if (action === 'scale') {
    if (selectedId) changeTool(Tool.SCALE);
  } else if (action === 'mirror') {
    if (selectedId) changeTool(Tool.MIRROR);
  } else if (action === 'offset') {
    changeTool(Tool.OFFSET);
  } else if (action === 'fit') {
    fitView();
  } else if (action === 'undo') {
    undo();
  }
});

// コンテキストメニューを閉じる
document.addEventListener('click', (e) => {
  if (!ctxMenu?.contains(e.target)) hideContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
}, true);

// ──────────────────────────────────────────────
// 初期描画
// ──────────────────────────────────────────────
redraw();

function pointAlongFromIntersection(line, inter, dist, clickPt) {
  const p1 = { x: line.x1, y: line.y1 };
  const p2 = { x: line.x2, y: line.y2 };
  const nearP1 = Math.hypot(clickPt.x - p1.x, clickPt.y - p1.y) <= Math.hypot(clickPt.x - p2.x, clickPt.y - p2.y);
  const target = nearP1 ? p1 : p2;
  const vx = target.x - inter.x;
  const vy = target.y - inter.y;
  const len = Math.hypot(vx, vy) || 1;
  return {
    point: { x: inter.x + (vx / len) * dist, y: inter.y + (vy / len) * dist },
    useP1: nearP1,
  };
}

function pointToLineParam(line, point) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return 0;
  const t = ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

function pointOnLineByT(line, t) {
  return { x: line.x1 + (line.x2 - line.x1) * t, y: line.y1 + (line.y2 - line.y1) * t };
}
