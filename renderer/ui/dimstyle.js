export const DEFAULT_DIM_STYLE = {
  textHeight: 2.5,
  arrowSize: 2.5,
  offset: 10,
  unit: 'mm',
  precision: 0,
};

let currentStyle = { ...DEFAULT_DIM_STYLE };

export function getDimStyle() {
  return currentStyle;
}

export function setDimStyle(patch) {
  currentStyle = { ...currentStyle, ...patch };
}

export function formatDimValue(mmValue) {
  const style = getDimStyle();
  let value = mmValue;
  let suffix = 'mm';
  if (style.unit === 'cm') {
    value = mmValue / 10;
    suffix = 'cm';
  } else if (style.unit === 'm') {
    value = mmValue / 1000;
    suffix = 'm';
  }
  return `${value.toFixed(style.precision)} ${suffix}`;
}
