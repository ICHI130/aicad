import { snapToGrid } from './canvas.js';

const SNAP_PRIORITY = ['endpoint', 'intersection', 'midpoint', 'quadrant', 'center', 'perpendicular', 'tangent', 'nearest'];

export function findSnapPoint(mmPoint, shapes, viewport, options = {}) {
  const threshold = 10 / viewport.scale;
  const enabled = new Set(options.enabledTypes || SNAP_PRIORITY);
  const excludeShapeId = options.excludeShapeId || null;
  const candidates = [];

  for (const s of shapes) {
    if (excludeShapeId && s.id === excludeShapeId) continue;
    collectCandidates(candidates, mmPoint, s, threshold, enabled);
  }

  if (enabled.has('intersection')) {
    const intersections = getLineIntersections(shapes, excludeShapeId);
    for (const ip of intersections) {
      const d = dist(mmPoint, ip);
      if (d < threshold) candidates.push({ x: ip.x, y: ip.y, type: 'intersection', dist: d });
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => {
      const pa = SNAP_PRIORITY.indexOf(a.type);
      const pb = SNAP_PRIORITY.indexOf(b.type);
      if (pa !== pb) return pa - pb;
      return a.dist - b.dist;
    });
    const best = candidates[0];
    return { x: best.x, y: best.y, type: best.type };
  }

  const g = snapToGrid(mmPoint);
  return { x: g.x, y: g.y, type: 'grid' };
}

function collectCandidates(out, mmPoint, s, threshold, enabled) {
  if (enabled.has('endpoint')) {
    for (const ep of getEndpoints(s)) {
      const d = dist(mmPoint, ep);
      if (d < threshold) out.push({ ...ep, type: 'endpoint', dist: d });
    }
  }

  if (enabled.has('midpoint')) {
    for (const seg of getSegments(s)) {
      const mid = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
      const d = dist(mmPoint, mid);
      if (d < threshold) out.push({ ...mid, type: 'midpoint', dist: d });
    }
  }

  if (enabled.has('quadrant') && (s.type === 'circle' || s.type === 'arc')) {
    const qpts = [
      { x: s.cx + s.r, y: s.cy },
      { x: s.cx - s.r, y: s.cy },
      { x: s.cx, y: s.cy + s.r },
      { x: s.cx, y: s.cy - s.r },
    ];
    for (const q of qpts) {
      if (s.type === 'arc' && !isPointOnArc(q, s)) continue;
      const d = dist(mmPoint, q);
      if (d < threshold) out.push({ ...q, type: 'quadrant', dist: d });
    }
  }

  if (enabled.has('center') && (s.type === 'circle' || s.type === 'arc' || s.type === 'ellipse')) {
    const center = { x: s.cx, y: s.cy };
    const d = dist(mmPoint, center);
    if (d < threshold) out.push({ ...center, type: 'center', dist: d });
  }

  if (enabled.has('nearest')) {
    const nearest = getNearestPointOnShape(mmPoint, s);
    if (nearest) {
      const d = dist(mmPoint, nearest);
      if (d < threshold) out.push({ ...nearest, type: 'nearest', dist: d });
    }
  }

  if (enabled.has('perpendicular') && s.type === 'line') {
    const perp = perpendicularFoot(mmPoint, s);
    if (perp) {
      const d = dist(mmPoint, perp);
      if (d < threshold) out.push({ ...perp, type: 'perpendicular', dist: d });
    }
  }

  if (enabled.has('tangent') && (s.type === 'circle' || s.type === 'arc')) {
    const tangents = tangentPointsFromExternalPoint(mmPoint, s);
    for (const t of tangents) {
      if (s.type === 'arc' && !isPointOnArc(t, s)) continue;
      const d = dist(mmPoint, t);
      if (d < threshold) out.push({ ...t, type: 'tangent', dist: d });
    }
  }
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
  if (s.type === 'polyline_preview' && Array.isArray(s.points)) return s.points;
  if ((s.type === 'spline' || s.type === 'revcloud' || s.type === 'wipeout') && Array.isArray(s.points)) return s.points;
  if (s.type === 'polygon') {
    const pts = [];
    const sides = Math.max(3, Math.round(s.sides || 6));
    for (let i = 0; i < sides; i += 1) {
      const a = (Math.PI * 2 * i / sides) + ((s.rotation || 0) * Math.PI / 180);
      pts.push({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) });
    }
    return pts;
  }
  return [];
}

