import { getLineTypeOptions } from '../cad/linetypes.js';

const WIDTH_OPTIONS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function initPropertyPanel({ getSelection, getLayers, onApply }) {
  const root = document.getElementById('property-panel');
  if (!root) return { refresh() {} };

  function refresh() {
    const selected = getSelection();
    if (!selected.length) {
      root.style.display = 'none';
      root.innerHTML = '';
      return;
    }
    root.style.display = 'block';

    const lineTypes = getLineTypeOptions();
    const first = selected[0];
    const commonSingle = selected.length === 1;

    const layerOptions = getLayers().map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
    const lineTypeOptions = lineTypes.map((lt) => `<option value="${lt.id}">${lt.label}</option>`).join('');
    const widthOptions = WIDTH_OPTIONS.map((w) => `<option value="${w}">${w}mm</option>`).join('');

    root.innerHTML = `
      <div class="prop-header"><span>プロパティ</span></div>
      <div class="prop-grid">
        <label>色</label><input id="prop-color" type="color" value="${first.color || '#00bfff'}" />
        <label>線種</label><select id="prop-linetype">${lineTypeOptions}</select>
        <label>線幅</label><select id="prop-linewidth">${widthOptions}</select>
        <label>レイヤ</label><select id="prop-layer">${layerOptions}</select>
      </div>
      <div id="prop-geo"></div>
      <button id="prop-apply">適用</button>
    `;

    root.querySelector('#prop-linetype').value = first.linetype || 'CONTINUOUS';
    root.querySelector('#prop-linewidth').value = String(first.linewidth ?? 0.25);
    root.querySelector('#prop-layer').value = first.layerId || 'default';

    const geo = root.querySelector('#prop-geo');
    if (commonSingle && first.type === 'line') {
      geo.innerHTML = `<div class="prop-geo-grid"><label>X1</label><input id="g-x1" type="number" value="${first.x1}"><label>Y1</label><input id="g-y1" type="number" value="${first.y1}"><label>X2</label><input id="g-x2" type="number" value="${first.x2}"><label>Y2</label><input id="g-y2" type="number" value="${first.y2}"></div>`;
    } else if (commonSingle && first.type === 'circle') {
      geo.innerHTML = `<div class="prop-geo-grid"><label>CX</label><input id="g-cx" type="number" value="${first.cx}"><label>CY</label><input id="g-cy" type="number" value="${first.cy}"><label>R</label><input id="g-r" type="number" min="0" value="${first.r}"></div>`;
    } else if (commonSingle && first.type === 'rect') {
      geo.innerHTML = `<div class="prop-geo-grid"><label>X</label><input id="g-x" type="number" value="${first.x}"><label>Y</label><input id="g-y" type="number" value="${first.y}"><label>W</label><input id="g-w" type="number" min="0" value="${first.w}"><label>H</label><input id="g-h" type="number" min="0" value="${first.h}"></div>`;
    } else if (commonSingle && first.type === 'text') {
      geo.innerHTML = `<div class="prop-geo-grid"><label>文字</label><input id="g-text" type="text" value="${first.text || ''}"><label>高さ</label><input id="g-height" type="number" min="0" value="${first.height || 2.5}"><label>回転</label><input id="g-rotation" type="number" value="${first.rotation || 0}"></div>`;
    } else {
      geo.innerHTML = `<div class="prop-note">複数選択: 共通プロパティのみ編集できます</div>`;
    }

    root.querySelector('#prop-apply').addEventListener('click', () => {
      const patch = {
        color: root.querySelector('#prop-color').value,
        linetype: root.querySelector('#prop-linetype').value,
        linewidth: toNum(root.querySelector('#prop-linewidth').value, 0.25),
        layerId: root.querySelector('#prop-layer').value,
      };

      if (commonSingle) {
        if (first.type === 'line') Object.assign(patch, {
          x1: toNum(root.querySelector('#g-x1')?.value, first.x1),
          y1: toNum(root.querySelector('#g-y1')?.value, first.y1),
          x2: toNum(root.querySelector('#g-x2')?.value, first.x2),
          y2: toNum(root.querySelector('#g-y2')?.value, first.y2),
        });
        if (first.type === 'circle') Object.assign(patch, {
          cx: toNum(root.querySelector('#g-cx')?.value, first.cx),
          cy: toNum(root.querySelector('#g-cy')?.value, first.cy),
          r: Math.max(0, toNum(root.querySelector('#g-r')?.value, first.r)),
        });
        if (first.type === 'rect') Object.assign(patch, {
          x: toNum(root.querySelector('#g-x')?.value, first.x),
          y: toNum(root.querySelector('#g-y')?.value, first.y),
          w: Math.max(0, toNum(root.querySelector('#g-w')?.value, first.w)),
          h: Math.max(0, toNum(root.querySelector('#g-h')?.value, first.h)),
        });
        if (first.type === 'text') Object.assign(patch, {
          text: root.querySelector('#g-text')?.value ?? first.text,
          height: Math.max(0, toNum(root.querySelector('#g-height')?.value, first.height || 2.5)),
          rotation: toNum(root.querySelector('#g-rotation')?.value, first.rotation || 0),
        });
      }

      onApply(selected.map((s) => s.id), patch);
    });
  }

  refresh();
  return { refresh };
}
