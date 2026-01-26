export { };

declare global {
    interface Window {
        electron: {
            openNaverLogin: () => Promise<{ nidAut: string; nidSes: string } | null>;
            logoutNaver: () => Promise<boolean>;
            openExternal: (url: string) => Promise<void>;
            openPath: (path: string) => Promise<void>;
            selectDirectory: (defaultPath?: string) => Promise<string | null>;
            getDiskUsage: (folderPath: string) => Promise<{ free: number; size: number }>;

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

            // Migrated Actions
            searchChannels: (keyword: string) => Promise<any[]>;
            getChannelVideos: (channelId: string, page: number, size: number, sortType: string, cookies: any, videoType: string) => Promise<any>;
            getVideoMeta: (videoNo: string) => Promise<any>;
            getVodBitrate: (videoNo: string, resolution?: string) => Promise<number | null>;
            getChannelSocials: (channelId: string) => Promise<any[]>;
            startVideoDownload: (jobId: string, url: string, basePath: string, fileName: string, streamerName: string, resolution: string, cookies: any, maxFragments: number, downloadEngine: string, streamlinkPath: string, durationSeconds: number, bitrateBps: number, tempPath: string, thumbnailUrl: string) => Promise<{ success: boolean }>;
            getVideoDownloadStatus: (jobId: string) => Promise<any>;
            cancelVideoDownload: (jobId: string) => Promise<{ success: boolean }>;
            deleteVideoFiles: (jobId: string) => Promise<{ success: boolean }>;
            checkDownloadedFiles: (vods: any[], basePath: string) => Promise<number[]>;
            checkFilesExistence: (paths: string[]) => Promise<Record<string, boolean>>;
            downloadChat: (vodId: string, streamerName: string, videoTitle: string, videoTimestamp: number, savePath: string, requestFileName?: string) => Promise<any>;
            convertLocalJsonToAss: (folderPath: string, fileName: string, settings: any) => Promise<any>;
            getAppVersion: () => Promise<string>;
        };
    }
}
