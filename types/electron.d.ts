export { };

declare global {
    interface Window {
        electron: {
            openNaverLogin: () => Promise<{ nidAut: string; nidSes: string } | null>;
            logoutNaver: () => Promise<boolean>;
            openExternal: (url: string) => Promise<void>;
            openPath: (path: string) => Promise<void>;
            selectDirectory: (defaultPath?: string) => Promise<string | null>;
            selectFile: (filters?: any[]) => Promise<string | null>;
            readFile: (filePath: string) => Promise<string>;
            getDiskUsage: (folderPath: string) => Promise<{ free: number; size: number; label: string }>;

            // Secure Cookie Storage
            encryptAndSaveCookies: (cookies: any) => Promise<boolean>;
            loadEncryptedCookies: () => Promise<any>;
            clearEncryptedCookies: () => Promise<boolean>;

            // Window controls
            windowMinimize: () => void;
            windowMaximize: () => void;
            windowClose: () => void;
            windowIsMaximized: () => Promise<boolean>;
            onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;

            // Auto-update
            checkForUpdates: () => Promise<void>;
            quitAndInstall: () => Promise<void>;
            onUpdateStatus: (callback: (status: string, info: any) => void) => () => void;
            onUpdateProgress: (callback: (percent: number) => void) => () => void;

            // Whisper
            getWhisperStatus: (engineId: string) => Promise<any>;
            getEngineStatus: (engineId: string) => Promise<any>;
            installWhisperEngine: (engineId: string, useGpu?: boolean) => Promise<{ success: boolean; error?: string }>;
            onEngineInstallProgress: (callback: (data: { engineId: string; progress: number; error?: string }) => void) => () => void;
            downloadWhisperResource: (type: 'model' | 'engine', engineId: string, modelId?: string) => Promise<{ success: boolean; path?: string; error?: string }>;
            cancelWhisperDownload: (type: 'model' | 'engine', engineId: string, modelId?: string) => Promise<{ success: boolean; error?: string }>;
            deleteWhisperResource: (type: 'model' | 'engine', engineId: string, modelId?: string) => Promise<{ success: boolean; error?: string }>;
            onDownloadProgress: (callback: (data: { type: string; engineId: string; modelId?: string; progress: number; downloadedBytes?: number; error?: string }) => void) => () => void;

            // Task
            addTranscriptionTask: (task: any) => Promise<{ success: boolean; error?: string }>;
            cancelTranscriptionTask: (taskId: string) => Promise<{ success: boolean; error?: string }>;
            onTaskUpdate: (callback: (data: { taskId: string; status: string; progress: number; result?: any; error?: string }) => void) => () => void;
            onTaskLog: (callback: (data: { taskId: string; message: string; type: string }) => void) => () => void;
            onTasksRestored: (callback: (data: any) => void) => () => void;

            // Migrated Actions
            searchChannels: (keyword: string) => Promise<any[]>;
            getChannelVideos: (channelId: string, page: number, size: number, sortType: string, cookies: any, videoType: string) => Promise<any>;
            getVideoMeta: (videoNo: string) => Promise<any>;
            getVodBitrate: (videoNo: string, resolution?: string) => Promise<number | null>;
            getChannelSocials: (channelId: string) => Promise<any[]>;
            startVideoDownload: (jobId: string, url: string, basePath: string, fileName: string, streamerName: string, resolution: string, cookies: any, maxFragments: number, downloadEngine: string, streamlinkPath: string, durationSeconds: number, bitrateBps: number, tempPath: string, thumbnailUrl?: string) => Promise<{ success: boolean }>;
            getVideoDownloadStatus: (jobId: string) => Promise<any>;
            cancelVideoDownload: (jobId: string) => Promise<{ success: boolean }>;
            deleteVideoFiles: (jobId: string) => Promise<{ success: boolean }>;
            checkDownloadedFiles: (vods: any[], basePath: string) => Promise<number[]>;
            checkFilesExistence: (paths: string[]) => Promise<Record<string, boolean>>;
            checkFileExists: (path: string) => Promise<boolean>;
            downloadChat: (vodId: string, streamerName: string, videoTitle: string, videoTimestamp: number, savePath: string, requestFileName?: string) => Promise<any>;
            convertLocalJsonToAss: (folderPath: string, fileName: string, settings: any) => Promise<any>;
            getAppVersion: () => Promise<string>;
        };
    }
}
