function mapUnitsCode(unit) {
  if (unit === 'm') return 6;
  return 4; // millimeters
}

function buildHeader(version, unit) {
  const acadver = version === 'R12' ? 'AC1009' : version === 'R2004' ? 'AC1018' : 'AC1027';
  return [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', acadver,
    '9', '$INSUNITS', '70', String(mapUnitsCode(unit)),
    '0', 'ENDSEC',
  ].join('\n') + '\n';
}

function buildLayerTable(layers = []) {
  const defs = layers.length ? layers : [{ id: '0', name: '0', color: '#ffffff' }];
  const lines = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(defs.length)];
  for (const layer of defs) {
    lines.push('0', 'LAYER', '2', String(layer.name || layer.id || '0'), '70', '0', '62', '7', '6', 'CONTINUOUS');
  }
  lines.push('0', 'ENDTAB', '0', 'ENDSEC');
  return lines.join('\n') + '\n';
}

function unitScale(unit) {
  return unit === 'm' ? 0.001 : 1;
}

function scaled(v, factor) {
  return String((Number(v) || 0) * factor);
}

function buildEntities(shapes = [], { unit = 'mm' } = {}) {
  const factor = unitScale(unit);
  const lines = ['0', 'SECTION', '2', 'ENTITIES'];
  for (const s of shapes) {
    const layerName = String(s.layerId || s.layer || '0');
    if (s.type === 'line') {
      lines.push('0', 'LINE', '8', layerName, '10', scaled(s.x1, factor), '20', scaled(s.y1, factor), '30', '0', '11', scaled(s.x2, factor), '21', scaled(s.y2, factor), '31', '0');
    } else if (s.type === 'circle') {
      lines.push('0', 'CIRCLE', '8', layerName, '10', scaled(s.cx, factor), '20', scaled(s.cy, factor), '30', '0', '40', scaled(s.r, factor));
    } else if (s.type === 'arc') {
      lines.push('0', 'ARC', '8', layerName, '10', scaled(s.cx, factor), '20', scaled(s.cy, factor), '30', '0', '40', scaled(s.r, factor), '50', String(s.startAngle || 0), '51', String(s.endAngle || 0));
    } else if (s.type === 'rect') {
      const x1 = Number(s.x) || 0;
      const y1 = Number(s.y) || 0;
      const x2 = x1 + (Number(s.w) || 0);
      const y2 = y1 + (Number(s.h) || 0);
      lines.push('0', 'LINE', '8', layerName, '10', scaled(x1, factor), '20', scaled(y1, factor), '30', '0', '11', scaled(x2, factor), '21', scaled(y1, factor), '31', '0');
      lines.push('0', 'LINE', '8', layerName, '10', scaled(x2, factor), '20', scaled(y1, factor), '30', '0', '11', scaled(x2, factor), '21', scaled(y2, factor), '31', '0');
      lines.push('0', 'LINE', '8', layerName, '10', scaled(x2, factor), '20', scaled(y2, factor), '30', '0', '11', scaled(x1, factor), '21', scaled(y2, factor), '31', '0');
      lines.push('0', 'LINE', '8', layerName, '10', scaled(x1, factor), '20', scaled(y2, factor), '30', '0', '11', scaled(x1, factor), '21', scaled(y1, factor), '31', '0');
    } else if (s.type === 'text') {
      lines.push('0', 'TEXT', '8', layerName, '10', scaled(s.x, factor), '20', scaled(s.y, factor), '30', '0', '40', scaled(s.height || 2.5, factor), '50', String(s.rotation || 0), '72', String(s.align || 0), '1', String(s.text || ''));
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export function exportDXF(shapes, layers, options = {}) {
  const opts = {
    version: options.version || 'R2004',
    unit: options.unit || 'mm',
    includeLayerDefs: options.includeLayerDefs !== false,
  };

  let dxf = buildHeader(opts.version, opts.unit);
  if (opts.includeLayerDefs) dxf += buildLayerTable(layers);
  dxf += buildEntities(shapes, { unit: opts.unit });
  return dxf;
}
