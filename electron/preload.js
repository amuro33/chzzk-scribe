const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    openNaverLogin: () => ipcRenderer.invoke('open-naver-login'),
    logoutNaver: () => ipcRenderer.invoke('logout-naver'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openPath: (path) => ipcRenderer.invoke('open-path', path),
    selectDirectory: (defaultPath) => ipcRenderer.invoke('select-directory', defaultPath),
    getDiskUsage: (folderPath) => ipcRenderer.invoke('get-disk-usage', folderPath),

    // Secure Cookie Storage
    encryptAndSaveCookies: (cookies) => ipcRenderer.invoke('encrypt-and-save-cookies', cookies),
    loadEncryptedCookies: () => ipcRenderer.invoke('load-encrypted-cookies'),
    clearEncryptedCookies: () => ipcRenderer.invoke('clear-encrypted-cookies'),

    // Window controls
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

    // Listen for maximize state changes
    onMaximizedChange: (callback) => {
        ipcRenderer.on('window-maximized-change', (_, isMaximized) => callback(isMaximized));
        return () => ipcRenderer.removeAllListeners('window-maximized-change');
    },

    // Auto-update
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_, status, info) => callback(status, info));
        return () => ipcRenderer.removeAllListeners('update-status');
    },
    onUpdateProgress: (callback) => {
        ipcRenderer.on('update-progress', (_, percent) => callback(percent));
        return () => ipcRenderer.removeAllListeners('update-progress');
    },
});
