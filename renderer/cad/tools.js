import { mmToScreen, snapToGrid } from './canvas.js';

export const Tool = {
  SELECT: 'select',
  LINE: 'line',
  RECT: 'rect',
};

export function buildShapeNode(shape, viewport, options = {}) {
  const { isPreview = false } = options;

  if (shape.type === 'line') {
    const p1 = mmToScreen({ x: shape.x1, y: shape.y1 }, viewport);
    const p2 = mmToScreen({ x: shape.x2, y: shape.y2 }, viewport);
    return new Konva.Line({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: isPreview ? '#5ab0ff' : '#9ed0ff',
      opacity: isPreview ? 0.9 : 1,
      strokeWidth: 2,
      dash: isPreview ? [6, 4] : undefined,
      id: shape.id,
    });
  }

  if (shape.type === 'arc') {
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    const angle = normalizeArcAngle(shape.startAngle, shape.endAngle);
    return new Konva.Arc({
      x: c.x,
      y: c.y,
      innerRadius: shape.r * viewport.scale,
      outerRadius: shape.r * viewport.scale,
      angle,
      rotation: shape.startAngle,
      stroke: '#7be8cc',
      strokeWidth: 2,
      id: shape.id,
    });
  }

  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  return new Konva.Rect({
    x: p.x,
    y: p.y,
    width: shape.w * viewport.scale,
    height: shape.h * viewport.scale,
    stroke: isPreview ? '#ffde85' : '#ffd16a',
    opacity: isPreview ? 0.9 : 1,
    strokeWidth: 2,
    dash: isPreview ? [6, 4] : undefined,
    id: shape.id,
  });
}

function normalizeArcAngle(startAngle, endAngle) {
  const raw = (endAngle || 0) - (startAngle || 0);
  if (raw === 0) return 360;
  return raw > 0 ? raw : 360 + raw;
}

export function normalizeRect(start, end) {
  const s = snapToGrid(start);
  const e = snapToGrid(end);
  return {
    x: Math.min(s.x, e.x),
    y: Math.min(s.y, e.y),
    w: Math.abs(e.x - s.x),
    h: Math.abs(e.y - s.y),
  };
}
