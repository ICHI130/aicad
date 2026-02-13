function readValue(lines, index) {
  return (lines[index] || '').trim();
}

export function parseDxf(content) {
  const lines = content.split(/\r?\n/);
  const entities = [];
  let index = 0;

  while (index < lines.length - 1) {
    const code = readValue(lines, index);
    const value = readValue(lines, index + 1);

    if (code === '0' && (value === 'LINE' || value === 'ARC')) {
      const entityType = value;
      index += 2;
      const entity = { type: entityType };

      while (index < lines.length - 1) {
        const groupCode = readValue(lines, index);
        const groupValue = readValue(lines, index + 1);

        if (groupCode === '0') {
          break;
        }

        if (groupCode === '10') entity.x1 = Number(groupValue);
        if (groupCode === '20') entity.y1 = Number(groupValue);
        if (groupCode === '11') entity.x2 = Number(groupValue);
        if (groupCode === '21') entity.y2 = Number(groupValue);

        if (groupCode === '10' && entityType === 'ARC') entity.cx = Number(groupValue);
        if (groupCode === '20' && entityType === 'ARC') entity.cy = Number(groupValue);
        if (groupCode === '40') entity.r = Number(groupValue);
        if (groupCode === '50') entity.startAngle = Number(groupValue);
        if (groupCode === '51') entity.endAngle = Number(groupValue);

        index += 2;
      }

      entities.push(entity);
      continue;
    }

    index += 2;
  }

  return entities;
}

export function dxfEntitiesToShapes(entities) {
  return entities.flatMap((entity) => {
    if (entity.type === 'LINE' && Number.isFinite(entity.x1) && Number.isFinite(entity.y1) && Number.isFinite(entity.x2) && Number.isFinite(entity.y2)) {
      return [{ type: 'line', x1: entity.x1, y1: entity.y1, x2: entity.x2, y2: entity.y2 }];
    }

    if (entity.type === 'ARC' && Number.isFinite(entity.cx) && Number.isFinite(entity.cy) && Number.isFinite(entity.r)) {
      return [{
        type: 'arc',
        cx: entity.cx,
        cy: entity.cy,
        r: entity.r,
        startAngle: entity.startAngle || 0,
        endAngle: entity.endAngle || 360,
      }];
    }

    return [];
  });
}
