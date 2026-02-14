import { Tool } from '../cad/tools.js';

export function initToolbar({ onChangeTool, onOpenFile, onExportDxf }) {
  const toolbar = document.getElementById('toolbar');

  const openButton = document.createElement('button');
  openButton.className = 'tool-btn';
  openButton.textContent = 'Open';
  openButton.onclick = () => onOpenFile();
  toolbar.appendChild(openButton);

  const exportButton = document.createElement('button');
  exportButton.className = 'tool-btn';
  exportButton.textContent = 'Export DXF';
  exportButton.onclick = () => onExportDxf?.();
  toolbar.appendChild(exportButton);

  const tools = [
    { id: Tool.SELECT, label: '選択' },
    { id: Tool.LINE, label: '線' },
    { id: Tool.RECT, label: '矩形' },
    { id: Tool.CIRCLE, label: 'Circle' },
    { id: Tool.POLYLINE, label: 'Polyline' },
    { id: Tool.DIM, label: '寸法' },
  ];

  const buttons = tools.map((tool) => {
    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.textContent = tool.label;
    button.dataset.toolId = tool.id;
    button.onclick = () => onChangeTool(tool.id);
    toolbar.appendChild(button);
    return button;
  });

  return {
    setActive(toolId) {
      for (const button of buttons) {
        button.classList.toggle('active', button.dataset.toolId === toolId);
      }
    },
  };
}
