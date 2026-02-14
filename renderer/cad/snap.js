import { snapToGrid } from './canvas.js';

export function findSnapPoint(mmPoint, shapes, viewport) {
  const threshold = 8 / viewport.scale;

  for (const s of shapes) {
    for (const ep of getEndpoints(s)) {
      if (dist(mmPoint, ep) < threshold) return { x: ep.x, y: ep.y, type: 'endpoint' };
    }
  }

  for (const s of shapes) {
    if (s.type !== 'line') continue;
    const mid = { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    if (dist(mmPoint, mid) < threshold) return { x: mid.x, y: mid.y, type: 'midpoint' };
  }

  for (const s of shapes) {
    if (s.type !== 'circle' && s.type !== 'arc') continue;
    const qpts = [
      { x: s.cx + s.r, y: s.cy },
      { x: s.cx - s.r, y: s.cy },
      { x: s.cx, y: s.cy + s.r },
      { x: s.cx, y: s.cy - s.r },
    ];
    for (const q of qpts) {
      if (dist(mmPoint, q) < threshold) return { x: q.x, y: q.y, type: 'quadrant' };
    }
  }

  const g = snapToGrid(mmPoint);
  return { x: g.x, y: g.y, type: 'grid' };
}

function getEndpoints(s) {
  if (s.type === 'line') return [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }];
  if (s.type === 'rect') {
    return [
      { x: s.x, y: s.y },
      { x: s.x + s.w, y: s.y },
      { x: s.x + s.w, y: s.y + s.h },
      { x: s.x, y: s.y + s.h },
    ];
  }
  return [];
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
