import { mmToScreen, snapToGrid } from './canvas.js';

export const Tool = {
  SELECT: 'select',
  LINE: 'line',
  RECT: 'rect',
  CIRCLE: 'circle',
  ARC: 'arc',
  POLYLINE: 'polyline',
  DIM: 'dim',
  MOVE: 'move',
  COPY: 'copy',
  ROTATE: 'rotate',
  SCALE: 'scale',
  OFFSET: 'offset',
  MIRROR: 'mirror',
  TRIM: 'trim',
  EXTEND: 'extend',
  FILLET: 'fillet',
  ARRAY: 'array',
  HATCH: 'hatch',
  TEXT: 'text',
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

  if (shape.type === 'circle') {
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    return new Konva.Circle({
      x: c.x,
      y: c.y,
      radius: shape.r * viewport.scale,
      stroke: color,
      strokeWidth: sw,
      fill: 'transparent',
      dash: isPreview ? [8, 4] : undefined,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'polyline_preview') {
    const points = [];
    for (const point of shape.points) {
      const p = mmToScreen(point, viewport);
      points.push(p.x, p.y);
    }
    return new Konva.Line({
      points,
      stroke: color,
      strokeWidth: sw,
      dash: [8, 4],
      id: shape.id,
      listening: false,
    });
  }

  if (shape.type === 'dim') {
    const group = new Konva.Group({ listening: !isPreview, id: shape.id });
    const vertical = shape.dir === 'v';
    const isAligned = shape.dir === 'a';
    const p1 = { x: shape.x1, y: shape.y1 };
    const p2 = { x: shape.x2, y: shape.y2 };
    const off = shape.offset || 10;
    let d1 = { ...p1 };
    let d2 = { ...p2 };

    if (vertical) {
      d1.x += off;
      d2.x += off;
    } else if (isAligned) {
      const vx = p2.x - p1.x;
      const vy = p2.y - p1.y;
      const len = Math.hypot(vx, vy) || 1;
      const nx = -vy / len;
      const ny = vx / len;
      d1 = { x: p1.x + nx * off, y: p1.y + ny * off };
      d2 = { x: p2.x + nx * off, y: p2.y + ny * off };
    } else {
      d1.y += off;
      d2.y += off;
    }

    const p1s = mmToScreen(p1, viewport);
    const p2s = mmToScreen(p2, viewport);
    const d1s = mmToScreen(d1, viewport);
    const d2s = mmToScreen(d2, viewport);

    group.add(new Konva.Line({ points: [p1s.x, p1s.y, d1s.x, d1s.y], stroke: color, strokeWidth: sw }));
    group.add(new Konva.Line({ points: [p2s.x, p2s.y, d2s.x, d2s.y], stroke: color, strokeWidth: sw }));
    group.add(new Konva.Arrow({ points: [d1s.x, d1s.y, d2s.x, d2s.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: 8, pointerWidth: 6 }));
    group.add(new Konva.Arrow({ points: [d2s.x, d2s.y, d1s.x, d1s.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: 8, pointerWidth: 6 }));

    const dist = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    const mid = mmToScreen({ x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }, viewport);
    group.add(new Konva.Text({
      x: mid.x + 4,
      y: mid.y - 16,
      text: `${Math.round(dist)} mm`,
      fontSize: Math.max(10, 10 * viewport.scale),
      fill: color,
    }));
    return group;
  }


  if (shape.type === 'hatch') {
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const spacing = Math.max(4, (shape.spacing || 120) * viewport.scale);
    const colorHatch = isPreview ? COLOR_PREVIEW : (isSelected ? COLOR_SELECT : '#7fd68a');

    if (shape.hatchKind === 'rect') {
      const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
      const w = shape.w * viewport.scale;
      const h = shape.h * viewport.scale;
      const clip = new Konva.Group({ clipX: p.x, clipY: p.y, clipWidth: w, clipHeight: h });
      const len = Math.hypot(w, h) + 10;
      for (let k = -h; k < w + h; k += spacing) {
        clip.add(new Konva.Line({
          points: [p.x + k, p.y + h, p.x + k + len, p.y - len],
          stroke: colorHatch,
          strokeWidth: 1,
          opacity: 0.7,
        }));
      }
      group.add(clip);
      return group;
    }

    if (shape.hatchKind === 'circle') {
      const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
      const r = shape.r * viewport.scale;
      const clip = new Konva.Group({
        clipFunc(ctx) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        },
      });
      const minX = c.x - r;
      const maxX = c.x + r;
      const minY = c.y - r;
      const maxY = c.y + r;
      const len = (maxY - minY) + (maxX - minX) + 20;
      for (let k = -r * 2; k < r * 2; k += spacing) {
        clip.add(new Konva.Line({
          points: [minX + k, maxY, minX + k + len, minY - len],
          stroke: colorHatch,
          strokeWidth: 1,
          opacity: 0.7,
        }));
      }
      group.add(clip);
      return group;
    }
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
