import { createKonvaCanvas, drawGrid, screenToMm, snapToGrid } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { parseDxf, dxfEntitiesToShapes } from './io/dxf.js';
import { parseJww, parseJwwBinary, jwwEntitiesToShapes } from './io/jww.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';

// Base64 → DXFテキスト（CP932/UTF-8自動判定）
function decodeDxfBase64(base64) {
  // Base64 → Uint8Array
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  // UTF-8 BOMチェック
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  // UTF-8として正常デコードできるか確認（日本語が含まれる場合は失敗しやすい）
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // UTF-8デコード成功 → UTF-8ファイル
    return decoded;
  } catch {
    // UTF-8デコード失敗 → CP932（Shift-JIS）として読む
    try {
      return new TextDecoder('shift_jis').decode(bytes);
    } catch {
      // shift_jisが使えない環境のフォールバック（latin1）
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
  }
}

const container = document.getElementById('cad-root');
const { stage, gridLayer, drawingLayer } = createKonvaCanvas(container);

const viewport = { x: 0, y: 0, scale: 1 };
const shapes = [];
let tool = Tool.SELECT;
let drawingStart = null;
let previewShape = null;
let selectedId = null;
let isPanning = false;
let panStart = null;
let dragState = null;

// Undo/Redo 履歴管理
const history = [];       // 各要素はshapesのスナップショット
let historyIndex = -1;
const MAX_HISTORY = 50;

function saveHistory() {
  // 現在位置より未来の履歴を削除
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
  dragState = null;
  redraw();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  shapes.length = 0;
  for (const s of history[historyIndex]) shapes.push(s);
  selectedId = null;
  dragState = null;
  redraw();
}

// 初期状態を履歴に保存
saveHistory();

// 中ボタンダブルクリック検出用
let lastMiddleClickTime = 0;

const toolbar = initToolbar({
  onChangeTool(nextTool) {
    tool = nextTool;
    drawingStart = null;
    previewShape = null;
    toolbar.setActive(tool);
    redraw();
  },
  onOpenFile: openCadFile,
});
toolbar.setActive(tool);

const statusbar = initStatusbar({
  onRectInput({ w, h }) {
    const id = `shape_${crypto.randomUUID()}`;
    shapes.push({ id, type: 'rect', x: 0, y: 0, w, h });
    selectedId = id;
    saveHistory();
    redraw();
  },
});

if (window.cadBridge?.onMenuOpenFile) {
  window.cadBridge.onMenuOpenFile(() => {
    openCadFile();
  });
}

initSidebar({
  getDrawingContext() {
    const elements = shapes.map((s) => {
      if (s.type === 'line') {
        return { type: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer: 'default' };
      }
      if (s.type === 'arc') {
        return { type: 'arc', cx: s.cx, cy: s.cy, r: s.r, startAngle: s.startAngle, endAngle: s.endAngle, layer: 'default' };
      }
      if (s.type === 'text') {
        return { type: 'text', x: s.x, y: s.y, text: s.text, height: s.height, rotation: s.rotation, layer: 'default' };
      }
      if (s.type === 'point') {
        return { type: 'point', x: s.x, y: s.y, layer: 'default' };
      }
      return { type: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, layer: 'default' };
    });

    return {
      layers: [{ name: 'default', visible: true }],
      elements,
      selected: selectedId ? [selectedId] : [],
      bbox: computeBoundingBox(elements),
    };
  },
});

