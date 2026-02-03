const { app, BrowserWindow, ipcMain, session, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { WhisperManager } = require('../lib/whisper-manager');
const { TaskProcessor } = require('../lib/task-processor');

// Lazy-loaded modules (loaded when needed)
let autoUpdater;
let checkDiskSpace;
let loadURL;

// electron-serve 초기화 (패키지 버전에서만)
if (app.isPackaged) {
    const serve = require('electron-serve');
    loadURL = serve({ directory: 'out' });
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,VisualLogging,PerformanceControls');
app.commandLine.appendSwitch('log-level', '3');

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (app.isReady()) dialog.showErrorBox('Uncaught Exception', error.stack || error.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

let mainWindow;
let splashWindow;

function createSplashWindow() {
    splashWindow = new BrowserWindow({
        width: 300,
        height: 260,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        center: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    splashWindow.loadFile(path.join(__dirname, 'splash.html'));
    splashWindow.once('ready-to-show', () => {
        splashWindow.show();
    });
}

function updateSplashStatus(message) {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.webContents.send('status', message);
    }
}

async function ensureFFmpeg() {
    // Priority: bundled @ffmpeg-installer/ffmpeg (lazy load, smaller size)
    try {
        const ffmpeg = require('@ffmpeg-installer/ffmpeg');
        if (ffmpeg.path && fs.existsSync(ffmpeg.path)) return ffmpeg.path;
    } catch (e) {
        console.error("Failed to load bundled @ffmpeg-installer/ffmpeg:", e);
    }

    // Fallback: check manual bin folder
    const binDir = path.join(app.getPath('userData'), 'bin');
    const ffmpegPath = path.join(binDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;

    return null;
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        title: '치지직 스크라이브',
        width: 1440,
        height: 900,
        frame: false,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: -100, y: -100 },
        autoHideMenuBar: true,
        backgroundColor: '#09090b',
        icon: path.join(__dirname, '../public/icon.png'),
        show: false,
        center: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: true, // 항상 DevTools 허용
        },
    });

    mainWindow.once('ready-to-show', () => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        if (mainWindow) {
            mainWindow.show();
            setTimeout(() => {
                if (mainWindow) {
                    mainWindow.setAlwaysOnTop(true, 'screen-saver');
                    mainWindow.setAlwaysOnTop(true);
                    mainWindow.focus();
                    mainWindow.show();
                    setTimeout(() => { if (mainWindow) mainWindow.setAlwaysOnTop(false); }, 1000);
                }
            }, 100);
        }
    });

    // Fallback: Force close splash after 10 seconds if ready-to-show doesn't fire
    setTimeout(() => {
        if (splashWindow && !splashWindow.isDestroyed()) {
            splashWindow.close();
        }
        if (mainWindow && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    }, 10000);

    ipcMain.on('window-minimize', () => mainWindow?.minimize());
    ipcMain.on('window-maximize', () => {
        if (mainWindow?.isMaximized()) mainWindow.unmaximize();
        else mainWindow?.maximize();
    });
    ipcMain.on('window-close', () => mainWindow?.close());
    ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

    ipcMain.handle('select-directory', async (e, defaultPath) => {
        const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], defaultPath });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('select-file', async (e, filters) => {
        const result = await dialog.showOpenDialog(mainWindow, { 
            properties: ['openFile'], 
            filters: filters || [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('read-file', async (e, filePath) => {
        try {
            if (!fs.existsSync(filePath)) return null;
            return fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            console.error('Failed to read file:', err);
            return null;
        }
    });

    ipcMain.handle('get-disk-usage', async (e, folderPath) => {
        try {
            if (!checkDiskSpace) checkDiskSpace = require('check-disk-space').default;
            const p = folderPath && fs.existsSync(folderPath) ? folderPath : app.getPath('userData');
            const d = await checkDiskSpace(p);
            return { free: d.free, size: d.size, label: path.parse(p).root };
        } catch (err) { return null; }
    });

    ipcMain.handle('encrypt-and-save-cookies', async (e, cookies) => {
        try {
            if (!safeStorage.isEncryptionAvailable()) return false;
            fs.writeFileSync(path.join(app.getPath('userData'), 'secure-cookies.enc'), safeStorage.encryptString(JSON.stringify(cookies)));
            return true;
        } catch (err) { return false; }
    });

    ipcMain.handle('load-encrypted-cookies', async () => {
        try {
            const p = path.join(app.getPath('userData'), 'secure-cookies.enc');
            if (!fs.existsSync(p) || !safeStorage.isEncryptionAvailable()) return null;
            return JSON.parse(safeStorage.decryptString(fs.readFileSync(p)));
        } catch (err) { return null; }
    });

    ipcMain.handle('clear-encrypted-cookies', async () => {
        try {
            const p = path.join(app.getPath('userData'), 'secure-cookies.enc');
            if (fs.existsSync(p)) fs.unlinkSync(p);
            return true;
        } catch (err) { return false; }
    });

    // Lazy load heavy modules when needed
    const { generateAssFromChats } = require('../lib/ass-converter.js');
    const { videoDownloader } = require('../lib/video-downloader.js');

    ipcMain.handle('search-channels', async (e, keyword) => {
        try {
            const r = await fetch(`https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(keyword)}&offset=0&size=30`, { headers: { "User-Agent": "Mozilla/5.0" } });
            const d = await r.json();
            return (d.content?.data || []).map(item => ({
                id: item.channel.channelId, name: item.channel.channelName, avatarUrl: item.channel.channelImageUrl || "",
                channelUrl: `https://chzzk.naver.com/${item.channel.channelId}`, description: item.channel.channelDescription, isVerified: item.channel.verifiedMark
            }));
        } catch (err) { return []; }
    });

    ipcMain.handle('get-channel-videos', async (e, channelId, page = 0, size = 18, sortType = "LATEST", cookies = null, videoType = "") => {
        try {
            const h = { "User-Agent": "Mozilla/5.0" };
            if (cookies) h["Cookie"] = `NID_AUT=${cookies.nidAut}; NID_SES=${cookies.nidSes}`;
            const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=${sortType}&page=${page}&size=${size}&videoType=${videoType}`, { headers: h });
            const d = await r.json();
            return d.content ? { videos: d.content.data || [], page: d.content.page || 0, totalCount: d.content.totalCount || 0, totalPages: d.content.totalPages || 0 } : { videos: [] };
        } catch (err) { return { videos: [] }; }
    });

    ipcMain.handle('get-vod-bitrate', async (e, videoNo, res) => {
        updateSplashStatus("비트레이트 정보 요청 중...");
        try {
            const r = await fetch(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}/video-playback-json`, { headers: { "User-Agent": "Mozilla/5.0" } });
            const d = await r.json();
            const pb = JSON.parse(d.content);
            let targetH = 1080;
            if (res) { const m = res.match(/(\d+)p/); if (m) targetH = parseInt(m[1]); }
            const v = pb.videos?.find(v => v.encodingOption?.height === targetH) || pb.videos?.sort((a, b) => (b.encodingOption?.bitrate || 0) - (a.encodingOption?.bitrate || 0))[0];
            return v?.encodingOption?.bitrate || null;
        } catch (err) { return null; }
    });

    ipcMain.handle('start-video-download', async (e, jobId, url, basePath, fileName, streamerName, res, cookies, maxFrags, engine, slPath, duration, bitrate, tempPath, thumb) => {
        let savePath = basePath;
        if (streamerName) savePath = path.join(basePath, streamerName.replace(/[<>:"/\\|?*]/g, ""));
        videoDownloader.start(jobId, url, savePath, fileName, res, cookies, maxFrags, engine, slPath, duration, bitrate, tempPath || path.join(basePath, ".downloading"), thumb);
        return { success: true };
    });

    ipcMain.handle('get-video-download-status', async (e, jobId) => {
        const s = videoDownloader.getStatus(jobId);
        if (!s) return null;

        // Explicitly select only serializable fields to avoid 'An object could not be cloned' errors
        return {
            jobId: s.jobId,
            status: s.status,
            progress: s.progress,
            downloadedSize: s.downloadedSize,
            totalSize: s.totalSize,
            speed: s.speed,
            eta: s.eta,
            fileName: s.fileName,
            filePath: s.filePath,
            error: s.error,
            filePath: s.filePath,
            folderPath: s.filePath ? path.dirname(s.filePath) : (s.savePath || undefined)
        };
    });

    ipcMain.handle('download-chat', async (e, vodId, streamerName, videoTitle, videoTimestamp, savePath, requestFileName) => {
        try {
            const sanitizedStreamer = streamerName.replace(/[<>:"/\\|?*]/g, "");
            let fileNameBase;
            if (requestFileName) fileNameBase = requestFileName.replace(/\.json$/i, "").replace(/[<>:"/\\|?*]/g, "");
            else {
                const date = new Date(videoTimestamp);
                fileNameBase = `[${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}][${sanitizedStreamer}] ${videoTitle.replace(/[<>:"/\\|?*]/g, "")}`;
            }
            const folderPath = path.join(savePath, sanitizedStreamer);
            const fullPathJson = path.join(folderPath, `${fileNameBase}.json`);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

            let nextMessageTime = 0;
            let prevMessageTime = -1;
            let allChats = [];
            while (true) {
                const r = await fetch(`https://api.chzzk.naver.com/service/v1/videos/${vodId}/chats?playerMessageTime=${nextMessageTime}`, { headers: { "User-Agent": "Mozilla/5.0" } });
                if (!r.ok) break;
                const d = await r.json();
                if (!d.content || !d.content.videoChats) break;
                allChats.push(...d.content.videoChats);
                const curNext = d.content.nextPlayerMessageTime;
                if (!curNext || curNext === nextMessageTime || curNext === prevMessageTime) break;
                prevMessageTime = nextMessageTime;
                nextMessageTime = curNext;
                await new Promise(res => setTimeout(res, 50));
            }

            if (allChats.length === 0) {
                return {
                    success: false,
                    error: "자막은 지난방송만 다운로드 가능합니다. 업로드 영상은 채팅이 존재하지않습니다."
                };
            }

            fs.writeFileSync(fullPathJson, JSON.stringify({ data: allChats, meta: { vodId, streamerName, videoTitle, videoTimestamp, downloadDate: new Date().toISOString() } }, null, 2), "utf-8");
            return { success: true, filePath: fullPathJson, fileName: `${fileNameBase}.json`, folderPath, chatCount: allChats.length };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('convert-local-json-to-ass', async (e, folderPath, fileName, settings) => {
        try {
            let jsonPath = path.join(folderPath, fileName);
            if (!fs.existsSync(jsonPath)) {
                const match = fs.readdirSync(folderPath).find(f => f.endsWith(".json") && f.includes(fileName.replace(/\.json$/i, "")));
                if (match) jsonPath = path.join(folderPath, match);
                else return { success: false, error: "JSON 파일을 찾을 수 없습니다." };
            }

            const json = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
            let chats = Array.isArray(json) ? json : (json.data || (json.content && json.content.videoChats) || json.videoChats || []);

            if (!chats || chats.length === 0) return { success: false, error: "채팅 데이터가 없습니다." };

            let videoTs = json.meta?.videoTimestamp || (chats.length > 0 ? chats[0].messageTime : 0);
            if (!videoTs) {
                const m = path.basename(jsonPath).match(/^\[(\d{4}-\d{2}-\d{2})\]/);
                if (m) videoTs = new Date(m[1]).getTime();
            }

            // Fetch liveOpenDate from v3 API if vodId is available
            const vodId = json.meta?.vodId;
            if (vodId) {
                try {
                    const r = await fetch(`https://api.chzzk.naver.com/service/v3/videos/${vodId}`, { headers: { "User-Agent": "Mozilla/5.0" } });
                    if (r.ok) {
                        const d = await r.json();
                        const liveOpenDate = d.content?.liveOpenDate;
                        if (liveOpenDate && typeof liveOpenDate === 'string') {
                            videoTs = new Date(liveOpenDate).getTime();
                        }
                    }
                } catch (err) {
                    console.warn("Failed to fetch liveOpenDate from v3 API:", err.message);
                }
            }

            const safeSettings = { fontSize: 32, maxLines: 15, boxWidth: 400, assPosition: "top-right", ...settings };
            const assContent = generateAssFromChats(chats, safeSettings, videoTs);
            const assPath = jsonPath.replace(/\.json$/i, ".ass");
            fs.writeFileSync(assPath, "\uFEFF" + assContent, "utf-8");
            return { success: true, filePath: assPath };
        } catch (err) { return { success: false, error: err.message }; }
    });

    ipcMain.handle('get-channel-socials', async (e, channelId) => {
        try {
            const r = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${channelId}/social-links`, { headers: { "User-Agent": "Mozilla/5.0" } });
            const d = await r.json();
            return (d.content?.links || []).map(link => ({ type: link.type, url: link.url }));
        } catch (err) { return []; }
    });

    ipcMain.handle('get-video-meta', async (e, videoNo) => {
        try {
            const r = await fetch(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}`, { headers: { "User-Agent": "Mozilla/5.0" } });
            const d = await r.json();
            return d.content || null;
        } catch (err) { return null; }
    });

    ipcMain.handle('cancel-video-download', (e, jobId) => {
        videoDownloader.cancel(jobId);
        return { success: true };
    });

    ipcMain.handle('delete-video-files', async (e, jobId) => {
        await videoDownloader.deleteFiles(jobId);
        return { success: true };
    });

    ipcMain.handle('check-downloaded-files', async (e, vods, basePath) => {
        const downloadedIds = [];
        if (!fs.existsSync(basePath)) return downloadedIds;
        try {
            const streamersOnDisk = fs.readdirSync(basePath).filter(f => fs.lstatSync(path.join(basePath, f)).isDirectory());
            for (const vod of vods) {
                const sanitizedStreamer = (vod.streamerName || "Unknown").replace(/[<>:"/\\|?*]/g, "");
                const folderPath = path.join(basePath, sanitizedStreamer);
                if (fs.existsSync(folderPath)) {
                    const files = fs.readdirSync(folderPath);
                    const sanitizedTitle = (vod.title || "").replace(/[<>:"/\\|?*]/g, "");
                    if (files.some(f => f.includes(sanitizedTitle) || f.includes(String(vod.videoNo)))) {
                        downloadedIds.push(vod.videoNo);
                    }
                }
            }
        } catch (err) { console.error("checkDownloadedFiles error:", err); }
        return downloadedIds;
    });

    ipcMain.handle('check-files-existence', async (e, paths) => {
        const results = {};
        for (const p of paths) {
            results[p] = fs.existsSync(p);
        }
        return results;
    });

    ipcMain.handle('open-external', async (e, url) => { shell.openExternal(url); });
    ipcMain.handle('open-path', async (e, p) => { shell.openPath(p); });

    ipcMain.handle('open-naver-login', async () => {
        return new Promise((resolve) => {
            const loginWin = new BrowserWindow({
                width: 500,
                height: 700,
                parent: mainWindow,
                modal: true,
                autoHideMenuBar: true,
                icon: path.join(__dirname, '../public/icon.png'),
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            });

            loginWin.loadURL('https://nid.naver.com/nidlogin.login');

            const checkCookies = async () => {
                const cookies = await session.defaultSession.cookies.get({ domain: '.naver.com' });
                const nidAut = cookies.find(c => c.name === 'NID_AUT')?.value;
                const nidSes = cookies.find(c => c.name === 'NID_SES')?.value;

                if (nidAut && nidSes) {
                    resolve({ nidAut, nidSes });
                    loginWin.close();
                }
            };

            loginWin.webContents.on('did-navigate', checkCookies);
            loginWin.webContents.on('did-frame-navigate', checkCookies);

            loginWin.on('closed', () => {
                resolve(null);
            });
        });
    });

    ipcMain.handle('logout-naver', async () => {
        const cookies = await session.defaultSession.cookies.get({ domain: '.naver.com' });
        for (const cookie of cookies) {
            const url = `https${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
            await session.defaultSession.cookies.remove(url, cookie.name);
        }
        return true;
    });

    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('quit-and-install', () => {
        if (!autoUpdater) autoUpdater = require('electron-updater').autoUpdater;
        autoUpdater.quitAndInstall();
    });

    if (app.isPackaged) {
        updateSplashStatus("리소스 로드 중...");
        await loadURL(mainWindow);
    }
    else {
        updateSplashStatus("개발 서버 연결 중...");
        mainWindow.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:3000');
    }
}

app.whenReady().then(async () => {
    // Show splash immediately on app start
    const splashStartTime = Date.now();
    createSplashWindow();
    
    // Start loading main window in background (show: false)
    updateSplashStatus("애플리케이션 초기화 중...");
    
    try {
        // Check FFmpeg
        const ffmpegCheck = ensureFFmpeg();
        updateSplashStatus("시스템 구성 확인 중...");
        await ffmpegCheck;
        
        // Create main window (will show when ready via ready-to-show event)
        await createWindow();
        
        // Ensure splash is shown for at least 1.5 seconds (prevents flicker)
        const elapsed = Date.now() - splashStartTime;
        if (elapsed < 1500) {
            await new Promise(r => setTimeout(r, 1500 - elapsed));
        }
    } catch (err) {
        console.error("Initialization error:", err);
        createWindow(); // Try to open anyway
    }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => {
    console.log('[Main] App is quitting, cleaning up tasks');
    if (taskProcessor) {
        taskProcessor.cleanup();
    }
});
// Removed redundant get-version as get-app-version is now the standard handler
ipcMain.handle('check-for-updates', async () => {
    try {
        if (!autoUpdater) autoUpdater = require('electron-updater').autoUpdater;
        const r = await autoUpdater.checkForUpdatesAndNotify();
        return r || { updateInfo: { version: app.getVersion() } };
    }
    catch (e) { return { error: e.message }; }
});

// Whisper Manager & Task Processor IPC
let whisperManager;
let taskProcessor;

function getWhisperManager() {
    if (!whisperManager) whisperManager = new WhisperManager();
    return whisperManager;
}

function getTaskProcessor(webContents) {
    if (!taskProcessor) {
        taskProcessor = new TaskProcessor(getWhisperManager(), webContents);
    } else if (webContents && (!taskProcessor.webContents || taskProcessor.webContents.isDestroyed())) {
        taskProcessor.webContents = webContents;
    }
    return taskProcessor;
}

ipcMain.handle('add-transcription-task', async (e, { task }) => {
    getTaskProcessor(e.sender).addTask(task);
    return { success: true };
});

ipcMain.handle('cancel-transcription-task', async (e, { taskId }) => {
    getTaskProcessor(e.sender).cancelTask(taskId);
    return { success: true };
});

ipcMain.handle('get-whisper-status', async (e, { engineId }) => {
    return await getWhisperManager().getStatus(engineId);
});

ipcMain.handle('get-engine-status', async (e, { engineId }) => {
    return await getWhisperManager().getEngineStatus(engineId);
});

ipcMain.handle('install-whisper-engine', async (e, { engineId, useGpu }) => {
    const onProgress = (progress, message) => {
        if (!e.sender.isDestroyed()) {
            e.sender.send('engine-install-progress', { engineId, progress, message });
        }
    };
    try {
        const result = await getWhisperManager().installEngine(engineId, onProgress, useGpu);
        return { success: true, ...result };
    } catch (error) {
        if (!e.sender.isDestroyed()) {
            e.sender.send('engine-install-progress', { engineId, progress: -1, error: error.message });
        }
        return { success: false, error: error.message };
    }
});

    ipcMain.handle('check-file-exists', async (e, filePath) => {
        return fs.existsSync(filePath);
    });

ipcMain.handle('download-whisper-resource', async (e, { type, engineId, modelId }) => {
    const onProgress = (progress) => {
        if (!e.sender.isDestroyed()) {
            e.sender.send('download-progress', { type, engineId, modelId, progress });
        }
    };
    const onDownloadedBytes = (bytes) => {
        if (!e.sender.isDestroyed()) {
            e.sender.send('download-progress', { type, engineId, modelId, downloadedBytes: bytes });
        }
    };
    try {
        if (type === 'model') {
            const path = await getWhisperManager().downloadModel(engineId, modelId, onProgress, onDownloadedBytes);
            return { success: true, path };
        } else if (type === 'engine') {
            const path = await getWhisperManager().downloadEngine(engineId, onProgress);
            return { success: true, path };
        }
        return { success: false, error: 'Unknown type' };
    } catch (error) {
        // 오류 발생 시 progress -1로 전송하여 UI에서 다운로드 상태 해제
        if (!e.sender.isDestroyed()) {
            e.sender.send('download-progress', { type, engineId, modelId, progress: -1, error: error.message });
        }
        return { success: false, error: error.message };
    }
});

ipcMain.handle('cancel-whisper-download', async (e, { type, engineId, modelId }) => {
    try {
        if (type === 'model') {
            const cancelled = getWhisperManager().cancelDownload(engineId, modelId);
            return { success: cancelled };
        }
        return { success: false, error: 'Not implemented' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('delete-whisper-resource', async (e, { type, engineId, modelId }) => {
    try {
        if (type === 'model') {
            await getWhisperManager().deleteModel(engineId, modelId);
            return { success: true };
        } else if (type === 'engine') {
            await getWhisperManager().deleteEngine(engineId);
            return { success: true };
        }
        return { success: false, error: 'Unknown type' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

