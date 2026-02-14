const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let claudeApiKey = '';

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

ipcMain.handle('ai:set-claude-api-key', (_event, apiKey) => {
  claudeApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  return { ok: true, configured: Boolean(claudeApiKey) };
});

ipcMain.handle('ai:ask', async (_event, payload) => {
  const { provider, message, drawing } = payload ?? {};

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
        prompt: JSON.stringify({ drawing, message }),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama接続エラー: ${response.status}`);
    }

    const data = await response.json();
    return { provider, text: data.response || '(応答なし)' };
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
            content: `図面コンテキスト: ${JSON.stringify(drawing)}\n\n質問: ${message}`,
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
    return { provider, text };
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