function getSegments(s) {
  if (s.type === 'line') {
    return [{ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 }];
  }

  if (s.type === 'rect') {
    const p1 = { x: s.x, y: s.y };
    const p2 = { x: s.x + s.w, y: s.y };
    const p3 = { x: s.x + s.w, y: s.y + s.h };
    const p4 = { x: s.x, y: s.y + s.h };
    return [
      { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y },
      { x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y },
      { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y },
      { x1: p4.x, y1: p4.y, x2: p1.x, y2: p1.y },
    ];
  }

  if (s.type === 'polyline_preview' && Array.isArray(s.points) && s.points.length >= 2) {
    const segments = [];
    for (let i = 0; i < s.points.length - 1; i += 1) {
      const a = s.points[i];
      const b = s.points[i + 1];
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return segments;
  }

  if ((s.type === 'spline' || s.type === 'revcloud' || s.type === 'wipeout') && Array.isArray(s.points) && s.points.length >= 2) {
    const segments = [];
    for (let i = 0; i < s.points.length - 1; i += 1) {
      const a = s.points[i];
      const b = s.points[i + 1];
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    if ((s.type === 'revcloud' || s.type === 'wipeout') && s.points.length > 2) {
      const a = s.points[s.points.length - 1];
      const b = s.points[0];
      segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return segments;
  }

  if (s.type === 'polygon') {
    const pts = getEndpoints(s);
    const segs = [];
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return segs;
  }

  return [];
}

function getNearestPointOnShape(p, s) {
  if (s.type === 'line') return perpendicularFoot(p, s);
  if (s.type === 'circle') {
    const vx = p.x - s.cx;
    const vy = p.y - s.cy;
    const len = Math.hypot(vx, vy) || 1;
    return { x: s.cx + (vx / len) * s.r, y: s.cy + (vy / len) * s.r };
  }
  if (s.type === 'arc') {
    const candidate = getNearestPointOnShape(p, { type: 'circle', cx: s.cx, cy: s.cy, r: s.r });
    if (candidate && isPointOnArc(candidate, s)) return candidate;
    const ends = arcEndpoints(s);
    return dist(p, ends[0]) <= dist(p, ends[1]) ? ends[0] : ends[1];
  }
  return null;
}

function perpendicularFoot(p, line) {
  const ax = line.x1;
  const ay = line.y1;
  const bx = line.x2;
  const by = line.y2;
  const dx = bx - ax;
  const dy = by - ay;
  const den = dx * dx + dy * dy;
  if (den < 1e-10) return null;
  const t = ((p.x - ax) * dx + (p.y - ay) * dy) / den;
  const clamped = Math.max(0, Math.min(1, t));
  return { x: ax + dx * clamped, y: ay + dy * clamped };
}

function tangentPointsFromExternalPoint(p, c) {
  const dx = p.x - c.cx;
  const dy = p.y - c.cy;
  const d2 = dx * dx + dy * dy;
  const r2 = c.r * c.r;
  if (d2 <= r2 + 1e-9) return [];
  const root = Math.sqrt(d2 - r2);
  const t1 = {
    x: c.cx + (r2 * dx - c.r * dy * root) / d2,
    y: c.cy + (r2 * dy + c.r * dx * root) / d2,
  };
  const t2 = {
    x: c.cx + (r2 * dx + c.r * dy * root) / d2,
    y: c.cy + (r2 * dy - c.r * dx * root) / d2,
  };
  return [t1, t2];
}

function arcEndpoints(arc) {
  const s = polar(arc.cx, arc.cy, arc.r, arc.startAngle);
  const e = polar(arc.cx, arc.cy, arc.r, arc.endAngle);
  return [s, e];
}

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function isPointOnArc(point, arc) {
  const a = normalizeDeg(Math.atan2(point.y - arc.cy, point.x - arc.cx) * 180 / Math.PI);
  const start = normalizeDeg(arc.startAngle);
  const end = normalizeDeg(arc.endAngle);
  if (start <= end) return a >= start - 1e-6 && a <= end + 1e-6;
  return a >= start - 1e-6 || a <= end + 1e-6;
}

function normalizeDeg(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function getLineIntersections(shapes, excludeShapeId = null) {
  const lines = [];
  for (const s of shapes) {
    if (excludeShapeId && s.id === excludeShapeId) continue;
    for (const seg of getSegments(s)) lines.push(seg);
  }
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
