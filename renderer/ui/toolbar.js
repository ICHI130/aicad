import { Tool } from '../cad/tools.js';

export function initToolbar(onChangeTool) {
  const toolbar = document.getElementById('toolbar');
  const tools = [
    { id: Tool.SELECT, label: '選択' },
    { id: Tool.LINE, label: '線' },
    { id: Tool.RECT, label: '矩形' },
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
