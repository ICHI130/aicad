const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiBridge', {
  setClaudeApiKey: (apiKey) => ipcRenderer.invoke('ai:set-claude-api-key', apiKey),
  ask: (payload) => ipcRenderer.invoke('ai:ask', payload),
});
