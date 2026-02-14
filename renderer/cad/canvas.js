export function mmToScreen(point, viewport) {
  return {
    x: (point.x - viewport.x) * viewport.scale,
    y: (point.y - viewport.y) * viewport.scale,
  };
}

export function screenToMm(point, viewport) {
  return {
    x: point.x / viewport.scale + viewport.x,
    y: point.y / viewport.scale + viewport.y,
  };
}

export function snapToGrid(mmPoint) {
  return {
    x: Math.round(mmPoint.x),
    y: Math.round(mmPoint.y),
  };
}

export function createKonvaCanvas(container) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const stage = new Konva.Stage({ container, width, height });
  const gridLayer = new Konva.Layer();
  const drawingLayer = new Konva.Layer();
  const snapLayer = new Konva.Layer({ listening: false });
  stage.add(gridLayer);
  stage.add(drawingLayer);
  stage.add(snapLayer);
  return { stage, gridLayer, drawingLayer, snapLayer };
}

export function drawGrid(gridLayer, stage, viewport) {
  gridLayer.destroyChildren();
  const scale = viewport.scale;
  const w = stage.width();
  const h = stage.height();

  const candidates = [1, 2, 5, 10, 20, 50, 100, 500, 1000];
  let gridMm = 1000;
  for (const mm of candidates) {
    if (mm * scale >= 1) { gridMm = mm; break; }
  }

  const mainGridMm = gridMm * 10;
  const startX = Math.floor(viewport.x / gridMm) * gridMm;
  const endX = viewport.x + w / scale;
  const startY = Math.floor(viewport.y / gridMm) * gridMm;
  const endY = viewport.y + h / scale;

  for (let x = startX; x <= endX; x += gridMm) {
    const sx = (x - viewport.x) * scale;
    const isMain = Math.round(x) % mainGridMm === 0;
    gridLayer.add(new Konva.Line({ points: [sx, 0, sx, h], stroke: isMain ? '#263340' : '#1a2530', strokeWidth: 1, listening: false }));
  }
  for (let y = startY; y <= endY; y += gridMm) {
    const sy = (y - viewport.y) * scale;
    const isMain = Math.round(y) % mainGridMm === 0;
    gridLayer.add(new Konva.Line({ points: [0, sy, w, sy], stroke: isMain ? '#263340' : '#1a2530', strokeWidth: 1, listening: false }));
  }

  const ox = (0 - viewport.x) * scale;
  const oy = (0 - viewport.y) * scale;
  if (ox >= 0 && ox <= w) gridLayer.add(new Konva.Line({ points: [ox, 0, ox, h], stroke: '#3a5068', strokeWidth: 1, listening: false }));
  if (oy >= 0 && oy <= h) gridLayer.add(new Konva.Line({ points: [0, oy, w, oy], stroke: '#3a5068', strokeWidth: 1, listening: false }));

  gridLayer.draw();
}
