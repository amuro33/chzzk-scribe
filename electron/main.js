const { app, BrowserWindow, ipcMain, session, shell, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const checkDiskSpace = require('check-disk-space').default;

let mainWindow;
let loginWindow;

// function createWindow wrapped async
async function createWindow() {
    // Initialize electron-store dynamically
    const { default: Store } = await import('electron-store');
    const store = new Store();

    // Get stored window state
    const defaultWidth = 1440;
    const defaultHeight = 900;

    let bounds = { width: defaultWidth, height: defaultHeight };
    try {
        bounds = store.get('windowBounds', {
            width: defaultWidth,
            height: defaultHeight,
        });
    } catch (error) {
        console.error('Failed to load window state:', error);
        // bounds already set to default
    }

    mainWindow = new BrowserWindow({
        title: '치지직 스크라이브',
        ...bounds, // Restore position and size
        width: bounds.width || defaultWidth, // Fallback
        height: bounds.height || defaultHeight, // Fallback
        frame: false, // Frameless window for custom titlebar
        titleBarStyle: 'hidden', // For macOS
        trafficLightPosition: { x: -100, y: -100 }, // Hide macOS traffic lights
        autoHideMenuBar: true,
        backgroundColor: '#09090b', // Dark background to prevent white flash
        icon: path.join(__dirname, '../public/icon.png'), // Custom app icon
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: !app.isPackaged,
        },
    });

    // Save window state on resize and move
    const saveState = () => {
        if (!mainWindow) return;
        const bounds = mainWindow.getBounds();
        store.set('windowBounds', bounds);
    };

    mainWindow.on('resize', saveState);
    mainWindow.on('move', saveState);
    mainWindow.on('close', saveState);

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

    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(startUrl);

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
        autoUpdater.checkForUpdatesAndNotify();
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
