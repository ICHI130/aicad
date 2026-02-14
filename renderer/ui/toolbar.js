import { Tool } from '../cad/tools.js';

const TOOL_DEFS = [
  // グループ: ファイル
  { group: 'ファイル' },
  { action: 'open',       icon: '📂', label: 'ファイルを開く', key: 'Ctrl+O' },
  { action: 'export-dxf', icon: '💾', label: 'DXFで保存',     key: 'Ctrl+S' },
  { action: 'fit',        icon: '⊡',  label: '全体表示',       key: 'F/ZA' },
  // グループ: 操作
  { group: '操作' },
  { action: 'undo', icon: '↩', label: '元に戻す', key: 'Ctrl+Z' },
  { action: 'redo', icon: '↪', label: 'やり直し', key: 'Ctrl+Y' },
  // グループ: 作図
  { group: '作図' },
  { id: Tool.SELECT,   icon: '▶', label: '選択',       key: 'S/Esc' },
  { id: Tool.LINE,     icon: '╱', label: '線',         key: 'L' },
  { id: Tool.RECT,     icon: '□', label: '矩形',       key: 'REC' },
  { id: Tool.CIRCLE,   icon: '○', label: '円',         key: 'C' },
  { id: Tool.POLYLINE, icon: '〜', label: 'ポリライン', key: 'PL' },
  { id: Tool.TEXT,     icon: 'Ａ', label: '文字',       key: 'T' },
  // グループ: 修正
  { group: '修正' },
  { id: Tool.MOVE,     icon: '↔', label: '移動',   key: 'M' },
  { id: Tool.COPY,     icon: '⊕', label: 'コピー', key: 'CO' },
  { id: Tool.ROTATE,   icon: '↻', label: '回転',   key: 'RO' },
  { id: Tool.OFFSET,   icon: '∥', label: 'オフセット', key: 'O' },
  { id: Tool.MIRROR,   icon: '⇌', label: '鏡像',   key: 'MI' },
  { id: Tool.TRIM,     icon: '✂', label: 'トリム', key: 'TR' },
  { id: Tool.FILLET,   icon: '⌐', label: 'フィレット', key: 'F' },
  // グループ: 注釈
  { group: '注釈' },
  { id: Tool.DIM, icon: '←→', label: '寸法', key: 'DIM' },
];

export function initToolbar({ onChangeTool, onOpenFile, onExportDxf, onUndo, onRedo, onFitView }) {
  const panel = document.getElementById('tool-panel');
  const buttons = [];

  for (const def of TOOL_DEFS) {
    // グループラベル
    if (def.group) {
      const label = document.createElement('div');
      label.className = 'tool-group-label';
      label.textContent = def.group;
      panel.appendChild(label);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'tool-btn';

    const iconSpan = document.createElement('span');
    iconSpan.textContent = def.icon;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = def.label;

    const keySpan = document.createElement('span');
    keySpan.className = 'key-hint';
    keySpan.textContent = def.key;

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
    } else if (def.action === 'undo') {
      btn.addEventListener('click', () => onUndo?.());
    } else if (def.action === 'redo') {
      btn.addEventListener('click', () => onRedo?.());
    } else if (def.action === 'fit') {
      btn.addEventListener('click', () => onFitView?.());
    }

    panel.appendChild(btn);
  }

  return {
    setActive(toolId) {
      for (const button of buttons) {
        button.classList.toggle('active', button.dataset.toolId === toolId);
      }
    },
  };
}
