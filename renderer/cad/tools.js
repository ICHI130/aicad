import { mmToScreen, snapToGrid } from './canvas.js';
import { getDashPattern } from './linetypes.js';
import { resolveShapeColor } from './colors.js';
import { getDimStyle, formatDimValue } from '../ui/dimstyle.js';

export const Tool = {
  SELECT: 'select',
  LINE: 'line',
  RECT: 'rect',
  CIRCLE: 'circle',
  ELLIPSE: 'ellipse',
  ARC: 'arc',
  POLYLINE: 'polyline',
  SPLINE: 'spline',
  POLYGON: 'polygon',
  REVCLOUD: 'revcloud',
  WIPEOUT: 'wipeout',
  DONUT: 'donut',
  XLINE: 'xline',
  RAY: 'ray',
  DIVIDE: 'divide',
  MEASURE: 'measure',
  MTEXT: 'mtext',
  TABLE: 'table',
  DIM: 'dim',
  MOVE: 'move',
  COPY: 'copy',
  ROTATE: 'rotate',
  SCALE: 'scale',
  OFFSET: 'offset',
  MIRROR: 'mirror',
  JOIN: 'join',
  EXPLODE: 'explode',
  TRIM: 'trim',
  BREAK: 'break',
  LENGTHEN: 'lengthen',
  CHAMFER: 'chamfer',
  EXTEND: 'extend',
  FILLET: 'fillet',
  ARRAY: 'array',
  HATCH: 'hatch',
  TEXT: 'text',
  MLEADER: 'mleader',
};

const COLOR_PREVIEW = '#ffff00';  // 黄色（作図中プレビュー)
const COLOR_SELECT  = '#ff4444';  // 赤（選択中）


function resolveLinewidth(shapeLinewidth, layerLinewidth) {
  const fromShape = Number(shapeLinewidth);
  if (Number.isFinite(fromShape) && fromShape > 0) return fromShape;
  const fromLayer = Number(layerLinewidth);
  if (Number.isFinite(fromLayer) && fromLayer > 0) return fromLayer;
  return 0.25;
}

function resolveLinetype(shapeLinetype, layerLinetype) {
  const normalized = String(shapeLinetype || '').toUpperCase();
  if (!normalized || normalized === 'BYLAYER') return layerLinetype || 'CONTINUOUS';
  return shapeLinetype;
}

