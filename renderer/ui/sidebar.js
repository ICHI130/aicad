import { askAi, saveClaudeApiKey } from '../ai/bridge.js';

function appendMessage(role, text) {
  const log = document.getElementById('chat-log');
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

export function initSidebar({ getDrawingContext }) {
  const provider = document.getElementById('provider');
  const chatInput = document.getElementById('chat-input');

  document.getElementById('save-api-key').addEventListener('click', async () => {
    const apiKey = document.getElementById('claude-api-key').value;
    const result = await saveClaudeApiKey(apiKey);
    appendMessage('ai', result.configured ? 'Claude APIキーを保存しました。' : 'Claude APIキーをクリアしました。');
  });

  document.getElementById('send-chat').addEventListener('click', async () => {
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = '';
    appendMessage('user', message);

    try {
      const result = await askAi(provider.value, message, getDrawingContext());
      appendMessage('ai', result.text);
    } catch (error) {
      appendMessage('ai', `エラー: ${error.message}`);
    }
  });
}