function computeBoundingBox(elements) {
  if (!elements.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  const xs = [];
  const ys = [];
  for (const e of elements) {
    if (e.type === 'line') {
      xs.push(e.x1, e.x2);
      ys.push(e.y1, e.y2);
    } else if (e.type === 'arc') {
      xs.push(e.cx - e.r, e.cx + e.r);
      ys.push(e.cy - e.r, e.cy + e.r);
    } else if (e.type === 'text' || e.type === 'point') {
      xs.push(e.x);
      ys.push(e.y);
    } else {
      xs.push(e.x, e.x + e.w);
      ys.push(e.y, e.y + e.h);
    }
  }

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function pointerToMm() {
  const pointer = stage.getPointerPosition();
  if (!pointer) return { x: 0, y: 0 };
  return screenToMm(pointer, viewport);
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
      const d = distancePointToSegment(mmPoint, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (d <= threshold) return s;
      continue;
    }

    if (s.type === 'arc') {
      const distance = Math.hypot(mmPoint.x - s.cx, mmPoint.y - s.cy);
      if (Math.abs(distance - s.r) <= threshold) {
        return s;
      }
    }

    if (s.type === 'text') {
      // テキストは挿入点から右方向・上方向に当たり判定（簡易）
      const approxW = s.text.length * s.height * 0.7;
      if (mmPoint.x >= s.x - threshold && mmPoint.x <= s.x + approxW + threshold &&
          mmPoint.y >= s.y - s.height - threshold && mmPoint.y <= s.y + threshold) {
        return s;
      }
    }

    if (s.type === 'point') {
      if (Math.hypot(mmPoint.x - s.x, mmPoint.y - s.y) <= threshold * 2) return s;
    }
  }
  return null;
}

function distancePointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx ** 2 + dy ** 2)));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function redraw() {
  drawGrid(gridLayer, stage, viewport);
  drawingLayer.destroyChildren();

  for (const shape of shapes) {
    const isSelected = shape.id === selectedId;
    const node = buildShapeNode(shape, viewport, { isSelected });
    drawingLayer.add(node);
  }

  if (previewShape) {
    drawingLayer.add(buildShapeNode(previewShape, viewport, { isPreview: true }));
  }

  drawingLayer.draw();
}

function shapeClone(shape) {
  return JSON.parse(JSON.stringify(shape));
}

function applyMove(shape, dx, dy) {
  if (shape.type === 'rect') {
    shape.x += dx;
    shape.y += dy;
    return;
  }
  if (shape.type === 'line') {
    shape.x1 += dx;
    shape.y1 += dy;
    shape.x2 += dx;
    shape.y2 += dy;
    return;
  }
  if (shape.type === 'arc') {
    shape.cx += dx;
    shape.cy += dy;
  }
}

