import { Tool } from '../cad/tools.js';
import { onLanguageChange, t } from './i18n.js';

const TOOL_DEFS = [
  // グループ: ファイル
  { groupKey: 'toolbar_file' },
  { action: 'open',       icon: '📂', labelKey: 'open_file', key: 'Ctrl+O' },
  { action: 'export-dxf', icon: '💾', labelKey: 'save_dxf',  key: 'Ctrl+S' },
  { action: 'print',      icon: '🖨', labelKey: 'print_pdf', key: 'Ctrl+P' },
  { action: 'fit',        icon: '⊡',  labelKey: 'fit_view',  key: 'F/ZA' },
  // グループ: 操作
  { groupKey: 'toolbar_ops' },
  { action: 'undo', icon: '↩', labelKey: 'undo', key: 'Ctrl+Z' },
  { action: 'redo', icon: '↪', labelKey: 'redo', key: 'Ctrl+Y' },
  // グループ: 作図
  { groupKey: 'toolbar_draw' },
  { id: Tool.SELECT,   icon: '▶', labelKey: 'select',   key: 'S/Esc' },
  { id: Tool.LINE,     icon: '╱', labelKey: 'line',     key: 'L' },
  { id: Tool.RECT,     icon: '□', labelKey: 'rect',     key: 'REC' },
  { id: Tool.CIRCLE,   icon: '○', labelKey: 'circle',   key: 'C' },
  { id: Tool.ELLIPSE,  icon: '⬭', labelKey: 'ellipse',  key: 'EL' },
  { id: Tool.ARC,      icon: '◜', labelKey: 'arc',      key: 'A' },
  { id: Tool.POLYLINE, icon: '〜', labelKey: 'polyline', key: 'PL' },
  { id: Tool.TEXT,     icon: 'Ａ', labelKey: 'text',     key: 'T' },
  { id: Tool.MTEXT,    icon: '🅣', labelKey: 'mtext',    key: 'MT' },
  { id: Tool.TABLE,    icon: '▤', labelKey: 'table',    key: 'TB' },
  // グループ: 修正
  { groupKey: 'toolbar_modify' },
  { id: Tool.MOVE,     icon: '↔', labelKey: 'move',   key: 'M' },
  { id: Tool.COPY,     icon: '⊕', labelKey: 'copy',   key: 'CO' },
  { id: Tool.ROTATE,   icon: '↻', labelKey: 'rotate', key: 'RO' },
  { id: Tool.SCALE,    icon: '⇱', labelKey: 'scale', key: 'SC' },
  { id: Tool.OFFSET,   icon: '∥', labelKey: 'offset', key: 'O' },
  { id: Tool.MIRROR,   icon: '⇌', labelKey: 'mirror', key: 'MI' },
  { id: Tool.JOIN,     icon: '⎯', labelKey: 'join', key: 'JO' },
  { id: Tool.EXPLODE,  icon: '✳', labelKey: 'explode', key: 'X' },
  { id: Tool.TRIM,     icon: '✂', labelKey: 'trim', key: 'TR' },
  { id: Tool.EXTEND,   icon: '⤢', labelKey: 'extend', key: 'EX' },
  { id: Tool.FILLET,   icon: '⌐', labelKey: 'fillet', key: 'F' },
  { id: Tool.ARRAY,    icon: '▦', labelKey: 'array', key: 'AR' },
  { id: Tool.HATCH,    icon: '▒', labelKey: 'hatch', key: 'H' },
  // グループ: 注釈
  { groupKey: 'toolbar_annotate' },
  { id: Tool.DIM, icon: '←→', labelKey: 'dim', key: 'DIM' },
  { id: Tool.MLEADER, icon: '↗T', labelKey: 'mleader', key: 'ML' },
];


export function initToolbar({ onChangeTool, onOpenFile, onExportDxf, onPrint, onUndo, onRedo, onFitView }) {
  const panel = document.getElementById('tool-panel');
  const buttons = [];
  const translatedNodes = [];

  for (const def of TOOL_DEFS) {
    // グループラベル
    if (def.groupKey) {
      const label = document.createElement('div');
      label.className = 'tool-group-label';
      label.textContent = t(def.groupKey);
      translatedNodes.push({ el: label, key: def.groupKey });
      panel.appendChild(label);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'tool-btn';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = def.icon;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = t(def.labelKey);

    const keySpan = document.createElement('span');
    keySpan.className = 'key-hint';
    keySpan.textContent = def.key;

    translatedNodes.push({ el: labelSpan, key: def.labelKey });
    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);
    btn.appendChild(keySpan);

    if (def.id) {
      // ツールボタン
      btn.dataset.toolId = def.id;
      btn.addEventListener('click', () => onChangeTool(def.id));
      buttons.push(btn);
    } else if (def.action === 'open') {
      btn.addEventListener('click', () => onOpenFile?.());
    } else if (def.action === 'export-dxf') {
      btn.addEventListener('click', () => onExportDxf?.());
    } else if (def.action === 'print') {
      btn.addEventListener('click', () => onPrint?.());
    } else if (def.action === 'undo') {
      btn.addEventListener('click', () => onUndo?.());
    } else if (def.action === 'redo') {
      btn.addEventListener('click', () => onRedo?.());
    } else if (def.action === 'fit') {
      btn.addEventListener('click', () => onFitView?.());
    }

    panel.appendChild(btn);
  }

  const disposeLang = onLanguageChange(() => {
    for (const node of translatedNodes) node.el.textContent = t(node.key);
  });

  return {
    setActive(toolId) {
      for (const button of buttons) {
        button.classList.toggle('active', button.dataset.toolId === toolId);
      }
    },
    dispose() {
      disposeLang?.();
    },
  };
}
