const TOOL_NAMES = {
  select:   '選択',
  line:     '線',
  rect:     '矩形',
  circle:   '円',
  arc:      '円弧',
  polyline: 'ポリライン',
  offset:   'オフセット',
  text:     '文字',
  move:     '移動',
  copy:     'コピー',
  rotate:   '回転',
  mirror:   '鏡像',
  trim:     'トリム',
  extend:   '延長',
  fillet:   'フィレット',
  array:    '配列複写',
  hatch:    'ハッチ',
  scale:    '尺度',
  erase:    '削除',
  dim:      '寸法',
};


const SNAP_LABELS = {
  endpoint: 'END',
  midpoint: 'MID',
  intersection: 'INT',
  quadrant: 'QUA',
  grid: 'GRID',
  off: 'OFF',
};

const TOOL_GUIDES = {
  select:   '図形をクリックして選択',
  line:     { 0: '始点をクリック または 座標入力', 1: '終点をクリック または 長さ入力 [Enter]' },
  rect:     { 0: '第1コーナーをクリック', 1: '対角コーナー または @幅,高さ 入力' },
  circle:   { 0: '中心点をクリック', 1: '円周点 または 半径を入力 [Enter]' },
  arc:      { 0: '始点をクリック', 1: '中間点をクリック', 2: '終点をクリック' },
  polyline: { 0: '始点をクリック', 1: '次点クリック [Enter:完了] [C:閉じる]' },
  offset:   { 0: 'オフセット距離を入力 [Enter]', 1: '元の線をクリック', 2: '方向をクリック' },
  text:     { 0: '挿入点をクリック', 1: '文字を入力 [Enter:確定]' },
  move:     { 0: '基点をクリック', 1: '目標点をクリック' },
  copy:     { 0: '基点をクリック', 1: '目標点をクリック [Esc:終了]' },
  rotate:   { 0: '回転基点をクリック', 1: '角度を入力 または 点をクリック' },
  scale:    { 0: '基点をクリック', 1: '参照点をクリック', 2: '目標点をクリック' },
  mirror:   { 0: '鏡像軸の点1をクリック', 1: '鏡像軸の点2をクリック' },
  trim:     { 0: '切断境界をクリック [Enter:次へ]', 1: '切断部分をクリック [Esc:終了]' },
  extend:   { 0: '延長境界をクリック [Enter:次へ]', 1: '延長する線をクリック [Esc:終了]' },
  fillet:   { 0: '半径を入力 [Enter]', 1: '1本目の線をクリック', 2: '2本目の線をクリック' },
  array:    { 0: '基点をクリック', 1: '配列方向点をクリック' },
  hatch:    { 0: '境界(矩形/円)をクリックしてハッチ作成' },
  dim:      { 0: '始点をクリック', 1: '終点をクリック', 2: '寸法線の位置をクリック' },
};

export function initStatusbar({ onOrthoChange, onSnapChange, onGridChange } = {}) {
  const cursorEl = document.getElementById('cursor-pos');
  const toolEl = document.getElementById('status-tool');
  const guideEl = document.getElementById('status-guide');
  const snapEl = document.getElementById('status-snap');
  const orthoBtn = document.getElementById('btn-ortho');
  const snapBtn = document.getElementById('btn-snap');
  const gridBtn = document.getElementById('btn-grid');

  let orthoOn = false;
  let snapOn = true;
  let gridOn = true;

  function updateModeBtn(btn, on) {
    if (on) btn.classList.add('on');
    else btn.classList.remove('on');
  }

  orthoBtn?.addEventListener('click', () => {
    orthoOn = !orthoOn;
    updateModeBtn(orthoBtn, orthoOn);
    orthoBtn.textContent = orthoOn ? 'F8 オルソ ON' : 'F8 オルソ';
    onOrthoChange?.(orthoOn);
  });

  snapBtn?.addEventListener('click', () => {
    snapOn = !snapOn;
    updateModeBtn(snapBtn, snapOn);
    onSnapChange?.(snapOn);
  });

  gridBtn?.addEventListener('click', () => {
    gridOn = !gridOn;
    updateModeBtn(gridBtn, gridOn);
    onGridChange?.(gridOn);
  });

  return {
    updateCursor(point, snapType = 'grid', snapEnabled = true) {
      if (cursorEl) cursorEl.textContent = `X: ${Math.round(point.x)} mm, Y: ${Math.round(point.y)} mm`;
      if (snapEl) {
        const key = snapEnabled ? (SNAP_LABELS[snapType] ? snapType : 'grid') : 'off';
        snapEl.textContent = `SNAP: ${SNAP_LABELS[key]}`;
      }
    },
    setTool(toolId) {
      const name = TOOL_NAMES[toolId] || toolId;
      if (toolEl) toolEl.textContent = `ツール: ${name}`;
    },
    setGuide(toolId, step = 0) {
      if (!guideEl) return;
      const guide = TOOL_GUIDES[toolId];
      if (!guide) { guideEl.textContent = ''; return; }
      if (typeof guide === 'string') { guideEl.textContent = guide; return; }
      guideEl.textContent = guide[step] || guide[0] || '';
    },
    setCustomGuide(text) {
      if (guideEl) guideEl.textContent = text;
    },
    toggleOrtho(on) {
      orthoOn = (on !== undefined) ? on : !orthoOn;
      updateModeBtn(orthoBtn, orthoOn);
      if (orthoBtn) orthoBtn.textContent = orthoOn ? 'F8 オルソ ON' : 'F8 オルソ';
      return orthoOn;
    },
    toggleSnap(on) {
      snapOn = (on !== undefined) ? on : !snapOn;
      updateModeBtn(snapBtn, snapOn);
      if (snapEl && !snapOn) snapEl.textContent = `SNAP: ${SNAP_LABELS.off}`;
      return snapOn;
    },
    toggleGrid(on) {
      gridOn = (on !== undefined) ? on : !gridOn;
      updateModeBtn(gridBtn, gridOn);
      return gridOn;
    },
    isOrthoOn() { return orthoOn; },
    isSnapOn() { return snapOn; },
    isGridOn() { return gridOn; },
  };
}
