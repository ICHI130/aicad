import { getLineTypeOptions } from '../cad/linetypes.js';

const WIDTH_OPTIONS = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0];
const BY_LAYER = 'BYLAYER';

// AutoCAD標準8色 + カスタム枠（9番目）
const PRESET_COLORS = [
  '#ff0000', // 赤
  '#ffff00', // 黄
  '#00ff00', // 緑
  '#00ffff', // シアン
  '#0000ff', // 青
  '#ff00ff', // マゼンタ
  '#ffffff', // 白
  '#808080', // グレー
];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function findPresetIndex(color) {
  if (!color) return -1;
  return PRESET_COLORS.findIndex((c) => c.toLowerCase() === color.toLowerCase());
}

function buildColorPaletteHtml(selectedColor, customColor) {
  const isByLayer = !selectedColor || selectedColor === BY_LAYER;
  const presetIdx = findPresetIndex(selectedColor);
  const isCustom = !isByLayer && presetIdx === -1;
  const customDisplay = isCustom ? (selectedColor || customColor || '#00bfff') : (customColor || '#00bfff');

  const byLayer = `<div class="color-swatch ${isByLayer ? 'active' : ''}" data-color="${BY_LAYER}" title="ByLayer"><span style="font-size:10px;line-height:1">BL</span></div>`;

  const swatches = PRESET_COLORS.map((c, i) => {
    const active = presetIdx === i ? 'active' : '';
    return `<div class="color-swatch ${active}" data-color="${c}" style="background:${c}" title="${c}"></div>`;
  }).join('');

  const customActive = isCustom ? 'active' : '';
  const customSwatch = `
    <div class="color-swatch custom-swatch ${customActive}" data-color="custom" title="カスタム" style="background:${customDisplay}">
      <span>＋</span>
      <input type="color" id="prop-color-custom" value="${customDisplay}" style="opacity:0;position:absolute;width:100%;height:100%;top:0;left:0;cursor:pointer;" />
    </div>`;

  return `<div class="color-palette">${byLayer}${swatches}${customSwatch}</div>
    <input type="hidden" id="prop-color" value="${isByLayer ? BY_LAYER : (isCustom ? customDisplay : selectedColor || BY_LAYER)}" />`;
}

