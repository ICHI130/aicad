/**
 * commandline.js
 * AutoCAD風コマンドライン入力・履歴表示モジュール
 */

const COMMAND_MAP = {
  'l':    'line',
  'line': 'line',
  'rec':  'rect',
  'rect': 'rect',
  'rectangle': 'rect',
  'c':    'circle',
  'circle': 'circle',
  'a':    'arc',
  'arc':  'arc',
  'pl':   'polyline',
  'pline': 'polyline',
  'polyline': 'polyline',
  'o':    'offset',
  'offset': 'offset',
  't':    'text',
  'text': 'text',
  'm':    'move',
  'move': 'move',
  'co':   'copy',
  'cp':   'copy',
  'copy': 'copy',
  'ro':   'rotate',
  'rotate': 'rotate',
  'mi':   'mirror',
  'mirror': 'mirror',
  'tr':   'trim',
  'trim': 'trim',
  'ex':   'extend',
  'extend': 'extend',
  'f':    'fillet',
  'fillet': 'fillet',
  'sc':   'scale',
  'scale': 'scale',
  'e':    'erase',
  'erase': 'erase',
  's':    'select',
  'select': 'select',
  'u':    'undo',
  'undo': 'undo',
  'redo': 'redo',
  'z':    'zoom',
  'za':   'zoomAll',
  'dim':  'dim',
  'dli':  'dim',
  'dv':   'dim',
};

const TOOL_LABELS = {
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
  scale:    '尺度',
  erase:    '削除',
  dim:      '寸法',
};

const TOOL_GUIDES = {
  select:   '図形をクリックして選択 [Delete:削除] [M:移動] [RO:回転]',
  line:     { 0: '始点をクリック または 座標を入力 (例: 0,0)', 1: '終点をクリック または 長さを入力 [Enter確定] [C:閉じる] [Esc:終了]' },
  rect:     { 0: '第1コーナーをクリック または 座標を入力', 1: '対角コーナーをクリック または @幅,高さ を入力 (例: @5700,3600)' },
  circle:   { 0: '中心点をクリック または 座標を入力', 1: '円周点をクリック または 半径を入力 (例: 1000)' },
  arc:      { 0: '始点をクリック', 1: '中間点をクリック', 2: '終点をクリック' },
  polyline: { 0: '始点をクリック', 1: '次の点をクリック [Enter:終了] [C:閉じる] [右クリック:終了]' },
  offset:   { 0: 'オフセット距離を入力 [Enter]', 1: '元の線をクリック', 2: 'オフセット方向をクリック [Esc:終了]' },
  text:     { 0: '文字の挿入点をクリック', 1: '文字を入力 [Enter:確定]' },
  move:     { 0: '基点をクリック', 1: '目標点をクリック または @dx,dy を入力' },
  copy:     { 0: '基点をクリック', 1: '目標点をクリック [Esc:終了]' },
  rotate:   { 0: '回転の基点をクリック', 1: '回転角度を入力 または 回転後の点をクリック (例: 90)' },
  mirror:   { 0: '鏡像軸の点1をクリック', 1: '鏡像軸の点2をクリック' },
  trim:     { 0: '切断境界の線をクリック [Enter:全て境界]', 1: '切断する部分をクリック [Esc:終了]' },
  fillet:   { 0: 'フィレット半径を入力 [Enter] (0=直角コーナー)', 1: '1本目の線をクリック', 2: '2本目の線をクリック' },
  dim:      { 0: '寸法の始点をクリック', 1: '寸法の終点をクリック', 2: '寸法線の位置をクリック' },
};

