const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ftpSync', {
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getSyncState: () => ipcRenderer.invoke('get-sync-state'),
    testCredentials: config => ipcRenderer.invoke('test-ftp-credentials', config),
    listRemoteDirectories: payload => ipcRenderer.invoke('list-remote-directories', payload),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    startSync: config => ipcRenderer.invoke('start-sync', config),
    stopSync: () => ipcRenderer.invoke('stop-sync'),
    onLog: callback => ipcRenderer.on('log-msg', (_event, data) => callback(data)),
    onSyncStateChanged: callback => ipcRenderer.on('sync-state-changed', (_event, state) => callback(state))
});
