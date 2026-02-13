function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseJww(content) {
  const lines = content.split(/\r?\n/);
  const entities = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    const parts = line.split(/[\s,]+/).filter(Boolean);
    const kind = parts[0].toUpperCase();

    if (kind === 'LINE' && parts.length >= 5) {
      const [x1, y1, x2, y2] = parts.slice(1, 5).map(toNumber);
      if ([x1, y1, x2, y2].every((v) => v !== null)) {
        entities.push({ type: 'LINE', x1, y1, x2, y2 });
      }
    }

    if (kind === 'ARC' && parts.length >= 6) {
      const [cx, cy, r, startAngle, endAngle] = parts.slice(1, 6).map(toNumber);
      if ([cx, cy, r, startAngle, endAngle].every((v) => v !== null)) {
        entities.push({ type: 'ARC', cx, cy, r, startAngle, endAngle });
      }
    }
  }

  return entities;
}

export function jwwEntitiesToShapes(entities) {
  return entities.flatMap((entity) => {
    if (entity.type === 'LINE') {
      return [{ type: 'line', x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 }];
    }

    if (entity.type === 'ARC') {
      return [{
        type: 'arc',
        cx: entity.cx,
        cy: entity.cy,
        r: entity.r,
        startAngle: entity.startAngle,
        endAngle: entity.endAngle,
      }];
    }

    return [];
  });
}
