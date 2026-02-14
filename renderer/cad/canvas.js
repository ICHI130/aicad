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

// スナップは常に1mm固定
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
  stage.add(gridLayer);
  stage.add(drawingLayer);
  return { stage, gridLayer, drawingLayer };
}

export function drawGrid(gridLayer, stage, viewport) {
  gridLayer.destroyChildren();
  const scale = viewport.scale;
  const w = stage.width();
  const h = stage.height();

  // 1mm = 1px * scale
  // scaleが小さいと1mmグリッドが細かすぎるので、表示はズームに応じて間引く
  // ただしスナップは常に1mm

  // グリッド間隔: 画面上で最低1px間隔になるmm数（1mm基準）
  // scale=1 → 1mm=1px → gridMm=1 で1mmグリッド表示
  // ズームアウト時は自動間引き（線が細かくなりすぎないよう1px以上を維持）
  const candidates = [1, 2, 5, 10, 20, 50, 100, 500, 1000];
  let gridMm = 1000;
  for (const mm of candidates) {
    if (mm * scale >= 1) { gridMm = mm; break; }
  }

  // メイングリッド（少し明るい）: gridMm * 10
  const mainGridMm = gridMm * 10;

  // サブグリッド描画（薄い）
  const startX = Math.floor(viewport.x / gridMm) * gridMm;
  const endX   = viewport.x + w / scale;
  const startY = Math.floor(viewport.y / gridMm) * gridMm;
  const endY   = viewport.y + h / scale;

  for (let x = startX; x <= endX; x += gridMm) {
    const sx = (x - viewport.x) * scale;
    const isMain = Math.round(x) % mainGridMm === 0;
    gridLayer.add(new Konva.Line({
      points: [sx, 0, sx, h],
      stroke: isMain ? '#263340' : '#1a2530',
      strokeWidth: 1,
      listening: false,
    }));
  }
  for (let y = startY; y <= endY; y += gridMm) {
    const sy = (y - viewport.y) * scale;
    const isMain = Math.round(y) % mainGridMm === 0;
    gridLayer.add(new Konva.Line({
      points: [0, sy, w, sy],
      stroke: isMain ? '#263340' : '#1a2530',
      strokeWidth: 1,
      listening: false,
    }));
  }

  // 原点ライン（X=0, Y=0）を少し明るく
  const ox = (0 - viewport.x) * scale;
  const oy = (0 - viewport.y) * scale;
  if (ox >= 0 && ox <= w) gridLayer.add(new Konva.Line({ points: [ox, 0, ox, h], stroke: '#3a5068', strokeWidth: 1, listening: false }));
  if (oy >= 0 && oy <= h) gridLayer.add(new Konva.Line({ points: [0, oy, w, oy], stroke: '#3a5068', strokeWidth: 1, listening: false }));

  gridLayer.draw();
}
