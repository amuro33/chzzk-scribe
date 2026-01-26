const { app, BrowserWindow, ipcMain, session, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const checkDiskSpace = require('check-disk-space').default;

// Suppress known noisy internal DevTools errors for a cleaner terminal
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,VisualLogging,PerformanceControls');
app.commandLine.appendSwitch('log-level', '3'); // Only show errors

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (app.isReady()) {
        dialog.showErrorBox('Uncaught Exception', error.stack || error.message);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't show dialog box for unhandled rejections as it's too intrusive.
    // Errors are still logged to the console/debug log.
});

let mainWindow;
let loginWindow;

// function createWindow wrapped async
async function createWindow() {
    const defaultWidth = 1440;
    const defaultHeight = 900;

    mainWindow = new BrowserWindow({
        title: '치지직 스크라이브',
        width: defaultWidth,
        height: defaultHeight,
        frame: false, // Restore frameless
        titleBarStyle: 'hidden', // For macOS
        trafficLightPosition: { x: -100, y: -100 }, // Hide macOS traffic lights
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
            devTools: !app.isPackaged,
        },
    });

    // WebContent listeners (logging removed for production)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // Aggressive focus sequence for Windows
        setTimeout(() => {
            if (mainWindow) {
                mainWindow.setAlwaysOnTop(true, 'screen-saver');
                mainWindow.setAlwaysOnTop(true);
                mainWindow.focus();
                mainWindow.show();

                // Release always-on-top after a short delay
                setTimeout(() => {
                    if (mainWindow) mainWindow.setAlwaysOnTop(false);
                }, 1000);
            }
        }, 100);
    });

    // Window control IPC handlers
    ipcMain.on('window-minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.on('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    ipcMain.on('window-close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('window-is-maximized', () => {
        return mainWindow?.isMaximized() ?? false;
    });

    // Select Directory (with optional default path)
    ipcMain.handle('select-directory', async (event, defaultPath) => {
        const options = {
            properties: ['openDirectory']
        };
        if (defaultPath) {
            options.defaultPath = defaultPath;
        }
        const result = await dialog.showOpenDialog(mainWindow, options);
        if (result.canceled) {
            return null;
        } else {
            return result.filePaths[0];
        }
    });

    // Get Disk Usage
    ipcMain.handle('get-disk-usage', async (event, folderPath) => {
        try {
            // If path is empty or invalid, fallback to app data path
            const pathToCheck = folderPath && fs.existsSync(folderPath) ? folderPath : app.getPath('userData');
            const diskSpace = await checkDiskSpace(pathToCheck);
            return {
                free: diskSpace.free,
                size: diskSpace.size,
                label: path.parse(pathToCheck).root
            };
        } catch (error) {
            console.error('Failed to get disk space:', error);
            return null;
        }
    });

    // Secure Cookie Storage using safeStorage API
    const getSecureCookiePath = () => {
        return path.join(app.getPath('userData'), 'secure-cookies.enc');
    };

    ipcMain.handle('encrypt-and-save-cookies', async (event, cookies) => {
        try {
            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[SafeStorage] Encryption not available, storing as-is');
                // Fallback: store without encryption (not recommended)
                return false;
            }

            const jsonData = JSON.stringify(cookies);
            const encryptedBuffer = safeStorage.encryptString(jsonData);
            const cookiePath = getSecureCookiePath();

            fs.writeFileSync(cookiePath, encryptedBuffer);
            console.log('[SafeStorage] Cookies encrypted and saved');
            return true;
        } catch (error) {
            console.error('[SafeStorage] Encrypt failed:', error);
            return false;
        }
    });

    ipcMain.handle('load-encrypted-cookies', async () => {
        try {
            const cookiePath = getSecureCookiePath();

            if (!fs.existsSync(cookiePath)) {
                return null;
            }

            if (!safeStorage.isEncryptionAvailable()) {
                console.warn('[SafeStorage] Encryption not available');
                return null;
            }

            const encryptedBuffer = fs.readFileSync(cookiePath);
            const decryptedJson = safeStorage.decryptString(encryptedBuffer);
            const cookies = JSON.parse(decryptedJson);

            console.log('[SafeStorage] Cookies loaded and decrypted');
            return cookies;
        } catch (error) {
            console.error('[SafeStorage] Decrypt failed:', error);
            return null;
        }
    });

    ipcMain.handle('clear-encrypted-cookies', async () => {
        try {
            const cookiePath = getSecureCookiePath();
            if (fs.existsSync(cookiePath)) {
                fs.unlinkSync(cookiePath);
                console.log('[SafeStorage] Encrypted cookies cleared');
            }
            return true;
        } catch (error) {
            console.error('[SafeStorage] Clear failed:', error);
            return false;
        }
    });

    // Send maximize state changes to renderer
    mainWindow.on('maximize', () => {
        mainWindow?.webContents.send('window-maximized-change', true);
    });

    mainWindow.on('unmaximize', () => {
        mainWindow?.webContents.send('window-maximized-change', false);
    });

    // --- Next.js Action Migration to IPC ---
    const { generateAssFromChats } = require('../lib/ass-converter.js');
    const { videoDownloader } = require('../lib/video-downloader.js');

    ipcMain.handle('search-channels', async (event, keyword) => {
        try {
            const url = `https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(keyword)}&offset=0&size=30&withFirstChannelContent=false`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                },
            });
            const data = await response.json();
            if (!data.content || !data.content.data) return [];
            return data.content.data.map((item) => {
                const channel = item.channel;
                return {
                    id: channel.channelId,
                    name: channel.channelName,
                    avatarUrl: channel.channelImageUrl ? channel.channelImageUrl : "",
                    channelUrl: `https://chzzk.naver.com/${channel.channelId}`,
                    description: channel.channelDescription,
                    isVerified: channel.verifiedMark,
                };
            });
        } catch (error) {
            console.error("[Search] IPC Search failed:", error);
            return [];
        }
    });

    ipcMain.handle('get-channel-videos', async (event, channelId, page = 0, size = 18, sortType = "LATEST", cookies = null, videoType = "") => {
        try {
            const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=${sortType}&pagingType=PAGE&page=${page}&size=${size}&publishDateAt=&videoType=${videoType}`;
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json",
            };
            if (cookies) {
                headers["Cookie"] = `NID_AUT=${cookies.nidAut}; NID_SES=${cookies.nidSes}`;
            }
            const response = await fetch(url, { headers });
            const data = await response.json();
            if (!data.content || !data.content.data) {
                return { videos: [], page: 0, size, totalCount: 0, totalPages: 0 };
            }
            return {
                videos: data.content.data,
                page: data.content.page || page,
                size: data.content.size || size,
                totalCount: data.content.totalCount || 0,
                totalPages: data.content.totalPages || 0
            };
        } catch (error) {
            console.error("[Videos] IPC Fetch failed:", error);
            return { videos: [], page: 0, size, totalCount: 0, totalPages: 0 };
        }
    });

    ipcMain.handle('get-video-meta', async (event, videoNo) => {
        try {
            const url = `https://api.chzzk.naver.com/service/v2/videos/${videoNo}`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                }
            });
            const data = await response.json();
            if (data.code !== 200 || !data.content) return null;
            return data.content;
        } catch (error) {
            console.error("[VideoMeta] IPC Fetch failed:", error);
            return null;
        }
    });

    ipcMain.handle('get-vod-bitrate', async (event, videoNo, resolution) => {
        try {
            const url = `https://api.chzzk.naver.com/service/v1/videos/${videoNo}/video-playback-json`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                }
            });
            const data = await response.json();
            if (data.content && typeof data.content === "string") {
                const playbackData = JSON.parse(data.content);
                if (playbackData.videos && Array.isArray(playbackData.videos)) {
                    let targetHeight = 1080;
                    if (resolution) {
                        const match = resolution.match(/(\d+)p/);
                        if (match) targetHeight = parseInt(match[1]);
                    }
                    const matchingVideo = playbackData.videos.find((v) => v.encodingOption?.height === targetHeight);
                    if (matchingVideo?.encodingOption?.bitrate) return matchingVideo.encodingOption.bitrate;
                    const sorted = playbackData.videos.sort((a, b) => (b.encodingOption?.bitrate || 0) - (a.encodingOption?.bitrate || 0));
                    if (sorted[0]?.encodingOption?.bitrate) return sorted[0].encodingOption.bitrate;
                }
            }
            return null;
        } catch (error) {
            console.error("[VodBitrate] IPC Fetch failed:", error);
            return null;
        }
    });

    ipcMain.handle('get-channel-socials', async (event, channelId) => {
        try {
            const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/data?fields=socialLinks,donationRankingsExposure,channelHistory,achievementBadgeExposure,logPowerRankingExposure,logPowerActive`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                }
            });
            const data = await response.json();
            if (data.code !== 200 || !data.content || !data.content.socialLinks) return [];
            return data.content.socialLinks.map((link) => {
                const url = link.landingUrl || link.url || "";
                let type = "OTHER";
                if (url.includes("youtube.com") || url.includes("youtu.be")) type = "YOUTUBE";
                else if (url.includes("cafe.naver.com")) type = "CAFE";
                else if (url.includes("instagram.com")) type = "INSTAGRAM";
                else if (url.includes("twitter.com") || url.includes("x.com")) type = "TWITTER";
                else if (url.includes("facebook.com")) type = "FACEBOOK";
                else if (url.includes("discord.gg") || url.includes("discord.com")) type = "DISCORD";
                return { type, url };
            });
        } catch (error) {
            console.error("[Socials] IPC Fetch failed:", error);
            return [];
        }
    });

    ipcMain.handle('start-video-download', async (event, jobId, url, basePath, fileName, streamerName, resolution, cookies, maxFragments, streamlinkPath, durationSeconds, bitrateBps, tempPath, thumbnailUrl) => {
        let savePath = basePath;
        if (streamerName) {
            const sanitized = streamerName.replace(/[<>:"/\\|?*]/g, "");
            savePath = path.join(basePath, sanitized);
        }
        const effectiveTempPath = tempPath || path.join(basePath, ".downloading");
        videoDownloader.start(jobId, url, savePath, fileName, resolution, cookies, maxFragments, streamlinkPath, durationSeconds, bitrateBps, effectiveTempPath, thumbnailUrl);
        return { success: true };
    });

    ipcMain.handle('get-video-download-status', async (event, jobId) => {
        const status = videoDownloader.getStatus(jobId);
        if (!status) return null;
        return {
            jobId: status.jobId,
            status: status.status,
            progress: status.progress,
            downloadedSize: status.downloadedSize,
            totalSize: status.totalSize,
            speed: status.speed,
            eta: status.eta,
            error: status.error,
            fileName: status.fileName,
            filePath: status.filePath,
            folderPath: status.filePath ? path.dirname(status.filePath) : undefined
        };
    });

    ipcMain.handle('cancel-video-download', async (event, jobId) => {
        videoDownloader.cancel(jobId);
        return { success: true };
    });

    ipcMain.handle('delete-video-files', async (event, jobId) => {
        videoDownloader.deleteFiles(jobId);
        return { success: true };
    });

    ipcMain.handle('check-downloaded-files', async (event, vods, basePath) => {
        try {
            const existingIds = [];
            for (const vod of vods) {
                const sanitizedStreamer = vod.streamerName.replace(/[<>:"/\\|?*]/g, "");
                const sanitizedTitle = vod.title.replace(/[<>:"/\\|?*]/g, "");
                const date = new Date(vod.timestamp);
                const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const fileName = `[${timestampStr}][${sanitizedStreamer}] ${sanitizedTitle}.mp4`;
                const path1 = path.join(basePath, sanitizedStreamer, fileName);
                const path2 = path.join(basePath, fileName);
                if (fs.existsSync(path1) || fs.existsSync(path2)) existingIds.push(vod.videoNo);
            }
            return existingIds;
        } catch (error) {
            console.error("Failed to check downloaded files:", error);
            return [];
        }
    });

    ipcMain.handle('check-files-existence', async (event, paths) => {
        const results = {};
        for (const p of paths) {
            if (!p) { results[p] = false; continue; }
            results[p] = fs.existsSync(p);
        }
        return results;
    });

    ipcMain.handle('download-chat', async (event, vodId, streamerName, videoTitle, videoTimestamp, savePath, requestFileName) => {
        try {
            const sanitizedStreamer = streamerName.replace(/[<>:"/\\|?*]/g, "");
            let fileNameBase;
            if (requestFileName) {
                fileNameBase = requestFileName.replace(/\.json$/i, "").replace(/[<>:"/\\|?*]/g, "");
            } else {
                const date = new Date(videoTimestamp);
                const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                fileNameBase = `[${timestampStr}][${sanitizedStreamer}] ${videoTitle.replace(/[<>:"/\\|?*]/g, "")}`;
            }
            const folderPath = path.join(savePath, sanitizedStreamer);
            const fullPathJson = path.join(folderPath, `${fileNameBase}.json`);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

            let nextMessageTime = 0;
            let allChats = [];
            let isFinished = false;
            while (!isFinished) {
                const url = `https://api.chzzk.naver.com/service/v1/videos/${vodId}/chats?playerMessageTime=${nextMessageTime}`;
                const response = await fetch(url, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
                });
                if (!response.ok) throw new Error(response.status === 400 ? "NO_CHAT" : `Fetch failed: ${response.status}`);
                const data = await response.json();
                if (data.code !== 200 || !data.content) break;
                if (data.content.videoChats) allChats.push(...data.content.videoChats);
                nextMessageTime = data.content.nextPlayerMessageTime;
                if (!nextMessageTime) isFinished = true;
                await new Promise(r => setTimeout(r, 100));
            }
            fs.writeFileSync(fullPathJson, JSON.stringify({ data: allChats, meta: { vodId, streamerName, videoTitle, videoTimestamp, downloadDate: new Date().toISOString() } }, null, 2), "utf-8");
            return { success: true, filePath: fullPathJson, fileName: `${fileNameBase}.json`, folderPath, chatCount: allChats.length };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('convert-local-json-to-ass', async (event, folderPath, fileName, settings) => {
        try {
            let jsonFilePath = path.join(folderPath, fileName);
            if (!fs.existsSync(jsonFilePath)) {
                if (fs.existsSync(folderPath)) {
                    const match = fs.readdirSync(folderPath).find(f => f.endsWith(".json") && f.includes(fileName.replace(/\.json$/i, "").replace(/[<>:"/\\|?*]/g, "")));
                    if (match) jsonFilePath = path.join(folderPath, match);
                    else return { success: false, error: "JSON file not found" };
                } else return { success: false, error: "Folder not found" };
            }
            const json = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));
            const chats = Array.isArray(json) ? json : (json.data || json.content?.videoChats || []);
            let videoTimestamp = json.meta?.videoTimestamp;
            if (!videoTimestamp) { // Fallback to filename parsing if metadata missing
                const match = path.basename(jsonFilePath).match(/^\[(\d{4}-\d{2}-\d{2})\]/);
                if (match) videoTimestamp = new Date(match[1]).getTime();
            }
            if (!videoTimestamp && chats.length > 0) videoTimestamp = chats[0].messageTime;
            const assContent = generateAssFromChats(chats, settings, videoTimestamp || 0);
            const assFilePath = jsonFilePath.replace(/\.json$/i, ".ass");
            fs.writeFileSync(assFilePath, "\uFEFF" + assContent, "utf-8");
            return { success: true, filePath: assFilePath };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    if (app.isPackaged) {
        const outPath = path.join(__dirname, '../out/index.html');
        console.log(`[Main] Loading file: ${outPath}`);
        mainWindow.loadFile(outPath);
    } else {
        const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
        console.log(`[Main] Loading URL: ${startUrl}`);
        mainWindow.loadURL(startUrl);
    }

    if (!app.isPackaged) {
        // DevTools auto-opening removed to reduce terminal noise
        // You can open manually with Ctrl+Shift+I if needed
        // mainWindow.webContents.openDevTools();
    }

    // Security: Content Security Policy (CSP)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self' 'unsafe-inline' https://*.naver.com https://*.akamaized.net https://*.pstatic.net; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " + // unsafe-eval needed for some Next.js/React stuff in dev, consider tightening in prod
                    "img-src 'self' data: https:; " +
                    "connect-src 'self' https://*.naver.com;"
                ]
            }
        });
    });

    // Security: Securely open paths using shell.openPath instead of child_process
    ipcMain.handle('open-path', async (event, targetPath) => {
        try {
            // Basic path validation
            if (!targetPath || typeof targetPath !== 'string') return false;
            if (!fs.existsSync(targetPath)) return false;

            await shell.openPath(targetPath);
            return true;
        } catch (e) {
            console.error('Failed to open path:', e);
            return false;
        }
    });

    // Check for updates on startup
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.warn('[AutoUpdate] Initial check failed (likely network or missing release):', err.message);
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}


app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC Handler: Open Naver Login Window
ipcMain.handle('open-naver-login', async () => {
    return new Promise((resolve, reject) => {
        if (loginWindow) {
            loginWindow.focus();
            return;
        }

        loginWindow = new BrowserWindow({
            width: 500,
            height: 700,
            parent: mainWindow,
            modal: true,
            autoHideMenuBar: true, // Hide menu bar
            minimizable: false, // Prevent minimizing
            icon: require('electron').nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), // Transparent 1x1 pixel
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        loginWindow.setMenu(null); // Completely remove functionality of menu

        loginWindow.loadURL('https://nid.naver.com/nidlogin.login');

        // Monitor Cookies
        const checkCookies = async () => {
            if (!loginWindow) return; // Window closed
            try {
                const cookies = await session.defaultSession.cookies.get({ domain: '.naver.com' });
                const nidAut = cookies.find((c) => c.name === 'NID_AUT')?.value;
                const nidSes = cookies.find((c) => c.name === 'NID_SES')?.value;

                if (nidAut && nidSes) {
                    // Success!
                    loginWindow.close();
                    loginWindow = null;
                    resolve({ nidAut, nidSes });
                }
            } catch (error) {
                console.error('Cookie check failed:', error);
            }
        };

        // Poll for cookies every 1 second
        const interval = setInterval(() => {
            if (!loginWindow) {
                clearInterval(interval);
                resolve(null); // Closed without success
                return;
            }
            checkCookies();
        }, 1000);

        loginWindow.on('closed', () => {
            loginWindow = null;
            clearInterval(interval);
            resolve(null); // User closed window manually
        });
    });
});

// Naver Logout
ipcMain.handle('logout-naver', async () => {
    try {
        // Clear all cookies for naver.com domains
        const cookies = await session.defaultSession.cookies.get({ domain: 'naver.com' });
        for (const cookie of cookies) {
            let url = '';
            // get prefix, like https://www.
            url += cookie.secure ? 'https://' : 'http://';
            url += cookie.domain.charAt(0) === '.' ? 'www' : '';
            url += cookie.domain;
            url += cookie.path;

            await session.defaultSession.cookies.remove(url, cookie.name);
        }

        // Also clear storage data specifically for nid.naver.com just in case
        await session.defaultSession.clearStorageData({
            storages: ['cookies', 'localstorage'],
            origin: 'https://nid.naver.com'
        });
        await session.defaultSession.clearStorageData({
            storages: ['cookies', 'localstorage'],
            origin: 'https://naver.com'
        });
    } catch (error) {
        console.error('Logout failed:', error);
    }
});
// Open External Link (Hardened)
ipcMain.handle('open-external', async (event, url) => {
    try {
        const parsedUrl = new URL(url);
        // Only allow http: and https: protocols
        if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
            await shell.openExternal(url);
            return true;
        }
        console.warn('Blocked opening non-http(s) external link:', url);
        return false;
    } catch (e) {
        console.error('Failed to open external link:', e);
        return false;
    }
});

// Auto-update event listeners
autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', 'checking');
});

autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-status', 'available', info);
});

autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-status', 'not-available', info);
});

autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-status', 'error', err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-status', 'downloaded', info);
});

// Manual update check handler
ipcMain.handle('check-for-updates', async () => {
    try {
        return await autoUpdater.checkForUpdates();
    } catch (error) {
        console.error('Check for updates failed:', error);
        throw error;
    }
});

// Quit and install handler
ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
});

// Get App Version
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
