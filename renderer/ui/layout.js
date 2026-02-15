const DEFAULT_PAPER = { width: 297, height: 210, unit: 'mm' };

export let currentSpace = 'model';
export const layouts = [
  {
    id: 'layout1',
    name: 'Layout1',
    paper: { ...DEFAULT_PAPER },
    viewports: [
      { id: `vp_${crypto.randomUUID()}`, x: 10, y: 10, w: 277, h: 190, scale: 0.01 },
    ],
  },
];

let onChangeHandler = null;

function activateTab(tabId) {
  document.querySelectorAll('.layout-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.layout === tabId);
  });
}

export function getCurrentLayout() {
  if (currentSpace === 'model') return null;
  return layouts.find((layout) => layout.id === currentSpace) || null;
}

export function switchToSpace(spaceId) {
  if (spaceId === 'model') {
    currentSpace = 'model';
  } else if (layouts.some((layout) => layout.id === spaceId)) {
    currentSpace = spaceId;
  }
  activateTab(currentSpace);
  onChangeHandler?.(currentSpace);
}

export function addLayout() {
  const nextIndex = layouts.length + 1;
  const id = `layout${nextIndex}`;
  const layout = {
    id,
    name: `Layout${nextIndex}`,
    paper: { ...DEFAULT_PAPER },
    viewports: [{ id: `vp_${crypto.randomUUID()}`, x: 10, y: 10, w: 277, h: 190, scale: 0.01 }],
  };
  layouts.push(layout);

  const tabs = document.getElementById('layout-tabs');
  const addButton = document.getElementById('add-layout');
  if (tabs && addButton) {
    const tab = document.createElement('div');
    tab.className = 'layout-tab';
    tab.dataset.layout = id;
    tab.textContent = layout.name;
    tab.addEventListener('click', () => switchToSpace(id));
    tabs.insertBefore(tab, addButton);
  }
  switchToSpace(id);
}

export function addViewportToCurrentLayout() {
  const layout = getCurrentLayout();
  if (!layout) return null;
  const margin = 15 + layout.viewports.length * 5;
  const viewport = {
    id: `vp_${crypto.randomUUID()}`,
    x: margin,
    y: margin,
    w: Math.max(80, layout.paper.width - margin * 2),
    h: Math.max(60, layout.paper.height - margin * 2),
    scale: 0.01,
  };
  layout.viewports.push(viewport);
  onChangeHandler?.(currentSpace);
  return viewport;
}

export function initLayoutTabs({ onChange }) {
  onChangeHandler = onChange;
  document.querySelectorAll('.layout-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchToSpace(tab.dataset.layout || 'model'));
  });
  document.getElementById('add-layout')?.addEventListener('click', addLayout);
  document.getElementById('add-viewport')?.addEventListener('click', () => {
    addViewportToCurrentLayout();
  });
  activateTab(currentSpace);
}
