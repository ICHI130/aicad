import { askAi, saveClaudeApiKey, saveOpenAiApiKey, saveGeminiApiKey } from '../ai/bridge.js';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

function appendMessage(role, text) {
  const log = document.getElementById('chat-log');
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

export function initSidebar({ getDrawingContext, onAiResponse }) {
  const provider = document.getElementById('provider');
  const chatInput = document.getElementById('chat-input');
  const imageInput = document.getElementById('image-ref-input');
  const imagePreview = document.getElementById('image-ref-preview');
  const imageMeta = document.getElementById('image-ref-meta');
  const imageClear = document.getElementById('image-ref-clear');

  let referenceImage = null;

  function clearReferenceImage() {
    referenceImage = null;
    if (imageInput) imageInput.value = '';
    if (imagePreview) {
      imagePreview.src = '';
      imagePreview.style.display = 'none';
    }
    if (imageMeta) imageMeta.textContent = '写真参照: なし';
  }

  imageInput?.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      clearReferenceImage();
      return;
    }
    if (!file.type.startsWith('image/')) {
      appendMessage('ai', '画像ファイル（jpg/png/webp など）を選択してください。');
      clearReferenceImage();
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      appendMessage('ai', '画像サイズが大きすぎます（8MB以下）。');
      clearReferenceImage();
      return;
    }

    try {
      const dataBase64 = await fileToBase64(file);
      referenceImage = { name: file.name, mimeType: file.type, dataBase64 };
      if (imagePreview) {
        imagePreview.src = `data:${file.type};base64,${dataBase64}`;
        imagePreview.style.display = 'block';
      }
      if (imageMeta) imageMeta.textContent = `写真参照: ${file.name} (${Math.round(file.size / 1024)} KB)`;
    } catch (error) {
      appendMessage('ai', error.message);
      clearReferenceImage();
    }
  });

  imageClear?.addEventListener('click', () => clearReferenceImage());

  document.getElementById('save-claude-api-key').addEventListener('click', async () => {
    const apiKey = document.getElementById('claude-api-key').value;
    const result = await saveClaudeApiKey(apiKey);
    appendMessage('ai', result.configured ? 'Claude APIキーを保存しました。' : 'Claude APIキーをクリアしました。');
  });

  document.getElementById('save-openai-api-key').addEventListener('click', async () => {
    const apiKey = document.getElementById('openai-api-key').value;
    const result = await saveOpenAiApiKey(apiKey);
    appendMessage('ai', result.configured ? 'OpenAI APIキーを保存しました。' : 'OpenAI APIキーをクリアしました。');
  });

  document.getElementById('save-gemini-api-key').addEventListener('click', async () => {
    const apiKey = document.getElementById('gemini-api-key').value;
    const result = await saveGeminiApiKey(apiKey);
    appendMessage('ai', result.configured ? 'Gemini APIキーを保存しました。' : 'Gemini APIキーをクリアしました。');
  });

  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = '';
    appendMessage('user', message);

    try {
      const result = await askAi(provider.value, message, getDrawingContext(), { referenceImage });
      const text = result?.text || '(応答なし)';
      appendMessage('ai', text);
      if (onAiResponse && text) {
        onAiResponse({ type: result?.type || 'text', text });
      }
    } catch (error) {
      appendMessage('ai', `エラー: ${error.message}`);
    }
  }

  document.getElementById('send-chat').addEventListener('click', sendMessage);

  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendMessage();
    }
  });
}
