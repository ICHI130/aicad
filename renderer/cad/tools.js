import { mmToScreen, snapToGrid } from './canvas.js';

export const Tool = {
  SELECT: 'select',
  LINE: 'line',
  RECT: 'rect',
};

export function buildShapeNode(shape, viewport) {
  if (shape.type === 'line') {
    const p1 = mmToScreen({ x: shape.x1, y: shape.y1 }, viewport);
    const p2 = mmToScreen({ x: shape.x2, y: shape.y2 }, viewport);
    return new Konva.Line({ points: [p1.x, p1.y, p2.x, p2.y], stroke: '#9ed0ff', strokeWidth: 2, id: shape.id });
  }

  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  return new Konva.Rect({
    x: p.x,
    y: p.y,
    width: shape.w * viewport.scale,
    height: shape.h * viewport.scale,
    stroke: '#ffd16a',
    strokeWidth: 2,
    id: shape.id,
  });
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
