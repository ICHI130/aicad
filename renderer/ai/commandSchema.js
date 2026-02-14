const SUPPORTED_VERSION = 1;

const ALLOWED_SHAPE_KEYS = {
  line: ['type', 'x1', 'y1', 'x2', 'y2'],
  rect: ['type', 'x', 'y', 'w', 'h'],
  circle: ['type', 'cx', 'cy', 'r'],
  arc: ['type', 'cx', 'cy', 'r', 'startAngle', 'endAngle'],
  text: ['type', 'x', 'y', 'text', 'height', 'rotation', 'align'],
  point: ['type', 'x', 'y'],
  dim: ['type', 'x1', 'y1', 'x2', 'y2', 'offset', 'dir'],
};

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripCodeFence(rawText) {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return rawText.trim();
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeShape(shape) {
  if (!shape || typeof shape !== 'object') return { ok: false, reason: 'shape must be object' };
  const type = String(shape.type || '').toLowerCase();
  const allowedKeys = ALLOWED_SHAPE_KEYS[type];
  if (!allowedKeys) return { ok: false, reason: `unsupported shape type: ${shape.type}` };

  const sanitized = { type };
  for (const key of allowedKeys) {
    if (key === 'type') continue;
    if (shape[key] == null) continue;
    sanitized[key] = shape[key];
  }

  if (type === 'line' || type === 'dim') {
    if (![sanitized.x1, sanitized.y1, sanitized.x2, sanitized.y2].every(isFiniteNumber)) {
      return { ok: false, reason: `${type} requires finite x1,y1,x2,y2` };
    }
  } else if (type === 'rect') {
    if (![sanitized.x, sanitized.y, sanitized.w, sanitized.h].every(isFiniteNumber)) {
      return { ok: false, reason: 'rect requires finite x,y,w,h' };
    }
    if (sanitized.w <= 0 || sanitized.h <= 0) return { ok: false, reason: 'rect width/height must be positive' };
  } else if (type === 'circle') {
    if (![sanitized.cx, sanitized.cy, sanitized.r].every(isFiniteNumber)) {
      return { ok: false, reason: 'circle requires finite cx,cy,r' };
    }
    if (sanitized.r <= 0) return { ok: false, reason: 'circle radius must be positive' };
  } else if (type === 'arc') {
    if (![sanitized.cx, sanitized.cy, sanitized.r].every(isFiniteNumber)) {
      return { ok: false, reason: 'arc requires finite cx,cy,r' };
    }
    sanitized.startAngle = isFiniteNumber(sanitized.startAngle) ? sanitized.startAngle : 0;
    sanitized.endAngle = isFiniteNumber(sanitized.endAngle) ? sanitized.endAngle : 360;
  } else if (type === 'text') {
    if (![sanitized.x, sanitized.y].every(isFiniteNumber) || typeof sanitized.text !== 'string') {
      return { ok: false, reason: 'text requires finite x,y and string text' };
    }
    sanitized.height = isFiniteNumber(sanitized.height) ? sanitized.height : 2.5;
    sanitized.rotation = isFiniteNumber(sanitized.rotation) ? sanitized.rotation : 0;
    sanitized.align = isFiniteNumber(sanitized.align) ? sanitized.align : 0;
  } else if (type === 'point') {
    if (![sanitized.x, sanitized.y].every(isFiniteNumber)) {
      return { ok: false, reason: 'point requires finite x,y' };
    }
  }

  return { ok: true, shape: sanitized };
}

function sanitizeMutateOp(op) {
  if (!op || typeof op !== 'object') return { ok: false, reason: 'operation must be object' };
  const type = String(op.type || '').toLowerCase();
  if (!['add', 'update', 'delete'].includes(type)) {
    return { ok: false, reason: `unsupported operation type: ${op.type}` };
  }

  if (type === 'add') {
    const result = sanitizeShape(op.shape);
    if (!result.ok) return result;
    return { ok: true, operation: { type: 'add', shape: result.shape } };
  }

  const id = String(op.id || '').trim();
  if (!id) return { ok: false, reason: `${type} requires non-empty id` };

  if (type === 'delete') {
    return { ok: true, operation: { type: 'delete', id } };
  }

  const patch = op.patch;
  if (!patch || typeof patch !== 'object') {
    return { ok: false, reason: 'update requires patch object' };
  }

  return { ok: true, operation: { type: 'update', id, patch } };
}

function sanitizeMutateCommand(payload) {
  if (!Array.isArray(payload.operations)) {
    return { ok: false, reason: 'expected operations:[] for mutate action' };
  }
  if (payload.operations.length > 2000) {
    return { ok: false, reason: 'operation count limit exceeded (2000)' };
  }

  const operations = [];
  for (const op of payload.operations) {
    const result = sanitizeMutateOp(op);
    if (!result.ok) return result;
    operations.push(result.operation);
  }

  return {
    ok: true,
    command: {
      type: 'cad-command',
      version: payload.version ?? 1,
      action: 'mutate',
      operations,
    },
  };
}

export function parseAiDrawCommand(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, reason: 'empty response' };
  }

  const payload = safeJsonParse(stripCodeFence(rawText));
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'no valid JSON payload found' };
  }

  const version = payload.version ?? 1;
  if (version !== SUPPORTED_VERSION) {
    return { ok: false, reason: `unsupported command version: ${version}` };
  }

  if (payload.action === 'mutate') {
    return sanitizeMutateCommand(payload);
  }

  if (payload.action !== 'draw' || !Array.isArray(payload.shapes)) {
    return { ok: false, reason: 'expected { action:"draw", shapes:[] } or { action:"mutate", operations:[] }' };
  }

  if (payload.shapes.length > 5000) {
    return { ok: false, reason: 'shape count limit exceeded (5000)' };
  }

  const shapes = [];
  for (const original of payload.shapes) {
    const result = sanitizeShape(original);
    if (!result.ok) return { ok: false, reason: result.reason };
    shapes.push(result.shape);
  }

  return {
    ok: true,
    command: {
      type: 'cad-command',
      version,
      action: 'draw',
      shapes,
    },
  };
}