export function initPropertyPanel({ getSelection, getLayers, onApply }) {
  const root = document.getElementById('property-panel');
  if (!root) return { refresh() {} };

  // 現在の値をまとめて読んでonApplyに流す
  function commit() {
    const selected = getSelection();
    if (!selected.length) return;
    const first = selected[0];
    const commonSingle = selected.length === 1;

    const patch = {
      color: root.querySelector('#prop-color')?.value || BY_LAYER,
      linetype: root.querySelector('#prop-linetype')?.value || BY_LAYER,
      linewidth: root.querySelector('#prop-linewidth')?.value === BY_LAYER ? BY_LAYER : toNum(root.querySelector('#prop-linewidth')?.value, 0.25),
      layerId: root.querySelector('#prop-layer')?.value,
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
        height: Math.max(0.1, toNum(root.querySelector('#g-height')?.value, first.height || 2.5)),
        rotation: toNum(root.querySelector('#g-rotation')?.value, first.rotation || 0),
      });
    }

    // undefinedプロパティを除去
    for (const k of Object.keys(patch)) {
      if (patch[k] === undefined || patch[k] === null) delete patch[k];
    }

    onApply(selected.map((s) => s.id), patch);
  }

  // 入力欄にリアルタイムイベントを登録するヘルパー
  function bindLive(selector, eventName = 'change') {
    const el = root.querySelector(selector);
    if (el) el.addEventListener(eventName, commit);
  }

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
    const widthOptions = [`<option value="${BY_LAYER}">ByLayer</option>`, ...WIDTH_OPTIONS.map((w) => `<option value="${w}">${w}mm</option>`)].join('');

    const currentColor = first.color || BY_LAYER;
    const colorPaletteHtml = buildColorPaletteHtml(currentColor, '#00bfff');

    root.innerHTML = `
      <div class="prop-header"><span>プロパティ</span></div>
      <div class="prop-grid">
        <label>色</label>
        <div>${colorPaletteHtml}</div>
        <label>線種</label><select id="prop-linetype">${lineTypeOptions}</select>
        <label>線幅</label><select id="prop-linewidth">${widthOptions}</select>
        <label>レイヤ</label><select id="prop-layer">${layerOptions}</select>
      </div>
      <div id="prop-geo"></div>
    `;

    root.querySelector('#prop-linetype').value = first.linetype || BY_LAYER;
    root.querySelector('#prop-linewidth').value = first.linewidth === BY_LAYER ? BY_LAYER : String(first.linewidth ?? BY_LAYER);
    root.querySelector('#prop-layer').value = first.layerId || 'default';

    // 共通プロパティのリアルタイムバインド
    bindLive('#prop-linetype');
    bindLive('#prop-linewidth');
    bindLive('#prop-layer');

    // カラースウォッチのクリック処理
    root.querySelectorAll('.color-swatch:not(.custom-swatch)').forEach((sw) => {
      sw.addEventListener('click', () => {
        root.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        root.querySelector('#prop-color').value = sw.dataset.color;
        commit();
      });
    });

    // カスタム色ピッカー
    const customInput = root.querySelector('#prop-color-custom');
    const customSwatch = root.querySelector('.custom-swatch');
    if (customInput && customSwatch) {
      customInput.addEventListener('input', () => {
        const col = customInput.value;
        customSwatch.style.background = col;
        root.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
        customSwatch.classList.add('active');
        root.querySelector('#prop-color').value = col;
        commit();
      });
      customSwatch.addEventListener('click', (e) => {
        if (e.target !== customInput) customInput.click();
      });
    }

    // ジオメトリ欄
    const geo = root.querySelector('#prop-geo');
    if (commonSingle && first.type === 'line') {
      geo.innerHTML = `<div class="prop-geo-grid">
        <label>X1</label><input id="g-x1" type="number" value="${first.x1}">
        <label>Y1</label><input id="g-y1" type="number" value="${first.y1}">
        <label>X2</label><input id="g-x2" type="number" value="${first.x2}">
        <label>Y2</label><input id="g-y2" type="number" value="${first.y2}">
      </div>`;
    } else if (commonSingle && first.type === 'circle') {
      geo.innerHTML = `<div class="prop-geo-grid">
        <label>CX</label><input id="g-cx" type="number" value="${first.cx}">
        <label>CY</label><input id="g-cy" type="number" value="${first.cy}">
        <label>R</label><input id="g-r" type="number" min="0" value="${first.r}">
      </div>`;
    } else if (commonSingle && first.type === 'rect') {
      geo.innerHTML = `<div class="prop-geo-grid">
        <label>X</label><input id="g-x" type="number" value="${first.x}">
        <label>Y</label><input id="g-y" type="number" value="${first.y}">
        <label>W</label><input id="g-w" type="number" min="0" value="${first.w}">
        <label>H</label><input id="g-h" type="number" min="0" value="${first.h}">
      </div>`;
    } else if (commonSingle && first.type === 'text') {
      geo.innerHTML = `<div class="prop-geo-grid">
        <label>文字</label><input id="g-text" type="text" value="${first.text || ''}">
        <label>大きさ</label><input id="g-height" type="number" min="0.1" step="0.5" value="${first.height || 2.5}">
        <label>回転</label><input id="g-rotation" type="number" value="${first.rotation || 0}">
      </div>`;
    } else {
      geo.innerHTML = `<div class="prop-note">複数選択: 共通プロパティのみ編集できます</div>`;
    }

    // ジオメトリ欄のリアルタイムバインド
    ['#g-x1','#g-y1','#g-x2','#g-y2',
     '#g-cx','#g-cy','#g-r',
     '#g-x','#g-y','#g-w','#g-h',
     '#g-height','#g-rotation'].forEach((sel) => bindLive(sel));
    // テキスト入力はinputイベントで（changeだと確定時のみ）
    bindLive('#g-text', 'input');
  }

  refresh();
  return { refresh };
}
