export const DEFAULT_LAYER_COLOR = '#00bfff';
export const BY_LAYER = 'BYLAYER';

export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.toUpperCase() === BY_LAYER) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return null;
}

export function resolveShapeColor(shape, layer) {
  return normalizeColor(shape?.color) || normalizeColor(layer?.color) || DEFAULT_LAYER_COLOR;
}
