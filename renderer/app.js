import { createKonvaCanvas, drawGrid, screenToMm, snapToGrid } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { parseDxf, dxfEntitiesToShapes } from './io/dxf.js';
import { parseJww, jwwEntitiesToShapes } from './io/jww.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';

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
    const node = buildShapeNode(shape, viewport);
    if (shape.id === selectedId) {
      node.stroke('#ff7a7a');
      node.strokeWidth(3);
    }
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
  if (event.evt.button === 1) {
    isPanning = true;
    panStart = stage.getPointerPosition();
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
    }
    drawingStart = null;
    previewShape = null;
    redraw();
    return;
  }

  if (dragState) {
    dragState = null;
  }
});

stage.on('wheel', (event) => {
  event.evt.preventDefault();
  const pointer = stage.getPointerPosition();
  if (!pointer) return;

  const before = screenToMm(pointer, viewport);
  const direction = event.evt.deltaY > 0 ? -1 : 1;
  const factor = direction > 0 ? 1.1 : 0.9;
  viewport.scale = Math.max(0.1, Math.min(10, viewport.scale * factor));
  viewport.x = before.x - pointer.x / viewport.scale;
  viewport.y = before.y - pointer.y / viewport.scale;

  redraw();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Delete' && selectedId) {
    const index = shapes.findIndex((s) => s.id === selectedId);
    if (index !== -1) {
      shapes.splice(index, 1);
      selectedId = null;
      redraw();
    }
  }
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
      imported = dxfEntitiesToShapes(parseDxf(result.content));
    } else if (ext === 'jww' || ext === 'jwc') {
      imported = jwwEntitiesToShapes(parseJww(result.content));
    }

    if (imported.length === 0) {
      return;
    }

    for (const shape of imported) {
      shapes.push({ id: `shape_${crypto.randomUUID()}`, ...shape });
    }
    selectedId = null;
    redraw();
  } catch (error) {
    console.error('ファイル読み込みエラー', error);
  }
}

redraw();
