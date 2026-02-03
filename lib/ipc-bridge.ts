/**
 * IPC Bridge
 * Provides a clean interface for calling Electron IPC handlers from the renderer (Next.js components).
 * This replaces the previous 'Server Actions' to allow the app to work in static/packaged environments.
 */

// Global window extension is now handled in types/electron.d.ts

const isElectron = typeof window !== 'undefined' && !!window.electron;

export const ipcBridge = {
    searchChannels: async (keyword: string) => {
        if (!isElectron) return [];
        return window.electron.searchChannels(keyword);
    },
    getChannelVideos: async (channelId: string, page: number, size: number, sortType: string, cookies: any, videoType: string) => {
        if (!isElectron) return { videos: [], page: 0, size, totalCount: 0, totalPages: 0 };
        return window.electron.getChannelVideos(channelId, page, size, sortType, cookies, videoType);
    },
    getVideoMeta: async (videoNo: string) => {
        if (!isElectron) return null;
        return window.electron.getVideoMeta(videoNo);
    },
    getVodBitrate: async (videoNo: string, resolution?: string) => {
        if (!isElectron) return null;
        return window.electron.getVodBitrate(videoNo, resolution);
    },
    getChannelSocials: async (channelId: string) => {
        if (!isElectron) return [];
        return window.electron.getChannelSocials(channelId);
    },
    startVideoDownload: async (jobId: string, url: string, basePath: string, fileName: string, streamerName: string, resolution: string, cookies: any, maxFragments: number, downloadEngine: string, streamlinkPath: string, durationSeconds: number, bitrateBps: number, tempPath: string, thumbnailUrl?: string) => {
        if (!isElectron) return { success: false };
        return window.electron.startVideoDownload(jobId, url, basePath, fileName, streamerName, resolution, cookies, maxFragments, downloadEngine, streamlinkPath, durationSeconds, bitrateBps, tempPath, thumbnailUrl);
    },
    getVideoDownloadStatus: async (jobId: string) => {
        if (!isElectron) return null;
        return window.electron.getVideoDownloadStatus(jobId);
    },
    cancelVideoDownload: async (jobId: string) => {
        if (!isElectron) return { success: false };
        return window.electron.cancelVideoDownload(jobId);
    },
    deleteVideoFiles: async (jobId: string) => {
        if (!isElectron) return { success: false };
        return window.electron.deleteVideoFiles(jobId);
    },
    checkDownloadedFiles: async (vods: any[], basePath: string) => {
        if (!isElectron) return [];
        return window.electron.checkDownloadedFiles(vods, basePath);
    },
    checkFilesExistence: async (paths: string[]) => {
        if (!isElectron) return {};
        return window.electron.checkFilesExistence(paths);
    },
    downloadChat: async (vodId: string, streamerName: string, videoTitle: string, videoTimestamp: number, savePath: string, requestFileName?: string) => {
        if (!isElectron) return { success: false, error: 'Not in Electron environment' };
        return window.electron.downloadChat(vodId, streamerName, videoTitle, videoTimestamp, savePath, requestFileName);
    },    // Whisper
    getWhisperStatus: async (engineId: string) => {
        if (!isElectron) return null;
        return window.electron.getWhisperStatus(engineId);
    },
    getEngineStatus: async (engineId: string) => {
        if (!isElectron) return null;
        return window.electron.getEngineStatus(engineId);
    },
    installWhisperEngine: async (engineId: string, useGpu?: boolean) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.installWhisperEngine(engineId, useGpu);
    },
    onEngineInstallProgress: (callback: (data: any) => void) => {
        if (isElectron) return window.electron.onEngineInstallProgress(callback);
        return () => {};
    },
    checkFileExists: async (filePath: string) => {
        if (!isElectron) return false;
        return window.electron.checkFileExists(filePath);
    },
    downloadWhisperResource: async (type: 'model' | 'engine', engineId: string, modelId?: string) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.downloadWhisperResource(type, engineId, modelId);
    },
    cancelWhisperDownload: async (type: 'model' | 'engine', engineId: string, modelId?: string) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.cancelWhisperDownload(type, engineId, modelId);
    },
    deleteWhisperResource: async (type: 'model' | 'engine', engineId: string, modelId?: string) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.deleteWhisperResource(type, engineId, modelId);
    },
    onDownloadProgress: (callback: (data: any) => void) => {
        if (isElectron) return window.electron.onDownloadProgress(callback);
        return () => {};
    },
    // Task
    addTranscriptionTask: async (task: any) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.addTranscriptionTask(task);
    },
    cancelTranscriptionTask: async (taskId: string) => {
        if (!isElectron) return { success: false, error: 'Not electron' };
        return window.electron.cancelTranscriptionTask(taskId);
    },
    onTaskUpdate: (callback: (data: any) => void) => {
        if (isElectron) return window.electron.onTaskUpdate(callback);
        return () => {};
    },
    onTaskLog: (callback: (data: any) => void) => {
        if (isElectron) return window.electron.onTaskLog(callback);
        return () => {};
    },
    convertLocalJsonToAss: async (folderPath: string, fileName: string, settings: any) => {
        if (!isElectron) return { success: false, error: 'Not in Electron environment' };
        return window.electron.convertLocalJsonToAss(folderPath, fileName, settings);
    },
    openExternal: async (url: string) => {
        if (!isElectron) return false;
        return window.electron.openExternal(url);
    },
    openPath: async (path: string) => {
        if (!isElectron) return false;
        return window.electron.openPath(path);
    },
    selectDirectory: async (defaultPath?: string) => {
        if (!isElectron) return null;
        return window.electron.selectDirectory(defaultPath);
    },
    selectFile: async (filters?: any[]) => {
        if (!isElectron) return null;
        return window.electron.selectFile(filters);
    },
    getDiskUsage: async (folderPath: string) => {
        if (!isElectron) return null;
        return window.electron.getDiskUsage(folderPath);
    },
    encryptAndSaveCookies: async (cookies: any) => {
        if (!isElectron) return false;
        return window.electron.encryptAndSaveCookies(cookies);
    },
    loadEncryptedCookies: async () => {
        if (!isElectron) return null;
        return window.electron.loadEncryptedCookies();
    },
    clearEncryptedCookies: async () => {
        if (!isElectron) return false;
        return window.electron.clearEncryptedCookies();
    },
    windowMinimize: () => {
        if (isElectron) window.electron.windowMinimize();
    },
    windowMaximize: () => {
        if (isElectron) window.electron.windowMaximize();
    },
    windowClose: () => {
        if (isElectron) window.electron.windowClose();
    },
    windowIsMaximized: async () => {
        if (!isElectron) return false;
        return window.electron.windowIsMaximized();
    },
    getAppVersion: async () => {
        if (!isElectron) return '1.0.0'; // Fallback
        return window.electron.getAppVersion();
    }
};
