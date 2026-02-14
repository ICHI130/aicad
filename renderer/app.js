import { createKonvaCanvas, drawGrid, mmToScreen, screenToMm } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { findSnapPoint } from './cad/snap.js';
import { parseDxf, dxfEntitiesToShapes, exportDxf } from './io/dxf.js';
import { parseJww, parseJwwBinary, jwwEntitiesToShapes } from './io/jww.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';

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

const container = document.getElementById('cad-root');
const { stage, gridLayer, drawingLayer, snapLayer } = createKonvaCanvas(container);

const viewport = { x: 0, y: 0, scale: 1 };
const shapes = [];
let tool = Tool.SELECT;
let drawingStart = null;
let previewShape = null;
let selectedId = null;
let isPanning = false;
let panStart = null;
let dragState = null;
let polylinePoints = [];
let clipboard = null;
let moveState = null;
let rotateState = null;
let dimState = { p1: null, p2: null };
let latestSnap = { x: 0, y: 0, type: 'grid' };

const history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

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
  redraw();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  shapes.length = 0;
  for (const s of history[historyIndex]) shapes.push(s);
  selectedId = null;
  redraw();
}

saveHistory();

let lastMiddleClickTime = 0;
let lastKey = '';

const toolbar = initToolbar({
  onChangeTool(nextTool) {
    tool = nextTool;
    drawingStart = null;
    previewShape = null;
    polylinePoints = [];
    moveState = null;
    rotateState = null;
    dimState = { p1: null, p2: null };
    toolbar.setActive(tool);
    redraw();
  },
  onOpenFile: openCadFile,
  onExportDxf: exportCurrentDxf,
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

if (window.cadBridge?.onMenuOpenFile) window.cadBridge.onMenuOpenFile(() => openCadFile());

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
});

