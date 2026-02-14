const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiBridge', {
  setClaudeApiKey: (apiKey) => ipcRenderer.invoke('ai:set-claude-api-key', apiKey),
  setOpenAiApiKey: (apiKey) => ipcRenderer.invoke('ai:set-openai-api-key', apiKey),
  setGeminiApiKey: (apiKey) => ipcRenderer.invoke('ai:set-gemini-api-key', apiKey),
  ask: (payload) => ipcRenderer.invoke('ai:ask', payload),
});

contextBridge.exposeInMainWorld('cadBridge', {
  openFile: () => ipcRenderer.invoke('cad:open-file'),
  saveDxf: (content) => ipcRenderer.invoke('cad:save-dxf', content),
  onMenuOpenFile: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-file', listener);
    return () => ipcRenderer.removeListener('menu:open-file', listener);
  },
});
