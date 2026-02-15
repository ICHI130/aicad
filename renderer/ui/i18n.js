const STORAGE_KEY = 'aicad:lang';

const dictionaries = {
  ja: {
    toolbar_file: 'ファイル',
    toolbar_ops: '操作',
    toolbar_draw: '作図',
    toolbar_modify: '修正',
    toolbar_annotate: '注釈',
    open_file: 'ファイルを開く',
    save_dxf: 'DXFで保存',
    print_pdf: '印刷(PDF)',
    fit_view: '全体表示',
    undo: '元に戻す',
    redo: 'やり直し',
    select: '選択',
    line: '線',
    rect: '矩形',
    circle: '円',
    ellipse: '楕円',
    arc: '円弧',
    polyline: 'ポリライン',
    spline: 'スプライン',
    polygon: '正多角形',
    revcloud: '雲マーク',
    wipeout: 'ワイプアウト',
    donut: 'ドーナツ',
    xline: '構築線',
    divide: 'ディバイダ',
    measure: '計測',
    text: '文字',
    mtext: 'マルチテキスト',
    table: '表',
    move: '移動',
    copy: 'コピー',
    rotate: '回転',
    scale: '尺度変更',
    offset: 'オフセット',
    mirror: '鏡像',
    join: '結合',
    explode: '分解',
    trim: 'トリム',
    extend: '延長',
    fillet: 'フィレット',
    array: '配列複写',
    hatch: 'ハッチ',
    dim: '寸法',
    mleader: '引出線',
    layer_title: 'レイヤー',
    layer_current: '現在レイヤー',
    layer_add: '追加',
    layer_placeholder: '新規レイヤー名',
    layer_visible: '表示',
    layer_locked: 'ロック',
    layer_linewidth: '線幅',
    layer_state_save: '状態保存',
    layer_state_load: '状態読込',
    lang_label: '言語',
    lang_ja: '日本語',
    lang_en: 'English',
  },
  en: {
    toolbar_file: 'File',
    toolbar_ops: 'Edit',
    toolbar_draw: 'Draw',
    toolbar_modify: 'Modify',
    toolbar_annotate: 'Annotate',
    open_file: 'Open File',
    save_dxf: 'Save DXF',
    print_pdf: 'Print (PDF)',
    fit_view: 'Fit View',
    undo: 'Undo',
    redo: 'Redo',
    select: 'Select',
    line: 'Line',
    rect: 'Rectangle',
    circle: 'Circle',
    ellipse: 'Ellipse',
    arc: 'Arc',
    polyline: 'Polyline',
    spline: 'Spline',
    polygon: 'Polygon',
    revcloud: 'Revision Cloud',
    wipeout: 'Wipeout',
    donut: 'Donut',
    xline: 'Xline',
    divide: 'Divide',
    measure: 'Measure',
    text: 'Text',
    mtext: 'MText',
    table: 'Table',
    move: 'Move',
    copy: 'Copy',
    rotate: 'Rotate',
    scale: 'Scale',
    offset: 'Offset',
    mirror: 'Mirror',
    join: 'Join',
    explode: 'Explode',
    trim: 'Trim',
    extend: 'Extend',
    fillet: 'Fillet',
    array: 'Array',
    hatch: 'Hatch',
    dim: 'Dimension',
    mleader: 'MLeader',
    layer_title: 'Layers',
    layer_current: 'Current Layer',
    layer_add: 'Add',
    layer_placeholder: 'New layer name',
    layer_visible: 'Visible',
    layer_locked: 'Lock',
    layer_linewidth: 'Width',
    layer_state_save: 'Save State',
    layer_state_load: 'Load State',
    lang_label: 'Language',
    lang_ja: '日本語',
    lang_en: 'English',
  },
};

let currentLanguage = 'ja';
const listeners = new Set();

export function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && dictionaries[saved]) currentLanguage = saved;
  document.documentElement.lang = currentLanguage;
  return currentLanguage;
}

export function t(key) {
  const dict = dictionaries[currentLanguage] || dictionaries.ja;
  return dict[key] || key;
}

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(nextLang) {
  if (!dictionaries[nextLang] || nextLang === currentLanguage) return;
  currentLanguage = nextLang;
  localStorage.setItem(STORAGE_KEY, currentLanguage);
  document.documentElement.lang = currentLanguage;
  for (const listener of listeners) listener(currentLanguage);
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
