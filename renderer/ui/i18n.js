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
    arc: '円弧',
    polyline: 'ポリライン',
    text: '文字',
    move: '移動',
    copy: 'コピー',
    rotate: '回転',
    scale: '尺度変更',
    offset: 'オフセット',
    mirror: '鏡像',
    trim: 'トリム',
    extend: '延長',
    fillet: 'フィレット',
    array: '配列複写',
    hatch: 'ハッチ',
    dim: '寸法',
    layer_title: 'レイヤー',
    layer_current: '現在レイヤー',
    layer_add: '追加',
    layer_placeholder: '新規レイヤー名',
    layer_visible: '表示',
    layer_locked: 'ロック',
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
    arc: 'Arc',
    polyline: 'Polyline',
    text: 'Text',
    move: 'Move',
    copy: 'Copy',
    rotate: 'Rotate',
    scale: 'Scale',
    offset: 'Offset',
    mirror: 'Mirror',
    trim: 'Trim',
    extend: 'Extend',
    fillet: 'Fillet',
    array: 'Array',
    hatch: 'Hatch',
    dim: 'Dimension',
    layer_title: 'Layers',
    layer_current: 'Current Layer',
    layer_add: 'Add',
    layer_placeholder: 'New layer name',
    layer_visible: 'Visible',
    layer_locked: 'Lock',
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
