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

export function snapToGrid(mmPoint, gridSize = 1000) {
  return {
    x: Math.round(mmPoint.x / gridSize) * gridSize,
    y: Math.round(mmPoint.y / gridSize) * gridSize,
  };
}

export function createKonvaCanvas(container) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const stage = new Konva.Stage({
    container,
    width,
    height,
  });

  const gridLayer = new Konva.Layer();
  const drawingLayer = new Konva.Layer();
  stage.add(gridLayer);
  stage.add(drawingLayer);

  return { stage, gridLayer, drawingLayer };
}

export function drawGrid(gridLayer, stage, viewport, gridSize = 1000) {
  gridLayer.destroyChildren();

  const bounds = {
    minX: viewport.x,
    minY: viewport.y,
    maxX: viewport.x + stage.width() / viewport.scale,
    maxY: viewport.y + stage.height() / viewport.scale,
  };

  const startX = Math.floor(bounds.minX / gridSize) * gridSize;
  const endX = Math.ceil(bounds.maxX / gridSize) * gridSize;
  const startY = Math.floor(bounds.minY / gridSize) * gridSize;
  const endY = Math.ceil(bounds.maxY / gridSize) * gridSize;

  for (let x = startX; x <= endX; x += gridSize) {
    const sx = (x - viewport.x) * viewport.scale;
    gridLayer.add(new Konva.Line({ points: [sx, 0, sx, stage.height()], stroke: '#232a33', strokeWidth: 1 }));
  }

  for (let y = startY; y <= endY; y += gridSize) {
    const sy = (y - viewport.y) * viewport.scale;
    gridLayer.add(new Konva.Line({ points: [0, sy, stage.width(), sy], stroke: '#232a33', strokeWidth: 1 }));
  }

  gridLayer.draw();
}