// 図形全体が画面に収まるようにビューポートを調整（AutoCAD: Zoom Extents = Z→A）
function fitView(targetShapes) {
  const all = targetShapes || shapes;
  if (all.length === 0) return;

  const xs = [], ys = [];
  for (const s of all) {
    if (s.type === 'line') { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    else if (s.type === 'arc') { xs.push(s.cx - s.r, s.cx + s.r); ys.push(s.cy - s.r, s.cy + s.r); }
    else if (s.type === 'rect') { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
    else if (s.type === 'text' || s.type === 'point') { xs.push(s.x); ys.push(s.y); }
  }
  if (xs.length === 0) return;

  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  const margin = 0.9;
  const scaleX = (stage.width() * margin) / w;
  const scaleY = (stage.height() * margin) / h;
  viewport.scale = Math.min(scaleX, scaleY);  // 制限なし・図面全体が必ず入る

  viewport.x = minX - (stage.width() / viewport.scale - w) / 2;
  viewport.y = minY - (stage.height() / viewport.scale - h) / 2;
  redraw();
}

// キーボード: Z→A 入力シーケンス検出用
let lastKey = '';

stage.on('mousemove', () => {
  const mm = snapToGrid(pointerToMm());
  statusbar.updateCursor(mm);

  if (isPanning && panStart) {
    const now = stage.getPointerPosition();
    if (!now) return;
    const dx = (now.x - panStart.x) / viewport.scale;
    const dy = (now.y - panStart.y) / viewport.scale;
    viewport.x -= dx;
    viewport.y -= dy;
    panStart = now;
    redraw();
    return;
  }

  if (tool === Tool.LINE && drawingStart) {
    previewShape = { type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y };
    redraw();
    return;
  }

  if (tool === Tool.RECT && drawingStart) {
    const rect = normalizeRect(drawingStart, mm);
    previewShape = rect.w > 0 && rect.h > 0 ? { type: 'rect', ...rect } : null;
    redraw();
    return;
  }

  if (dragState) {
    const dx = mm.x - dragState.anchor.x;
    const dy = mm.y - dragState.anchor.y;
    const target = shapes.find((s) => s.id === dragState.id);
    if (target) {
      Object.assign(target, shapeClone(dragState.original));
      applyMove(target, dx, dy);
      redraw();
    }
  }
});

stage.on('mousedown', (event) => {
  // 中ボタン: パン開始 & ダブルクリック検出
  if (event.evt.button === 1) {
    const now = Date.now();
    if (now - lastMiddleClickTime < 400) {
      // 中ボタンダブルクリック → 全体表示（AutoCAD: 中ボタンダブルクリック = Zoom Extents）
      fitView();
      lastMiddleClickTime = 0;
    } else {
      lastMiddleClickTime = now;
      isPanning = true;
      panStart = stage.getPointerPosition();
    }
    return;
  }

  const mm = snapToGrid(pointerToMm());

  if (tool === Tool.SELECT) {
    const hit = pickShape(mm);
    selectedId = hit?.id || null;
    dragState = hit ? { id: hit.id, anchor: mm, original: shapeClone(hit) } : null;
    redraw();
    return;
  }

  if (tool === Tool.LINE) {
    if (!drawingStart) {
      drawingStart = mm;
      return;
    }

    const id = `shape_${crypto.randomUUID()}`;
    shapes.push({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y });
    selectedId = id;
    drawingStart = null;
    previewShape = null;
    saveHistory();
    redraw();
    return;
  }

  if (tool === Tool.RECT) {
    drawingStart = mm;
  }
});

stage.on('mouseup', (event) => {
  if (event.evt.button === 1) {
    isPanning = false;
    panStart = null;
    return;
  }

  if (tool === Tool.RECT && drawingStart) {
    const mm = snapToGrid(pointerToMm());
    const rect = normalizeRect(drawingStart, mm);
    if (rect.w > 0 && rect.h > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push({ id, type: 'rect', ...rect });
      selectedId = id;
      saveHistory();
    }
    drawingStart = null;
    previewShape = null;
    redraw();
    return;
  }

  if (dragState) {
    // ドラッグ移動後に履歴保存
    saveHistory();
    dragState = null;
  }
});

stage.on('wheel', (event) => {
  event.evt.preventDefault();
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const before = screenToMm(pointer, viewport);
  const direction = event.evt.deltaY > 0 ? -1 : 1;
  const factor = direction > 0 ? 1.25 : 1 / 1.25;
  viewport.scale = Math.max(0.001, Math.min(200, viewport.scale * factor));
  viewport.x = before.x - pointer.x / viewport.scale;
  viewport.y = before.y - pointer.y / viewport.scale;

  redraw();
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  // Ctrl+Z: Undo
  if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }

  // Ctrl+Y or Ctrl+Shift+Z: Redo
  if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
    return;
  }

  // ESC: 描画キャンセル & 選択解除（AutoCAD準拠）
  if (event.key === 'Escape') {
    if (drawingStart || previewShape) {
      drawingStart = null;
      previewShape = null;
      redraw();
    } else {
      selectedId = null;
      tool = Tool.SELECT;
      toolbar.setActive(tool);
      redraw();
    }
    return;
  }

  // Delete: 選択図形を削除
  if (event.key === 'Delete' && selectedId) {
    const index = shapes.findIndex((s) => s.id === selectedId);
    if (index !== -1) {
      shapes.splice(index, 1);
      selectedId = null;
      saveHistory();
      redraw();
    }
    return;
  }

  // Z→A: Zoom Extents (AutoCAD: Z Enter A Enter)
  if (key === 'z') {
    lastKey = 'z';
    return;
  }
  if (key === 'a' && lastKey === 'z') {
    event.preventDefault();
    fitView();
    lastKey = '';
    return;
  }

  // F キー: fitView (簡易ショートカット)
  if (key === 'f') {
    fitView();
    lastKey = '';
    return;
  }

  lastKey = '';
});

window.addEventListener('resize', () => {
  stage.width(container.clientWidth);
  stage.height(container.clientHeight);
  redraw();
});

async function openCadFile() {
  if (!window.cadBridge?.openFile) {
    return;
  }

  try {
    const result = await window.cadBridge.openFile();
    if (!result || result.canceled) {
      return;
    }

    const ext = result.filePath.split('.').pop()?.toLowerCase();
    let imported = [];

    if (ext === 'dxf') {
      // Base64 → バイト列 → CP932/UTF-8自動判定してデコード
      const dxfText = decodeDxfBase64(result.base64);
      imported = dxfEntitiesToShapes(parseDxf(dxfText));
    } else if (ext === 'jww' || ext === 'jwc') {
      if (result.isBinary && result.base64) {
        imported = jwwEntitiesToShapes(parseJwwBinary(result.base64));
      } else {
        imported = jwwEntitiesToShapes(parseJww(result.content));
      }
    }

    if (imported.length === 0) {
      return;
    }

    for (const shape of imported) {
      shapes.push({ id: `shape_${crypto.randomUUID()}`, ...shape });
    }
    selectedId = null;
    saveHistory();

    // 読み込み後に図面全体が画面に収まるよう表示
    fitView();
    redraw();
  } catch (error) {
    console.error('ファイル読み込みエラー', error);
  }
}

redraw();
