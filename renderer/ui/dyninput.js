export function initDynInput() {
  const div = document.createElement('div');
  div.id = 'dyn-input';
  div.style.cssText = [
    'position: fixed',
    'pointer-events: none',
    'z-index: 500',
    'background: rgba(20,25,32,0.9)',
    'border: 1px solid #4da6ff',
    'border-radius: 4px',
    'padding: 4px 8px',
    'font-size: 11px',
    'font-family: monospace',
    'color: #e8e8e8',
    'display: none',
    'white-space: nowrap',
  ].join(';');
  document.body.appendChild(div);

  let enabled = true;

  return {
    update(screenX, screenY, from, to) {
      if (!enabled || !from || !to) {
        div.style.display = 'none';
        return;
      }
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(-dy, dx) * 180 / Math.PI;
      const angleDeg = ((angle % 360) + 360) % 360;
      div.innerHTML = `長さ: ${dist.toFixed(1)}mm<br>角度: ${angleDeg.toFixed(1)}°`;
      div.style.left = `${screenX + 20}px`;
      div.style.top = `${screenY + 20}px`;
      div.style.display = 'block';
    },
    hide() {
      div.style.display = 'none';
    },
    toggle(force) {
      if (typeof force === 'boolean') enabled = force;
      else enabled = !enabled;
      if (!enabled) div.style.display = 'none';
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
  };
}
