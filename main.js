const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let claudeApiKey = '';
let openAiApiKey = '';
let geminiApiKey = '';

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open',
          accelerator: 'CmdOrCtrl+O',
          click: (_menuItem, browserWindow) => {
            if (browserWindow) {
              browserWindow.webContents.send('menu:open-file');
            }
          },
        },
        {
          label: 'Print PDF',
          accelerator: 'CmdOrCtrl+P',
          click: (_menuItem, browserWindow) => {
            if (browserWindow) {
              browserWindow.webContents.send('menu:print');
            }
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('cad:open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'CAD Files', extensions: ['dxf', 'jww', 'jwc'] },
      { name: 'DXF', extensions: ['dxf'] },
      { name: 'JWW', extensions: ['jww', 'jwc'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const ext = filePath.split('.').pop()?.toLowerCase();

  // JWW/JWCはバイナリ、DXFはテキスト
  if (ext === 'jww' || ext === 'jwc') {
    const buffer = await fs.readFile(filePath);
    // Base64に変換してrendererに渡す
    const base64 = buffer.toString('base64');
    return { canceled: false, filePath, content: null, base64, isBinary: true };
  }

  // DXFはバイナリで読んでBase64に変換（CP932/UTF-8判定はrenderer側で行う）
  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');
  return { canceled: false, filePath, content: null, base64, isBinary: false, isDxf: true };
});



ipcMain.handle('cad:print-pdf', async (event, options = {}) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  if (!browserWindow) throw new Error('印刷対象のウィンドウが見つかりません。');

  const landscape = Boolean(options.landscape);
  const pdfBuffer = await browserWindow.webContents.printToPDF({
    printBackground: true,
    landscape,
    preferCSSPageSize: true,
  });

  const { filePath, canceled } = await dialog.showSaveDialog({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: landscape ? 'aicad-landscape.pdf' : 'aicad.pdf',
  });

  if (canceled || !filePath) return { canceled: true };

  await fs.writeFile(filePath, pdfBuffer);
  return { canceled: false, filePath };
});

ipcMain.handle('cad:save-dxf', async (_event, content) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    filters: [{ name: 'DXF', extensions: ['dxf'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  await fs.writeFile(filePath, content, 'utf8');
  return { canceled: false, filePath };
});

ipcMain.handle('ai:set-claude-api-key', (_event, apiKey) => {
  claudeApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  return { ok: true, configured: Boolean(claudeApiKey) };
});


ipcMain.handle('ai:set-openai-api-key', (_event, apiKey) => {
  openAiApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  return { ok: true, configured: Boolean(openAiApiKey) };
});

ipcMain.handle('ai:set-gemini-api-key', (_event, apiKey) => {
  geminiApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  return { ok: true, configured: Boolean(geminiApiKey) };
});


function isPdfReference(referenceImage) {
  const mime = String(referenceImage?.mimeType || '').toLowerCase();
  return mime === 'application/pdf' || String(referenceImage?.name || '').toLowerCase().endsWith('.pdf');
}

function buildPromptText(message, drawing, hasAttachment = false) {
  const attachmentNote = hasAttachment
    ? '\n\n添付資料を参照し、図面へ反映可能な差分があれば ```json でコマンドを返してください。新規追加は {"action":"draw","shapes":[...]}、既存編集は {"action":"mutate","operations":[{"type":"update","id":"shape_xxx","patch":{...}}]} を使用してください。'
    : '';
  return `図面コンテキスト: ${JSON.stringify(drawing)}\n\n質問: ${message}${attachmentNote}`;
}

ipcMain.handle('ai:ask', async (_event, payload) => {
  const { provider, message, drawing, referenceImage } = payload ?? {};
  const hasAttachment = Boolean(referenceImage?.dataBase64);
  const attachedPdf = isPdfReference(referenceImage);

  if (!message || typeof message !== 'string') {
    throw new Error('メッセージが空です。');
  }

  if (provider === 'ollama') {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        stream: false,
        prompt: JSON.stringify({
          drawing,
          message,
          imageReference: referenceImage ? { name: referenceImage.name, mimeType: referenceImage.mimeType } : null,
        }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama接続エラー: ${response.status}`);
    }

    const data = await response.json();
    const addon = hasAttachment
      ? attachedPdf
        ? '\n\n[補足] Ollamaは添付PDFを直接解析できないため、メタ情報のみ参照しています。Claude/Gemini推奨。'
        : '\n\n[補足] Ollamaは現在テキストモデルで実行中のため、画像はメタ情報のみ参照しています。'
      : '';
    return { provider, type: 'text', text: (data.response || '(応答なし)') + addon };
  }

  if (provider === 'claude') {
    if (!claudeApiKey) {
      throw new Error('Claude APIキーが未設定です。');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: hasAttachment
              ? [
                  ...(attachedPdf
                    ? [{
                        type: 'document',
                        source: {
                          type: 'base64',
                          media_type: 'application/pdf',
                          data: referenceImage.dataBase64,
                        },
                      }]
                    : [{
                        type: 'image',
                        source: {
                          type: 'base64',
                          media_type: referenceImage.mimeType || 'image/jpeg',
                          data: referenceImage.dataBase64,
                        },
                      }]),
                  {
                    type: 'text',
                    text: buildPromptText(message, drawing, true),
                  },
                ]
              : [
                  {
                    type: 'text',
                    text: buildPromptText(message, drawing, false),
                  },
                ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude接続エラー: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const text = data.content?.map((item) => item.text).join('\n') || '(応答なし)';
    return { provider, type: 'text', text };
  }


  if (provider === 'openai') {
    if (!openAiApiKey) {
      throw new Error('OpenAI APIキーが未設定です。');
    }

    const content = [];
    if (hasAttachment && attachedPdf) {
      throw new Error('OpenAIプロバイダでのPDFチェックバックは未対応です。画像添付またはClaude/Geminiを使用してください。');
    }
    if (hasAttachment) {
      content.push({ type: 'input_image', image_url: `data:${referenceImage.mimeType || 'image/jpeg'};base64,${referenceImage.dataBase64}` });
    }
    content.push({
      type: 'input_text',
      text: buildPromptText(message, drawing, hasAttachment),
    });

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI接続エラー: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const text = data.output_text
      || data.output?.flatMap((item) => item.content || []).map((c) => c.text).filter(Boolean).join('\n')
      || '(応答なし)';
    return { provider, type: 'text', text };
  }

  if (provider === 'gemini') {
    if (!geminiApiKey) {
      throw new Error('Gemini APIキーが未設定です。');
    }

    const parts = [{ text: buildPromptText(message, drawing, hasAttachment) }];
    if (hasAttachment) {
      parts.unshift({ inline_data: { mime_type: attachedPdf ? 'application/pdf' : (referenceImage.mimeType || 'image/jpeg'), data: referenceImage.dataBase64 } });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini接続エラー: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') || '(応答なし)';
    return { provider, type: 'text', text };
  }

  throw new Error('未対応のプロバイダです。');
});

app.whenReady().then(() => {
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