function computeBoundingBox(elements) {
  if (!elements.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = [];
  const ys = [];
  for (const e of elements) {
    if (e.type === 'line') {
      xs.push(e.x1, e.x2); ys.push(e.y1, e.y2);
    } else if (e.type === 'arc' || e.type === 'circle') {
      xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r);
    } else if (e.type === 'text' || e.type === 'point') {
      xs.push(e.x); ys.push(e.y);
    } else if (e.type === 'dim') {
      xs.push(e.x1, e.x2); ys.push(e.y1, e.y2);
    } else {
      xs.push(e.x, e.x + e.w); ys.push(e.y, e.y + e.h);
    }
  }
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function pointerToMm() {
  const pointer = stage.getPointerPosition();
  if (!pointer) return { x: 0, y: 0 };
  return screenToMm(pointer, viewport);
}

function getSnap() {
  latestSnap = findSnapPoint(pointerToMm(), shapes, viewport);
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
      const d = distancePointToSegment(mmPoint, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (d <= threshold) return s;
      continue;
    }
    if (s.type === 'arc' || s.type === 'circle') {
      const distance = Math.hypot(mmPoint.x - s.cx, mmPoint.y - s.cy);
      if (Math.abs(distance - s.r) <= threshold) return s;
      continue;
    }
    if (s.type === 'text') {
      const approxW = s.text.length * s.height * 0.7;
      if (mmPoint.x >= s.x - threshold && mmPoint.x <= s.x + approxW + threshold && mmPoint.y >= s.y - s.height - threshold && mmPoint.y <= s.y + threshold) return s;
      continue;
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

function redrawSnapMarker() {
  snapLayer.destroyChildren();
  if (!latestSnap || latestSnap.type === 'grid') {
    snapLayer.draw();
    return;
  }
  const p = mmToScreen(latestSnap, viewport);
  if (latestSnap.type === 'endpoint' || latestSnap.type === 'quadrant') {
    snapLayer.add(new Konva.Rect({ x: p.x - 4, y: p.y - 4, width: 8, height: 8, stroke: '#00ff66', strokeWidth: 1 }));
  } else if (latestSnap.type === 'midpoint') {
    snapLayer.add(new Konva.Line({ points: [p.x, p.y - 5, p.x - 5, p.y + 4, p.x + 5, p.y + 4, p.x, p.y - 5], stroke: '#ffdd33', strokeWidth: 1, closed: true }));
  }
  snapLayer.draw();
}

function redraw() {
  drawGrid(gridLayer, stage, viewport);
  drawingLayer.destroyChildren();
  for (const shape of shapes) {
    drawingLayer.add(buildShapeNode(shape, viewport, { isSelected: shape.id === selectedId }));
  }
  if (previewShape) drawingLayer.add(buildShapeNode(previewShape, viewport, { isPreview: true }));
  drawingLayer.draw();
  redrawSnapMarker();
}

function shapeClone(shape) {
  return JSON.parse(JSON.stringify(shape));
}

function applyMove(shape, dx, dy) {
  if (shape.type === 'rect') { shape.x += dx; shape.y += dy; return; }
  if (shape.type === 'line' || shape.type === 'dim') { shape.x1 += dx; shape.y1 += dy; shape.x2 += dx; shape.y2 += dy; return; }
  if (shape.type === 'arc' || shape.type === 'circle') { shape.cx += dx; shape.cy += dy; return; }
  if (shape.type === 'text' || shape.type === 'point') { shape.x += dx; shape.y += dy; }
}

function rotatePoint(px, py, cx, cy, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
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
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    shape.x = Math.min(...xs); shape.y = Math.min(...ys); shape.w = Math.max(...xs) - shape.x; shape.h = Math.max(...ys) - shape.y;
  } else if (shape.type === 'arc' || shape.type === 'circle') {
    const c = rotatePoint(shape.cx, shape.cy, center.x, center.y, angleDeg);
    shape.cx = c.x; shape.cy = c.y;
    if (shape.type === 'arc') {
      shape.startAngle += angleDeg;
      shape.endAngle += angleDeg;
    }
  } else if (shape.type === 'text' || shape.type === 'point') {
    const p = rotatePoint(shape.x, shape.y, center.x, center.y, angleDeg);
    shape.x = p.x; shape.y = p.y;
    if (shape.type === 'text') shape.rotation = (shape.rotation || 0) + angleDeg;
  }
}

function fitView(targetShapes) {
  const all = targetShapes || shapes;
  if (!all.length) return;
  const xs = [];
  const ys = [];
  for (const s of all) {
    if (s.type === 'line' || s.type === 'dim') { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); }
    else if (s.type === 'arc' || s.type === 'circle') { xs.push(s.cx - s.r, s.cx + s.r); ys.push(s.cy - s.r, s.cy + s.r); }
    else if (s.type === 'rect') { xs.push(s.x, s.x + s.w); ys.push(s.y, s.y + s.h); }
    else if (s.type === 'text' || s.type === 'point') { xs.push(s.x); ys.push(s.y); }
  }
  if (!xs.length) return;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  viewport.scale = Math.min((stage.width() * 0.9) / w, (stage.height() * 0.9) / h);
  viewport.x = minX - (stage.width() / viewport.scale - w) / 2;
  viewport.y = minY - (stage.height() / viewport.scale - h) / 2;
  redraw();
}

function finishPolyline(closeLoop = false) {
  if (polylinePoints.length < 2) return;
  const points = [...polylinePoints];
  if (closeLoop) points.push(points[0]);
  for (let i = 1; i < points.length; i += 1) {
    shapes.push({ id: `shape_${crypto.randomUUID()}`, type: 'line', x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y });
  }
  selectedId = null;
  saveHistory();
  polylinePoints = [];
  previewShape = null;
  redraw();
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

stage.on('mousemove', () => {
  const mm = getSnap();
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
    const dx = mm.x - dragState.anchor.x;
    const dy = mm.y - dragState.anchor.y;
    const target = shapes.find((s) => s.id === dragState.id);
    if (target) {
      Object.assign(target, shapeClone(dragState.original));
      applyMove(target, dx, dy);
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
    if (now - lastMiddleClickTime < 400) { fitView(); lastMiddleClickTime = 0; } else { lastMiddleClickTime = now; isPanning = true; panStart = stage.getPointerPosition(); }
    return;
  }

  const mm = getSnap();

  if (tool === Tool.SELECT) {
    const hit = pickShape(mm);
    selectedId = hit?.id || null;
    dragState = hit ? { id: hit.id, anchor: mm, original: shapeClone(hit) } : null;
    redraw();
    return;
  }

  if (tool === Tool.MOVE) {
    if (!selectedId) return;
    if (!moveState) {
      moveState = { base: mm };
      return;
    }
    const target = shapes.find((s) => s.id === selectedId);
    if (!target) return;
    applyMove(target, mm.x - moveState.base.x, mm.y - moveState.base.y);
    moveState = null;
    tool = Tool.SELECT;
    toolbar.setActive(tool);
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
      return;
    }
    rotateState = null;
    tool = Tool.SELECT;
    toolbar.setActive(tool);
    saveHistory();
    redraw();
    return;
  }

  if (tool === Tool.LINE) {
    if (!drawingStart) { drawingStart = mm; return; }
    const id = `shape_${crypto.randomUUID()}`;
    shapes.push({ id, type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: mm.x, y2: mm.y });
    selectedId = id;
    drawingStart = null;
    previewShape = null;
    saveHistory();
    redraw();
    return;
  }

  if (tool === Tool.CIRCLE) {
    if (!drawingStart) { drawingStart = mm; return; }
    const r = Math.hypot(mm.x - drawingStart.x, mm.y - drawingStart.y);
    if (r > 0) {
      const id = `shape_${crypto.randomUUID()}`;
      shapes.push({ id, type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r });
      selectedId = id;
      saveHistory();
    }
    drawingStart = null;
    previewShape = null;
    redraw();
    return;
  }

  if (tool === Tool.POLYLINE) {
    if (!polylinePoints.length) {
      polylinePoints.push(mm);
      return;
    }
    if (Math.hypot(mm.x - polylinePoints[0].x, mm.y - polylinePoints[0].y) < 6 / viewport.scale && polylinePoints.length > 2) {
      finishPolyline(true);
      return;
    }
    polylinePoints.push(mm);
    redraw();
    return;
  }

  if (tool === Tool.DIM) {
    if (!dimState.p1) { dimState.p1 = mm; return; }
    if (!dimState.p2) { dimState.p2 = mm; return; }
    const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
    const offset = dir === 'h' ? mm.y - dimState.p1.y : mm.x - dimState.p1.x;
    shapes.push({ id: `shape_${crypto.randomUUID()}`, type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir });
    dimState = { p1: null, p2: null };
    previewShape = null;
    saveHistory();
    redraw();
    return;
  }

  if (tool === Tool.RECT) drawingStart = mm;
});

stage.on('mouseup', (event) => {
  if (event.evt.button === 1) { isPanning = false; panStart = null; return; }
  if (tool === Tool.RECT && drawingStart) {
    const mm = getSnap();
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
    saveHistory();
    dragState = null;
  }
});

stage.on('contextmenu', (event) => {
  event.evt.preventDefault();
  if (tool === Tool.POLYLINE) finishPolyline(false);
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

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); return; }
  if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); redo(); return; }

  if ((event.ctrlKey || event.metaKey) && key === 'c' && selectedId) {
    const target = shapes.find((s) => s.id === selectedId);
    if (target) clipboard = shapeClone(target);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'v' && clipboard) {
    const pasted = cloneWithOffset(clipboard, 10, 10);
    shapes.push(pasted);
    selectedId = pasted.id;
    saveHistory();
    redraw();
    return;
  }

  if (event.key === 'Escape') {
    drawingStart = null;
    previewShape = null;
    polylinePoints = [];
    moveState = null;
    rotateState = null;
    dimState = { p1: null, p2: null };
    tool = Tool.SELECT;
    toolbar.setActive(tool);
    redraw();
    return;
  }

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

  if (key === 'enter' && tool === Tool.POLYLINE) {
    finishPolyline(false);
    return;
  }

  if (key === 'c' && tool === Tool.POLYLINE) {
    finishPolyline(true);
    return;
  }

  if (key === 'm' && selectedId) {
    tool = Tool.MOVE;
    moveState = null;
    toolbar.setActive(tool);
    return;
  }

  if (key === 'r' && selectedId) {
    tool = Tool.ROTATE;
    rotateState = null;
    toolbar.setActive(tool);
    return;
  }

  if (key === 'z') { lastKey = 'z'; return; }
  if (key === 'a' && lastKey === 'z') { fitView(); lastKey = ''; return; }
  if (key === 'f') { fitView(); lastKey = ''; return; }

  lastKey = '';
});

window.addEventListener('resize', () => {
  stage.width(container.clientWidth);
  stage.height(container.clientHeight);
  redraw();
});

async function openCadFile() {
  if (!window.cadBridge?.openFile) return;
  try {
    const result = await window.cadBridge.openFile();
    if (!result || result.canceled) return;
    const ext = result.filePath.split('.').pop()?.toLowerCase();
    let imported = [];

    if (ext === 'dxf') imported = dxfEntitiesToShapes(parseDxf(decodeDxfBase64(result.base64)));
    else if (ext === 'jww' || ext === 'jwc') imported = result.isBinary && result.base64 ? jwwEntitiesToShapes(parseJwwBinary(result.base64)) : jwwEntitiesToShapes(parseJww(result.content));

    if (!imported.length) return;
    for (const shape of imported) shapes.push({ id: `shape_${crypto.randomUUID()}`, ...shape });
    selectedId = null;
    saveHistory();
    fitView();
    redraw();
  } catch (error) {
    console.error('ファイル読み込みエラー', error);
  }
}

redraw();
