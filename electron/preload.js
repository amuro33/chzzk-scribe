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

    // Migrated Actions
    searchChannels: (keyword) => ipcRenderer.invoke('search-channels', keyword),
    getChannelVideos: (channelId, page, size, sortType, cookies, videoType) =>
        ipcRenderer.invoke('get-channel-videos', channelId, page, size, sortType, cookies, videoType),
    getVideoMeta: (videoNo) => ipcRenderer.invoke('get-video-meta', videoNo),
    getVodBitrate: (videoNo, resolution) => ipcRenderer.invoke('get-vod-bitrate', videoNo, resolution),
    getChannelSocials: (channelId) => ipcRenderer.invoke('get-channel-socials', channelId),
    startVideoDownload: (jobId, url, basePath, fileName, streamerName, resolution, cookies, maxFragments, downloadEngine, streamlinkPath, durationSeconds, bitrateBps, tempPath, thumbnailUrl) =>
        ipcRenderer.invoke('start-video-download', jobId, url, basePath, fileName, streamerName, resolution, cookies, maxFragments, downloadEngine, streamlinkPath, durationSeconds, bitrateBps, tempPath, thumbnailUrl),
    getVideoDownloadStatus: (jobId) => ipcRenderer.invoke('get-video-download-status', jobId),
    cancelVideoDownload: (jobId) => ipcRenderer.invoke('cancel-video-download', jobId),
    deleteVideoFiles: (jobId) => ipcRenderer.invoke('delete-video-files', jobId),
    checkDownloadedFiles: (vods, basePath) => ipcRenderer.invoke('check-downloaded-files', vods, basePath),
    checkFilesExistence: (paths) => ipcRenderer.invoke('check-files-existence', paths),
    downloadChat: (vodId, streamerName, videoTitle, videoTimestamp, savePath, requestFileName) =>
        ipcRenderer.invoke('download-chat', vodId, streamerName, videoTitle, videoTimestamp, savePath, requestFileName),
    convertLocalJsonToAss: (folderPath, fileName, settings) =>
        ipcRenderer.invoke('convert-local-json-to-ass', folderPath, fileName, settings),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
