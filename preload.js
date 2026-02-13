const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiBridge', {
  setClaudeApiKey: (apiKey) => ipcRenderer.invoke('ai:set-claude-api-key', apiKey),
  ask: (payload) => ipcRenderer.invoke('ai:ask', payload),
});

contextBridge.exposeInMainWorld('cadBridge', {
  openFile: () => ipcRenderer.invoke('cad:open-file'),
  onMenuOpenFile: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-file', listener);
    return () => ipcRenderer.removeListener('menu:open-file', listener);
  },
});