export function buildShapeNode(shape, viewport, options = {}) {
  const {
    isPreview = false,
    isSelected = false,
    layerStyle = null,
    plotStyle = 'screen',
    lineweightScale = 1,
  } = options;

  const resolvedLinewidth = resolveLinewidth(shape.linewidth, layerStyle?.linewidth) * Math.max(0.1, Number(lineweightScale) || 1);
  const sw = Math.max(1, resolvedLinewidth * viewport.scale);
  const baseColor = isPreview ? COLOR_PREVIEW : isSelected ? COLOR_SELECT : resolveShapeColor(shape, layerStyle);
  const color = plotStyle === 'monochrome' ? toMonochrome(baseColor) : baseColor;
  const linetype = resolveLinetype(shape.linetype, layerStyle?.linetype);
  const dash = isPreview ? [8, 4] : getDashPattern(linetype, viewport.scale);

  if (shape.type === 'line') {
    const p1 = mmToScreen({ x: shape.x1, y: shape.y1 }, viewport);
    const p2 = mmToScreen({ x: shape.x2, y: shape.y2 }, viewport);
    return new Konva.Line({
      points: [p1.x, p1.y, p2.x, p2.y],
      stroke: color,
      strokeWidth: sw,
      dash,
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
      dash,
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
      dash,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'ellipse') {
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    return new Konva.Ellipse({
      x: c.x,
      y: c.y,
      radiusX: shape.rx * viewport.scale,
      radiusY: shape.ry * viewport.scale,
      rotation: shape.rotation || 0,
      stroke: color,
      strokeWidth: sw,
      fill: 'transparent',
      dash,
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

  if (shape.type === 'spline') {
    const pts = [];
    for (const pt of shape.points || []) {
      const p = mmToScreen(pt, viewport);
      pts.push(p.x, p.y);
    }
    return new Konva.Line({
      points: pts,
      tension: 0.5,
      closed: !!shape.closed,
      stroke: color,
      strokeWidth: sw,
      fill: 'transparent',
      dash,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'polygon') {
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    const rPx = Math.max(0, shape.r * viewport.scale);
    const sides = Math.max(3, Math.min(32, Math.round(shape.sides || 6)));
    const pts = [];
    for (let i = 0; i < sides; i += 1) {
      const a = (Math.PI * 2 * i / sides) + (shape.rotation || 0) * Math.PI / 180;
      pts.push(c.x + rPx * Math.cos(a), c.y + rPx * Math.sin(a));
    }
    return new Konva.Line({
      points: pts,
      closed: true,
      stroke: color,
      strokeWidth: sw,
      fill: 'transparent',
      dash,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'revcloud') {
    const pts = [];
    for (const pt of shape.points || []) {
      const p = mmToScreen(pt, viewport);
      pts.push(p.x, p.y);
    }
    return new Konva.Line({
      points: pts,
      closed: true,
      tension: 0.45,
      stroke: color,
      strokeWidth: sw,
      fill: 'transparent',
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'wipeout') {
    const pts = [];
    for (const pt of shape.points || []) {
      const p = mmToScreen(pt, viewport);
      pts.push(p.x, p.y);
    }
    return new Konva.Line({
      points: pts,
      closed: true,
      fill: '#1a1a1a',
      stroke: '#1a1a1a',
      strokeWidth: 1,
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'donut') {
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    const r1 = Math.max(0, (shape.innerR || 0) * viewport.scale);
    const r2 = Math.max(0, (shape.outerR || 0) * viewport.scale);
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    group.add(new Konva.Circle({ x: c.x, y: c.y, radius: r2, fill: color, stroke: 'transparent' }));
    if (r1 > 0) group.add(new Konva.Circle({ x: c.x, y: c.y, radius: r1, fill: '#1a1a1a', stroke: 'transparent' }));
    return group;
  }

  if (shape.type === 'xline' || shape.type === 'ray') {
    const p = mmToScreen({ x: shape.x ?? shape.x1, y: shape.y ?? shape.y1 }, viewport);
    const angle = (shape.angle || 0) * Math.PI / 180;
    const BIG = 100000;
    const pts = shape.type === 'xline'
      ? [
        p.x - BIG * Math.cos(angle), p.y - BIG * Math.sin(angle),
        p.x + BIG * Math.cos(angle), p.y + BIG * Math.sin(angle),
      ]
      : [p.x, p.y, p.x + BIG * Math.cos(angle), p.y + BIG * Math.sin(angle)];
    return new Konva.Line({
      points: pts,
      stroke: color,
      strokeWidth: sw,
      dash: [4, 4],
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'dim' && shape.dimType === 'radius') {
    const style = getDimStyle();
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
    const pt = mmToScreen({ x: shape.px, y: shape.py }, viewport);
    group.add(new Konva.Arrow({
      points: [c.x, c.y, pt.x, pt.y],
      stroke: color,
      fill: color,
      strokeWidth: sw,
      pointerLength: Math.max(4, style.arrowSize * viewport.scale),
      pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75),
    }));
    group.add(new Konva.Text({
      x: pt.x + 4,
      y: pt.y - 14,
      text: `R${formatDimValue(shape.r)}`,
      fontSize: Math.max(10, style.textHeight * viewport.scale),
      fill: color,
    }));
    return group;
  }

  if (shape.type === 'dim' && shape.dimType === 'diameter') {
    const style = getDimStyle();
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const p1 = mmToScreen({ x: shape.cx - shape.r, y: shape.cy }, viewport);
    const p2 = mmToScreen({ x: shape.cx + shape.r, y: shape.cy }, viewport);
    const mid = mmToScreen({ x: shape.cx, y: shape.cy - shape.r * 0.5 }, viewport);
    group.add(new Konva.Arrow({ points: [p1.x, p1.y, p2.x, p2.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: Math.max(4, style.arrowSize * viewport.scale), pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75) }));
    group.add(new Konva.Arrow({ points: [p2.x, p2.y, p1.x, p1.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: Math.max(4, style.arrowSize * viewport.scale), pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75) }));
    group.add(new Konva.Text({ x: mid.x + 4, y: mid.y - 14, text: `φ${formatDimValue(shape.r * 2)}`, fontSize: Math.max(10, style.textHeight * viewport.scale), fill: color }));
    return group;
  }

  if (shape.type === 'dim') {
    const style = getDimStyle();
    const group = new Konva.Group({ listening: !isPreview, id: shape.id });
    const vertical = shape.dir === 'v';
    const isAligned = shape.dir === 'a';
    const p1 = { x: shape.x1, y: shape.y1 };
    const p2 = { x: shape.x2, y: shape.y2 };
    const off = shape.offset ?? style.offset;
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
    group.add(new Konva.Arrow({ points: [d1s.x, d1s.y, d2s.x, d2s.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: Math.max(4, style.arrowSize * viewport.scale), pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75) }));
    group.add(new Konva.Arrow({ points: [d2s.x, d2s.y, d1s.x, d1s.y], stroke: color, fill: color, strokeWidth: sw, pointerLength: Math.max(4, style.arrowSize * viewport.scale), pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75) }));

    const dist = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
    const mid = mmToScreen({ x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 }, viewport);
    group.add(new Konva.Text({
      x: mid.x + 4,
      y: mid.y - 16,
      text: formatDimValue(dist),
      fontSize: Math.max(10, style.textHeight * viewport.scale),
      fill: color,
    }));
    return group;
  }


  if (shape.type === 'hatch') {
    if (shape.fillType === 'gradient' && shape.gradient) {
      const group = new Konva.Group({ id: shape.id, listening: !isPreview });
      const g = shape.gradient;
      const angleRad = ((g.angle || 0) * Math.PI) / 180;
      const x1 = 0;
      const y1 = 0;
      const x2 = Math.cos(angleRad);
      const y2 = Math.sin(angleRad);

      if (shape.hatchKind === 'rect') {
        const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
        const w = shape.w * viewport.scale;
        const h = shape.h * viewport.scale;
        group.add(new Konva.Rect({
          x: p.x,
          y: p.y,
          width: w,
          height: h,
          fillLinearGradientStartPoint: { x: p.x + x1 * w, y: p.y + y1 * h },
          fillLinearGradientEndPoint: { x: p.x + x2 * w, y: p.y + y2 * h },
          fillLinearGradientColorStops: [0, g.color1 || '#ffffff', 1, g.color2 || '#4da6ff'],
          stroke: 'transparent',
        }));
      } else if (shape.hatchKind === 'circle') {
        const c = mmToScreen({ x: shape.cx, y: shape.cy }, viewport);
        const r = shape.r * viewport.scale;
        group.add(new Konva.Circle({
          x: c.x,
          y: c.y,
          radius: r,
          fillRadialGradientStartPoint: { x: 0, y: 0 },
          fillRadialGradientEndPoint: { x: 0, y: 0 },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndRadius: r,
          fillRadialGradientColorStops: [0, g.color1 || '#ffffff', 1, g.color2 || '#4da6ff'],
          stroke: 'transparent',
        }));
      }
      return group;
    }

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

  if (shape.type === 'mtext') {
    const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const lines = Array.isArray(shape.content) ? shape.content : [];
    let offsetY = 0;
    for (const line of lines) {
      const text = String(line?.text || '');
      const lineHeight = Number(line?.height) || shape.height || 3.5;
      const fontSize = Math.max(8, lineHeight * viewport.scale);
      const styleTokens = [];
      if (line?.bold) styleTokens.push('bold');
      if (line?.italic) styleTokens.push('italic');
      group.add(new Konva.Text({
        x: p.x,
        y: p.y + offsetY,
        text,
        fontSize,
        fill: color,
        fontFamily: 'MS Gothic, IPAGothic, monospace',
        fontStyle: styleTokens.join(' '),
      }));
      offsetY += fontSize * 1.4;
    }
    return group;
  }

  if (shape.type === 'table') {
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const origin = mmToScreen({ x: shape.x, y: shape.y }, viewport);
    const cols = Math.max(1, Number(shape.cols) || 1);
    const rows = Math.max(1, Number(shape.rows) || 1);
    let y = origin.y;

    for (let r = 0; r < rows; r += 1) {
      let x = origin.x;
      const rowMm = Number(shape.rowHeights?.[r]) || 10;
      const rowH = rowMm * viewport.scale;
      for (let c = 0; c < cols; c += 1) {
        const colMm = Number(shape.colWidths?.[c]) || 30;
        const colW = colMm * viewport.scale;
        group.add(new Konva.Rect({
          x,
          y,
          width: colW,
          height: rowH,
          stroke: color,
          strokeWidth: sw,
          fill: 'transparent',
        }));
        const cellText = String(shape.cells?.[r]?.[c] || '');
        if (cellText) {
          group.add(new Konva.Text({
            x: x + 2,
            y: y + 2,
            text: cellText,
            fontSize: Math.max(8, 2.5 * viewport.scale),
            fill: color,
            fontFamily: 'MS Gothic, IPAGothic, monospace',
          }));
        }
        x += colW;
      }
      y += rowH;
    }
    return group;
  }

  if (shape.type === 'point') {
    const p = mmToScreen({ x: shape.x, y: shape.y }, viewport);
    return new Konva.Circle({
      x: p.x,
      y: p.y,
      radius: 3,
      fill: color,
      stroke: 'transparent',
      id: shape.id,
      listening: !isPreview,
    });
  }

  if (shape.type === 'mleader') {
    const style = getDimStyle();
    const group = new Konva.Group({ id: shape.id, listening: !isPreview });
    const p1 = mmToScreen({ x: shape.x1, y: shape.y1 }, viewport);
    const p2 = mmToScreen({ x: shape.x2, y: shape.y2 }, viewport);
    const p3 = mmToScreen({ x: shape.x3, y: shape.y3 }, viewport);
    const textHeight = Math.max(8, (shape.textHeight || style.textHeight) * viewport.scale);

    group.add(new Konva.Arrow({
      points: [p2.x, p2.y, p1.x, p1.y],
      stroke: color,
      fill: color,
      strokeWidth: sw,
      pointerLength: Math.max(4, style.arrowSize * viewport.scale),
      pointerWidth: Math.max(3, style.arrowSize * viewport.scale * 0.75),
    }));

    group.add(new Konva.Line({
      points: [p2.x, p2.y, p3.x, p3.y],
      stroke: color,
      strokeWidth: sw,
      dash,
    }));

    group.add(new Konva.Text({
      x: p3.x + 4,
      y: p3.y - textHeight,
      text: shape.text || '注記',
      fontSize: textHeight,
      fill: color,
      fontFamily: 'MS Gothic, IPAGothic, sans-serif',
    }));

    return group;
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
    dash,
    id: shape.id,
    listening: !isPreview,
  });
}

function toMonochrome(color) {
  const hex = String(color || '').trim();
  if (/^#([0-9a-f]{3})$/i.test(hex)) {
    const [, short] = /^#([0-9a-f]{3})$/i.exec(hex);
    const full = short.split('').map((ch) => ch + ch).join('');
    return toMonochrome(`#${full}`);
  }
  if (/^#([0-9a-f]{6})$/i.test(hex)) {
    const [, value] = /^#([0-9a-f]{6})$/i.exec(hex);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114).toString(16).padStart(2, '0');
    return `#${gray}${gray}${gray}`;
  }
  return '#111111';
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
