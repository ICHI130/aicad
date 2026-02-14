import { getLanguage, onLanguageChange, setLanguage, t } from './i18n.js';
import { getLineTypeOptions } from '../cad/linetypes.js';

export function initLayerPanel({
  getLayers,
  getCurrentLayerId,
  onSelectLayer,
  onCreateLayer,
  onToggleLayerVisible,
  onToggleLayerLocked,
  onUpdateLayerColor,
  onUpdateLayerLinetype,
  onUpdateLayerLinewidth,
  onSaveLayerState,
  onLoadLayerState,
}) {
  const root = document.getElementById('layer-panel');
  if (!root) return { refresh() {} };

  let currentLang = getLanguage();

  function render() {
    const layers = getLayers();
    const current = getCurrentLayerId();

    root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'layer-title';
    title.textContent = t('layer_title');
    root.appendChild(title);

    const langRow = document.createElement('div');
    langRow.className = 'layer-lang-row';
    const langLabel = document.createElement('label');
    langLabel.textContent = t('lang_label');
    const langSelect = document.createElement('select');
    langSelect.className = 'layer-lang-select';
    const ja = document.createElement('option');
    ja.value = 'ja';
    ja.textContent = t('lang_ja');
    const en = document.createElement('option');
    en.value = 'en';
    en.textContent = t('lang_en');
    langSelect.append(ja, en);
    langSelect.value = currentLang;
    langSelect.addEventListener('change', () => {
      setLanguage(langSelect.value);
    });
    langRow.append(langLabel, langSelect);
    root.appendChild(langRow);

    const currentRow = document.createElement('div');
    currentRow.className = 'layer-current-row';
    const currentLabel = document.createElement('label');
    currentLabel.textContent = t('layer_current');
    const currentSelect = document.createElement('select');
    currentSelect.className = 'layer-current-select';
    for (const layer of layers) {
      const opt = document.createElement('option');
      opt.value = layer.id;
      opt.textContent = layer.name;
      currentSelect.appendChild(opt);
    }
    currentSelect.value = current;
    currentSelect.addEventListener('change', () => onSelectLayer(currentSelect.value));
    currentRow.append(currentLabel, currentSelect);
    root.appendChild(currentRow);

    const stateRow = document.createElement('div');
    stateRow.className = 'layer-state-row';
    const saveStateBtn = document.createElement('button');
    saveStateBtn.className = 'layer-add-btn';
    saveStateBtn.textContent = t('layer_state_save');
    saveStateBtn.addEventListener('click', () => onSaveLayerState?.());
    const loadStateBtn = document.createElement('button');
    loadStateBtn.className = 'layer-add-btn';
    loadStateBtn.textContent = t('layer_state_load');
    loadStateBtn.addEventListener('click', () => onLoadLayerState?.());
    stateRow.append(saveStateBtn, loadStateBtn);
    root.appendChild(stateRow);

    const createRow = document.createElement('div');
    createRow.className = 'layer-create-row';
    const createInput = document.createElement('input');
    createInput.className = 'layer-name-input';
    createInput.placeholder = t('layer_placeholder');
    const createBtn = document.createElement('button');
    createBtn.className = 'layer-add-btn';
    createBtn.textContent = t('layer_add');
    const submit = () => {
      const name = createInput.value.trim();
      if (!name) return;
      onCreateLayer(name);
      createInput.value = '';
    };
    createBtn.addEventListener('click', submit);
    createInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
    createRow.append(createInput, createBtn);
    root.appendChild(createRow);

    const header = document.createElement('div');
    header.className = 'layer-list-header';
    header.innerHTML = `<span></span><span>色</span><span>線種</span><span>${t('layer_linewidth')}</span><span>${t('layer_visible')}</span><span>${t('layer_locked')}</span>`;
    root.appendChild(header);

    const list = document.createElement('div');
    list.className = 'layer-list';
    for (const layer of layers) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      if (layer.id === current) row.classList.add('active');

      const nameBtn = document.createElement('button');
      nameBtn.className = 'layer-name-btn';
      nameBtn.textContent = layer.name;
      nameBtn.addEventListener('click', () => onSelectLayer(layer.id));

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'layer-color-input';
      colorInput.value = layer.color || '#00bfff';
      colorInput.addEventListener('change', () => onUpdateLayerColor?.(layer.id, colorInput.value));

      const linetypeSelect = document.createElement('select');
      linetypeSelect.className = 'layer-linetype-select';
      for (const lt of getLineTypeOptions()) {
        const opt = document.createElement('option');
        opt.value = lt.id;
        opt.textContent = lt.label;
        linetypeSelect.appendChild(opt);
      }
      linetypeSelect.value = layer.linetype || 'CONTINUOUS';
      linetypeSelect.addEventListener('change', () => onUpdateLayerLinetype?.(layer.id, linetypeSelect.value));

      const widthInput = document.createElement('input');
      widthInput.type = 'number';
      widthInput.className = 'layer-width-input';
      widthInput.min = '0.05';
      widthInput.max = '5';
      widthInput.step = '0.05';
      widthInput.value = String(layer.linewidth ?? 0.25);
      widthInput.addEventListener('change', () => onUpdateLayerLinewidth?.(layer.id, widthInput.value));

      const visibleBtn = document.createElement('button');
      visibleBtn.className = `layer-toggle ${layer.visible ? 'on' : 'off'}`;
      visibleBtn.textContent = layer.visible ? '👁' : '🚫';
      visibleBtn.addEventListener('click', () => onToggleLayerVisible(layer.id));

      const lockedBtn = document.createElement('button');
      lockedBtn.className = `layer-toggle ${layer.locked ? 'on' : 'off'}`;
      lockedBtn.textContent = layer.locked ? '🔒' : '🔓';
      lockedBtn.addEventListener('click', () => onToggleLayerLocked(layer.id));

      row.append(nameBtn, colorInput, linetypeSelect, widthInput, visibleBtn, lockedBtn);
      list.appendChild(row);
    }

    root.appendChild(list);
  }

  const dispose = onLanguageChange((lang) => {
    currentLang = lang;
    render();
  });

  render();

  return {
    refresh: render,
    dispose,
  };
}
