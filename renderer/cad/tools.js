import { mmToScreen, snapToGrid } from './canvas.js';

export const Tool = {
  SELECT: 'select',
  LINE: 'line',
  RECT: 'rect',
};

// AutoCAD風カラー
const COLOR_LINE    = '#00bfff';  // 水色（AutoCADデフォルト）
const COLOR_ARC     = '#00bfff';
const COLOR_RECT    = '#00bfff';
const COLOR_PREVIEW = '#ffff00';  // 黄色（作図中プレビュー）
const COLOR_SELECT  = '#ff4444';  // 赤（選択中）

export function buildShapeNode(shape, viewport, options = {}) {
  const { isPreview = false, isSelected = false } = options;

  // 線幅は常に1px（ズームしても細いままがAutoCAD風）
  const sw = 1;
  const color = isPreview ? COLOR_PREVIEW : isSelected ? COLOR_SELECT : COLOR_LINE;

  if (shape.type === 'line') {
    const p1 = mmToScreen({ x: shape.x1, y: shape.y1 }, viewport);
    const p2 = mmToScreen({ x: shape.x2, y: shape.y2 }, viewport);
    return new Konva.Line({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: color,
      strokeWidth: sw,
      dash: isPreview ? [8, 4] : undefined,
      id: shape.id,
      listening: !isPreview,
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
      stroke: color,
      strokeWidth: sw,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'text') {
    const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
    const fontSize = Math.max(6, shape.height * viewport.scale);
    // アライメント: 0=左, 1=中央, 2=右
    const alignMap = ['left', 'center', 'right'];
    const node = new Konva.Text({
      x: p.x,
      y: p.y,
      text: shape.text,
      fontSize,
      fontFamily: 'MS Gothic, IPAGothic, monospace',
      fill: color,
      // DXFは反時計回り正、Konvaは時計回り正 → 符号を反転
      // ただしY軸自体が反転しているため符号そのままでOK
      rotation: shape.rotation || 0,
      align: alignMap[shape.align || 0] || 'left',
      id: shape.id,
      listening: !isPreview,
    });
    // DXFのテキスト基点はベースライン左端（Y上向き）
    // スクリーンはY下向きなので、テキストをfontSize分上にオフセット
    node.offsetY(fontSize);
    return node;
  }

  if (shape.type === 'point') {
    const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
    const size = 3;
    return new Konva.Line({
      points: [p.x - size, p.y, p.x + size, p.y],
      stroke: color,
      strokeWidth: sw,
      id: shape.id,
      listening: !isPreview,
    });
  }

  // rect
  const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
  return new Konva.Rect({
    x: p.x,
    y: p.y,
    width: shape.w * viewport.scale,
    height: shape.h * viewport.scale,
    stroke: color,
    strokeWidth: sw,
    dash: isPreview ? [8, 4] : undefined,
    id: shape.id,
    listening: !isPreview,
  });
}

function normalizeArcAngle(startAngle, endAngle) {
  const raw = (endAngle || 0) - (startAngle || 0);
  if (raw === 0) return 360;
  return raw > 0 ? raw : 360 + raw;
}

export function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  };
}
