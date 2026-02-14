import { Tool } from './tools.js';

export function buildPreviewShape({ tool, drawingStart, point, polylinePoints, dimState, arcState, arrayState, normalizeRect, arcFromThreePoints, cloneWithOffset }) {
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


  if (tool === Tool.ARC && arcState?.p1 && arcState?.p2) {
    return arcFromThreePoints(arcState.p1, arcState.p2, point);
  }

  if (tool === Tool.ARRAY && arrayState?.base && arrayState?.source) {
    return cloneWithOffset(arrayState.source, point.x - arrayState.base.x, point.y - arrayState.base.y);
  }

  if (tool === Tool.POLYLINE && polylinePoints.length) {
    return { type: 'polyline_preview', points: [...polylinePoints, point] };
  }

  if (tool === Tool.DIM && dimState.p1 && dimState.p2) {
    const dir = Math.abs(dimState.p2.x - dimState.p1.x) > Math.abs(dimState.p2.y - dimState.p1.y) ? 'h' : 'v';
    const offset = dir === 'h' ? point.y - dimState.p1.y : point.x - dimState.p1.x;
    return { type: 'dim', x1: dimState.p1.x, y1: dimState.p1.y, x2: dimState.p2.x, y2: dimState.p2.y, offset, dir };
  }

  return null;
}
