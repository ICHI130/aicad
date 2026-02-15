export const LINE_TYPES = {
  CONTINUOUS: { label: '実線', dash: null },
  DASHED: { label: '破線', dash: [12, 6] },
  DASHED2: { label: '破線(細)', dash: [6, 3] },
  DASHEDX2: { label: '破線(太)', dash: [24, 12] },
  CENTER: { label: '一点鎖線', dash: [24, 6, 4, 6] },
  CENTER2: { label: '一点鎖線(細)', dash: [12, 4, 2, 4] },
  CENTERX2: { label: '一点鎖線(太)', dash: [48, 10, 8, 10] },
  PHANTOM: { label: '二点鎖線', dash: [24, 6, 4, 6, 4, 6] },
  PHANTOM2: { label: '二点鎖線(細)', dash: [12, 4, 2, 4, 2, 4] },
  DOT: { label: '点線', dash: [2, 6] },
  DOT2: { label: '点線(細)', dash: [1, 3] },
  DOTX2: { label: '点線(太)', dash: [4, 12] },
  HIDDEN: { label: '隠れ線', dash: [6, 4] },
  HIDDEN2: { label: '隠れ線(細)', dash: [3, 2] },
  DIVIDE: { label: '長破線', dash: [32, 6, 2, 6, 2, 6] },
};

export const BY_LAYER_LINETYPE = 'BYLAYER';

export function getDashPattern(linetype, scale) {
  const key = linetype === BY_LAYER_LINETYPE ? 'CONTINUOUS' : linetype;
  const lt = LINE_TYPES[key] || LINE_TYPES.CONTINUOUS;
  if (!lt.dash) return undefined;
  const safeScale = Math.max(scale || 1, 0.5);
  return lt.dash.map((v) => v * safeScale);
}

export function getLineTypeOptions() {
  return [
    { id: BY_LAYER_LINETYPE, label: 'ByLayer' },
    ...Object.entries(LINE_TYPES).map(([id, value]) => ({ id, label: value.label })),
  ];
}
