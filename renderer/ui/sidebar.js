import { askAi, saveClaudeApiKey, saveOpenAiApiKey, saveGeminiApiKey } from '../ai/bridge.js';

const MAX_REFERENCE_SIZE = 15 * 1024 * 1024;

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
    reader.onerror = () => reject(new Error('資料の読み込みに失敗しました。'));
    reader.readAsDataURL(file);
  });
}

function buildCheckbackPrompt() {
  return [
    '添付のチェックバック資料（赤入れ・青入れ）を読み取り、現在図面へ反映する差分を提案してください。',
    '必ず ```json ブロックで {"action":"draw","shapes":[...]} を返してください。',
    'shape は line / rect / circle / arc / text / point / dim / hatch のみ使用してください。',
    '寸法・注記の修正指示があれば text または dim で反映案を出してください。',
    '座標系は既存図面コンテキスト(mm)に合わせ、過剰な説明文は短くしてください。',
  ].join('\n');
}

export function initSidebar({ getDrawingContext, onAiResponse }) {
  // ── タブ切り替え ──
  const tabButtons = document.querySelectorAll('.sidebar-tab');
  const tabContents = document.querySelectorAll('.sidebar-tab-content');
  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      for (const b of tabButtons) b.classList.toggle('active', b.dataset.tab === target);
      for (const c of tabContents) c.classList.toggle('active', c.id === `sidebar-tab-${target}`);
    });
  }

  const provider = document.getElementById('provider');
  const chatInput = document.getElementById('chat-input');
  const imageInput = document.getElementById('image-ref-input');
  const imagePreview = document.getElementById('image-ref-preview');
  const imageMeta = document.getElementById('image-ref-meta');
  const imageClear = document.getElementById('image-ref-clear');
  const applyCheckback = document.getElementById('apply-checkback');

  let referenceImage = null;

  function clearReferenceImage() {
    referenceImage = null;
    if (imageInput) imageInput.value = '';
    if (imagePreview) {
      imagePreview.src = '';
      imagePreview.style.display = 'none';
    }
    if (imageMeta) imageMeta.textContent = 'チェックバック資料: なし';
  }

  imageInput?.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      clearReferenceImage();
      return;
    }

    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isImage && !isPdf) {
      appendMessage('ai', '画像またはPDFファイルを選択してください。');
      clearReferenceImage();
      return;
    }
    if (file.size > MAX_REFERENCE_SIZE) {
      appendMessage('ai', '資料サイズが大きすぎます（15MB以下）。');
      clearReferenceImage();
      return;
    }

    try {
      const dataBase64 = await fileToBase64(file);
      referenceImage = { name: file.name, mimeType: isPdf ? 'application/pdf' : file.type, dataBase64 };
      if (imageMeta) imageMeta.textContent = `チェックバック資料: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      if (imagePreview) {
        if (isImage) {
          imagePreview.src = `data:${file.type};base64,${dataBase64}`;
          imagePreview.style.display = 'block';
        } else {
          imagePreview.src = '';
          imagePreview.style.display = 'none';
        }
      }
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

  async function runAi(message) {
    const result = await askAi(provider.value, message, getDrawingContext(), { referenceImage });
    const text = result?.text || '(応答なし)';
    appendMessage('ai', text);
    if (onAiResponse && text) {
      onAiResponse({ type: result?.type || 'text', text });
    }
  }

  async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    chatInput.value = '';
    appendMessage('user', message);

    try {
      await runAi(message);
    } catch (error) {
      appendMessage('ai', `エラー: ${error.message}`);
    }
  }

  applyCheckback?.addEventListener('click', async () => {
    if (!referenceImage) {
      appendMessage('ai', '先にチェックバック資料（画像/PDF）を添付してください。');
      return;
    }
    const message = buildCheckbackPrompt();
    appendMessage('user', `チェックバック反映を実行: ${referenceImage.name}`);
    try {
      await runAi(message);
    } catch (error) {
      appendMessage('ai', `エラー: ${error.message}`);
    }
  });

  document.getElementById('send-chat').addEventListener('click', sendMessage);

  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendMessage();
    }
  });
}
