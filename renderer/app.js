import { createKonvaCanvas, drawGrid, screenToMm, snapToGrid } from './cad/canvas.js';
import { Tool, buildShapeNode, normalizeRect } from './cad/tools.js';
import { initToolbar } from './ui/toolbar.js';
import { initStatusbar } from './ui/statusbar.js';
import { initSidebar } from './ui/sidebar.js';

const container = document.getElementById('cad-root');
const { stage, gridLayer, drawingLayer } = createKonvaCanvas(container);

const viewport = { x: 0, y: 0, scale: 1 };
const shapes = [];
let tool = Tool.SELECT;
let startPoint = null;
let selectedId = null;
let isPanning = false;
let lastPointer = null;

const toolbar = initToolbar((nextTool) => {
  tool = nextTool;
  startPoint = null;
  toolbar.setActive(tool);
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

initSidebar({
  getDrawingContext() {
    const elements = shapes.map((s) => {
      if (s.type === 'line') {
        return { type: 'line', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, layer: 'default' };
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
    } else {
      const d = distancePointToSegment(mmPoint, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
      if (d <= threshold) return s;
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

  drawingLayer.draw();
}

stage.on('mousemove', () => {
  const mm = pointerToMm();
  statusbar.updateCursor(mm);

  if (isPanning && lastPointer) {
    const now = stage.getPointerPosition();
    const dx = (now.x - lastPointer.x) / viewport.scale;
    const dy = (now.y - lastPointer.y) / viewport.scale;
    viewport.x -= dx;
    viewport.y -= dy;
    lastPointer = now;
    redraw();
  }
});

stage.on('mousedown', (event) => {
  if (event.evt.button === 1) {
    isPanning = true;
    lastPointer = stage.getPointerPosition();
    return;
  }

  const mm = snapToGrid(pointerToMm());

  if (tool === Tool.SELECT) {
    const hit = pickShape(mm);
    selectedId = hit?.id || null;
    startPoint = hit ? mm : null;
    redraw();
    return;
  }

  if (!startPoint) {
    startPoint = mm;
    return;
  }

  const id = `shape_${crypto.randomUUID()}`;
  if (tool === Tool.LINE) {
    shapes.push({ id, type: 'line', x1: startPoint.x, y1: startPoint.y, x2: mm.x, y2: mm.y });
  }

  if (tool === Tool.RECT) {
    const rect = normalizeRect(startPoint, mm);
    if (rect.w > 0 && rect.h > 0) {
      shapes.push({ id, type: 'rect', ...rect });
    }
  }

  selectedId = id;
  startPoint = null;
  redraw();
});

stage.on('mouseup', (event) => {
  if (event.evt.button === 1) {
    isPanning = false;
    lastPointer = null;
    return;
  }

  if (tool === Tool.SELECT && selectedId && startPoint) {
    const target = shapes.find((s) => s.id === selectedId);
    if (target) {
      const mm = snapToGrid(pointerToMm());
      const dx = mm.x - startPoint.x;
      const dy = mm.y - startPoint.y;
      if (target.type === 'rect') {
        target.x += dx;
        target.y += dy;
      } else {
        target.x1 += dx;
        target.y1 += dy;
        target.x2 += dx;
        target.y2 += dy;
      }
      redraw();
    }
    startPoint = null;
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

redraw();