const HELP_TEXT = `コマンド一覧:
  L    → 線 (LINE)          C    → 円 (CIRCLE)
  REC  → 矩形 (RECTANGLE)   PL   → ポリライン
  O    → オフセット          T    → 文字
  M    → 移動 (MOVE)         CO   → コピー
  RO   → 回転 (ROTATE)       MI   → 鏡像 (MIRROR)
  TR   → トリム               F    → フィレット
  DIM  → 寸法                 U    → 元に戻す
  ZA   → 全体表示             Esc  → キャンセル

座標入力:
  100,200    → 絶対座標 X=100, Y=200
  @100,50    → 相対座標 X+100, Y+50
  @100<45    → 極座標 距離100mm, 角度45°
  100        → 現在方向に100mm`;

export function initCommandLine({ onToolChange, onCoordInput, onSpecialCommand }) {
  const historyEl = document.getElementById('cmdline-history');
  const labelEl = document.getElementById('cmdline-label');
  const inputEl = document.getElementById('cmdline-input');

  const historyLines = [];

  function addHistory(text, color = null) {
    historyLines.push({ text, color });
    if (historyLines.length > 3) historyLines.shift();
    renderHistory();
  }

  function renderHistory() {
    historyEl.innerHTML = historyLines
      .map((l) => {
        const style = l.color ? ` style="color:${l.color}"` : '';
        return `<div${style}>${escapeHtml(l.text)}</div>`;
      })
      .join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setLabel(text) {
    labelEl.textContent = text;
  }

  function setPrompt(toolId, step) {
    const guide = TOOL_GUIDES[toolId];
    if (!guide) { setLabel('コマンド:'); return; }
    if (typeof guide === 'string') { setLabel(`[${TOOL_LABELS[toolId] || toolId}]`); return; }
    const stepGuide = guide[step] || guide[0] || '';
    setLabel(`[${TOOL_LABELS[toolId] || toolId}] ${stepGuide.split('[')[0].trim()}:`);
  }

  inputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      inputEl.value = '';
      onSpecialCommand?.('escape');
      return;
    }

    if (event.key !== 'Enter') return;

    const raw = inputEl.value.trim();
    inputEl.value = '';
    if (!raw) return;

    // ヘルプ
    if (raw === '?') {
      addHistory(HELP_TEXT, '#8aa8c0');
      return;
    }

    // コマンド（ツール切替 or 特殊コマンド）
    const lower = raw.toLowerCase();
    const toolId = COMMAND_MAP[lower];

    if (toolId === 'undo') {
      addHistory('元に戻す', '#8aa8c0');
      onSpecialCommand?.('undo');
      return;
    }
    if (toolId === 'redo') {
      addHistory('やり直し', '#8aa8c0');
      onSpecialCommand?.('redo');
      return;
    }
    if (toolId === 'zoomAll' || lower === 'za') {
      addHistory('全体表示', '#8aa8c0');
      onSpecialCommand?.('zoomAll');
      return;
    }
    if (toolId === 'erase') {
      addHistory('削除', '#8aa8c0');
      onSpecialCommand?.('erase');
      return;
    }

    if (toolId) {
      const label = TOOL_LABELS[toolId] || toolId;
      addHistory(`コマンド: ${raw.toUpperCase()} → ${label}`, '#4da6ff');
      onToolChange?.(toolId);
      return;
    }

    // 座標・数値入力（数値/座標形式なら onCoordInput へ）
    if (/^[@]?[-\d.]/.test(raw) || /^[-\d.]+,[-\d.]+$/.test(raw)) {
      addHistory(`入力: ${raw}`, '#ffdd66');
      onCoordInput?.(raw);
      return;
    }

    addHistory(`不明なコマンド: ${raw} (?でヘルプ)`, '#ff6666');
  });

  // Ctrl+Enter でコマンドラインにフォーカスを移す（canvas側から）
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'F1') return;
    // 文字キー入力でコマンドラインをアクティブに（ただしtextarea等はスキップ）
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // printable keyでコマンドラインに転送
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      inputEl.focus();
    }
  });

  return {
    addHistory,
    setPrompt,
    setLabel,
    focus() { inputEl.focus(); },
    blur() { inputEl.blur(); },
    getValue() { return inputEl.value; },
    clearValue() { inputEl.value = ''; },
  };
}
