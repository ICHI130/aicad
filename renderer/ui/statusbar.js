export function initStatusbar({ onRectInput }) {
  const cursorPos = document.getElementById('cursor-pos');
  const rectInput = document.getElementById('rect-input');

  rectInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const [wRaw, hRaw] = rectInput.value.split(',').map((v) => v.trim());
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      onRectInput({ w, h });
      rectInput.value = '';
    }
  });

  return {
    updateCursor(point) {
      cursorPos.textContent = `X: ${Math.round(point.x)} mm, Y: ${Math.round(point.y)} mm`;
    },
  };
}
