const simpleStroke = '#8ec8ff';

export const SYMBOL_LIBRARY = {
  建具: [
    {
      name: '片開きドア',
      type: 'block',
      w: 900,
      d: 200,
      shapes: [
        { type: 'rect', x: 0, y: 0, w: 80, h: 900 },
        { type: 'line', x1: 80, y1: 0, x2: 80, y2: 900 },
        { type: 'arc', cx: 80, cy: 0, r: 900, startAngle: 0, endAngle: 90 },
      ],
      attributes: [{ tag: 'MARK', value: 'D-01' }],
    },
    {
      name: '引き違い窓',
      type: 'block',
      w: 1800,
      d: 100,
      shapes: [
        { type: 'rect', x: 0, y: 0, w: 1800, h: 120 },
        { type: 'line', x1: 900, y1: 0, x2: 900, y2: 120 },
        { type: 'line', x1: 40, y1: 60, x2: 1760, y2: 60 },
      ],
      attributes: [{ tag: 'MARK', value: 'W-01' }],
    },
  ],
  設備: [
    {
      name: '洗面台', type: 'block', w: 750, d: 550,
      shapes: [
        { type: 'rect', x: 0, y: 0, w: 750, h: 550 },
        { type: 'circle', cx: 375, cy: 280, r: 120 },
      ],
      attributes: [{ tag: 'NAME', value: '洗面台' }],
    },
    {
      name: 'トイレ', type: 'block', w: 400, d: 700,
      shapes: [
        { type: 'rect', x: 40, y: 0, w: 320, h: 260 },
        { type: 'ellipse', cx: 200, cy: 460, rx: 180, ry: 220 },
      ],
      attributes: [{ tag: 'NAME', value: '便器' }],
    },
  ],
  家具: [
    {
      name: 'テーブル（900×1800）', type: 'block', w: 1800, d: 900,
      shapes: [{ type: 'rect', x: 0, y: 0, w: 1800, h: 900 }],
      attributes: [{ tag: 'NAME', value: 'TABLE' }],
    },
    {
      name: 'イス', type: 'block', w: 450, d: 450,
      shapes: [
        { type: 'rect', x: 0, y: 0, w: 450, h: 450 },
        { type: 'rect', x: 80, y: 80, w: 290, h: 290 },
      ],
      attributes: [{ tag: 'NAME', value: 'CHAIR' }],
    },
  ],
};

export function initSymbolLibrary({ onSelectSymbol }) {
  const root = document.getElementById('symbol-library-panel');
  if (!root) return { setPending() {} };

  root.style.borderTop = '1px solid #333';
  root.style.padding = '8px';

  let pendingName = '';

  function render() {
    root.innerHTML = '';
    const title = document.createElement('div');
    title.textContent = '📦 シンボルライブラリ';
    title.style.color = '#ddd';
    title.style.fontSize = '12px';
    title.style.marginBottom = '8px';
    root.appendChild(title);

    Object.entries(SYMBOL_LIBRARY).forEach(([category, items]) => {
      const details = document.createElement('details');
      details.open = true;
      details.style.marginBottom = '6px';

      const summary = document.createElement('summary');
      summary.textContent = category;
      summary.style.cursor = 'pointer';
      summary.style.color = '#8ec8ff';
      summary.style.fontSize = '12px';
      details.appendChild(summary);

      const list = document.createElement('div');
      list.style.display = 'grid';
      list.style.gap = '4px';
      list.style.marginTop = '6px';

      items.forEach((item) => {
        const btn = document.createElement('button');
        btn.textContent = pendingName === item.name ? `配置中: ${item.name}` : item.name;
        btn.style.fontSize = '11px';
        btn.style.padding = '4px 6px';
        btn.style.border = `1px solid ${pendingName === item.name ? '#4da6ff' : '#444'}`;
        btn.style.background = '#1f1f1f';
        btn.style.color = simpleStroke;
        btn.style.textAlign = 'left';
        btn.addEventListener('click', () => {
          pendingName = item.name;
          onSelectSymbol?.(item);
          render();
        });
        list.appendChild(btn);
      });

      details.appendChild(list);
      root.appendChild(details);
    });
  }

  render();

  return {
    setPending(name = '') {
      pendingName = name;
      render();
    },
  };
}
