import { snapToGrid } from './canvas.js';

export function findSnapPoint(mmPoint, shapes, viewport) {
  const threshold = 10 / viewport.scale;

  for (const s of shapes) {
    for (const ep of getEndpoints(s)) {
      if (dist(mmPoint, ep) < threshold) return { x: ep.x, y: ep.y, type: 'endpoint' };
    }
  }

  const intersections = getLineIntersections(shapes);
  for (const ip of intersections) {
    if (dist(mmPoint, ip) < threshold) return { x: ip.x, y: ip.y, type: 'intersection' };
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

function getLineIntersections(shapes) {
  const lines = shapes.filter((s) => s.type === 'line');
  const intersections = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const p = lineIntersection(lines[i], lines[j]);
      if (p) intersections.push(p);
    }
  }
  return intersections;
}

function lineIntersection(l1, l2) {
  const d1x = l1.x2 - l1.x1;
  const d1y = l1.y2 - l1.y1;
  const d2x = l2.x2 - l2.x1;
  const d2y = l2.y2 - l2.y1;
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return null;

  const t = ((l2.x1 - l1.x1) * d2y - (l2.y1 - l1.y1) * d2x) / cross;
  const u = ((l2.x1 - l1.x1) * d1y - (l2.y1 - l1.y1) * d1x) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;

  return { x: l1.x1 + t * d1x, y: l1.y1 + t * d1y };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
