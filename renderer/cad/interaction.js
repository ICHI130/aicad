import { Tool } from './tools.js';

export function buildPreviewShape({ tool, drawingStart, point, polylinePoints, dimState, mleaderState, arcState, ellipseState, arrayState, normalizeRect, arcFromThreePoints, cloneWithOffset }) {
  if (tool === Tool.LINE && drawingStart) {
    return { type: 'line', x1: drawingStart.x, y1: drawingStart.y, x2: point.x, y2: point.y };
  }

  if (tool === Tool.RECT && drawingStart) {
    const rect = normalizeRect(drawingStart, point);
    return rect.w > 0 && rect.h > 0 ? { type: 'rect', ...rect } : null;
  }

  if (tool === Tool.CIRCLE && drawingStart) {
    return { type: 'circle', cx: drawingStart.x, cy: drawingStart.y, r: Math.hypot(point.x - drawingStart.x, point.y - drawingStart.y) };
  }


  if (tool === Tool.ELLIPSE && ellipseState?.center) {
    const rx = ellipseState.rx ?? Math.abs(point.x - ellipseState.center.x);
    const ry = Math.abs(point.y - ellipseState.center.y);
    if (rx > 0 && ry > 0) return { type: 'ellipse', cx: ellipseState.center.x, cy: ellipseState.center.y, rx, ry, rotation: 0 };
  }


  if (tool === Tool.ARC && arcState?.p1 && arcState?.p2) {
    return arcFromThreePoints(arcState.p1, arcState.p2, point);
  }

  if (tool === Tool.ARRAY && arrayState?.base && arrayState?.source) {
    return cloneWithOffset(arrayState.source, point.x - arrayState.base.x, point.y - arrayState.base.y);
  }

  if (tool === Tool.POLYLINE && polylinePoints.length) {
    return { type: 'polyline_preview', points: [...polylinePoints, point] };
  }

  if (tool === Tool.DIM) {
    if (dimState.mode === 'angular' && dimState.p1 && dimState.p2 && dimState.p3) {
      return {
        type: 'dim',
        dimType: 'angular',
        cx: dimState.p1.x,
        cy: dimState.p1.y,
        pt1x: dimState.p2.x,
        pt1y: dimState.p2.y,
        pt2x: dimState.p3.x,
        pt2y: dimState.p3.y,
        arcR: Math.max(1, Math.hypot(point.x - dimState.p1.x, point.y - dimState.p1.y)),
      };
    }
    if (dimState.mode === 'radius' && dimState.circle) {
      return { type: 'dim', dimType: 'radius', cx: dimState.circle.cx, cy: dimState.circle.cy, r: dimState.circle.r, px: point.x, py: point.y };
    }
    if (dimState.mode === 'ordinate' && dimState.p1) {
      const axis = Math.abs(point.x - dimState.p1.x) >= Math.abs(point.y - dimState.p1.y) ? 'X' : 'Y';
      return { type: 'dim', dimType: 'ordinate', x: dimState.p1.x, y: dimState.p1.y, tx: point.x, ty: point.y, axis };
    }
    if (dimState.p1 && dimState.p2) {
      const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
      const offset = dir === 'h' ? point.y - dimState.p1.y : point.x - dimState.p1.x;
      return { type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir };
    }
  }

  if (tool === Tool.MLEADER && mleaderState?.p1 && mleaderState?.p2) {
    return {
      type: 'mleader',
      x1: mleaderState.p1.x,
      y1: mleaderState.p1.y,
      x2: mleaderState.p2.x,
      y2: mleaderState.p2.y,
      x3: point.x,
      y3: point.y,
      text: mleaderState.text || '注記',
      textHeight: mleaderState.textHeight || 2.5,
    };
  }

  return null;
}
