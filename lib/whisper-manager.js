const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { app } = require('electron');
const { createWriteStream } = require('fs');

const WHISPER_CONFIG = {
    engines: {
        "faster-whisper": {
            name: "Faster-Whisper (Python)",
            url: null,  // 내장 환경 사용
            description: "NVIDIA GPU 최적화 음성 인식 엔진입니다. (CPU도 지원)"
        }
    },
    models: {
        "faster-whisper": {
            baseUrl: "https://huggingface.co/Systran",
            // CTranslate2 모델 (Faster-Whisper 호환)
            files: {
                "tiny": {
                    repo: "faster-whisper-tiny",
                    files: ["config.json", "model.bin", "vocabulary.txt"]
                },
                "base": {
                    repo: "faster-whisper-base",
                    files: ["config.json", "model.bin", "vocabulary.txt"]
                },
                "small": {
                    repo: "faster-whisper-small",
                    files: ["config.json", "model.bin", "vocabulary.txt"]
                },
                "medium": {
                    repo: "faster-whisper-medium",
                    files: ["config.json", "model.bin", "vocabulary.txt"]
                },
                "large-v2": {
                    repo: "faster-whisper-large-v2",
                    files: ["config.json", "model.bin", "vocabulary.txt"]
                }
            },
            // 모델별 예상 크기 (MB)
            modelSizes: {
                "tiny": 75,
                "base": 145,
                "small": 488,
                "medium": 1540,
                "large-v2": 3100
            }
        }
    }
};

class WhisperManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.baseDir = path.join(this.userDataPath, 'whisper');
        
        this.enginesDir = path.join(this.baseDir, 'engines');
        this.modelsDir = path.join(this.baseDir, 'models');

        // 초기 디렉토리 생성
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir);
        if (!fs.existsSync(this.enginesDir)) fs.mkdirSync(this.enginesDir);
        if (!fs.existsSync(this.modelsDir)) fs.mkdirSync(this.modelsDir);
        
        // 다운로드 취소용 AbortController 저장소
        this.downloadControllers = new Map();
    }
    
    getEnginePath(engineId) {
        return path.join(this.enginesDir, engineId);
    }

    getModelPath(engineId, modelId) {
        if (engineId === "faster-whisper") {
            // CTranslate2 모델은 폴더로 저장됨
            return path.join(this.modelsDir, engineId, modelId);
        }
        return null; 
    }

    async getStatus(engineId) {
        let isEngineReady = false;
        
        // Check for embedded faster-whisper Python environment
        if (engineId === "faster-whisper") {
            const isDev = !app.isPackaged;
            const appRoot = isDev 
                ? path.join(__dirname, '..') 
                : (process.resourcesPath || path.join(__dirname, '..'));
            
            const pythonExe = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'python.exe');
            
            if (fs.existsSync(pythonExe)) {
                // Python 실행 파일이 있으면 faster-whisper, torch 패키지 설치 여부 확인
                const sitePackages = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'Lib', 'site-packages');
                const fasterWhisperPath = path.join(sitePackages, 'faster_whisper');
                const torchPath = path.join(sitePackages, 'torch');
                
                isEngineReady = fs.existsSync(fasterWhisperPath) && fs.existsSync(torchPath);
            }
        }
 
        const models = {};
        const modelConfig = WHISPER_CONFIG.models[engineId];
        
        if (modelConfig && modelConfig.files) {
            for (const [mid, modelInfo] of Object.entries(modelConfig.files)) {
                let modelPath, exists;
                
                if (engineId === "faster-whisper") {
                    // CTranslate2 모델은 폴더로 저장
                    modelPath = path.join(this.modelsDir, engineId, mid);
                    exists = fs.existsSync(modelPath) && fs.existsSync(path.join(modelPath, 'model.bin'));
                } else {
                    modelPath = path.join(this.modelsDir, engineId, modelInfo);
                    exists = fs.existsSync(modelPath);
                }
                
                let sizeStr = "Unknown";
                let sizeMB = 0;
                if (exists) {
                    try {
                        if (engineId === "faster-whisper") {
                            // 폴더 전체 크기 계산
                            const files = fs.readdirSync(modelPath);
                            let totalSize = 0;
                            files.forEach(file => {
                                const filePath = path.join(modelPath, file);
                                const stats = fs.statSync(filePath);
                                totalSize += stats.size;
                            });
                            sizeMB = totalSize / (1024 * 1024);
                            sizeStr = sizeMB.toFixed(0) + " MB";
                        } else {
                            const stats = fs.statSync(modelPath);
                            sizeMB = stats.size / (1024 * 1024);
                            sizeStr = sizeMB.toFixed(0) + " MB";
                        }
                    } catch (e) {}
                } else {
                    // 예상 크기 표시
                    sizeMB = modelConfig.modelSizes?.[mid] || 0;
                    sizeStr = sizeMB > 0 ? `~${sizeMB} MB` : "Unknown";
                }
                
                models[mid] = {
                    downloaded: exists,
                    localPath: exists ? modelPath : null,
                    size: sizeStr,
                    sizeMB: sizeMB
                };
            }
        }

        return {
            engineId,
            isEngineReady,
            models
        };
    }

    async downloadEngine(engineId, onProgress) {
        // Whisper.cpp engine is embedded. No download available.
        throw new Error("Engine is embedded in the application. No download required.");
        // Other engines not supported
        throw new Error("Engine download not supported for: " + engineId);
    }

    _handleDownloadStream(res, destPath, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);
            const total = parseInt(res.headers['content-length'] || "0", 10);
            let cur = 0;

            res.pipe(file);

            res.on('data', (chunk) => {
                cur += chunk.length;
                if (onProgress && total) {
                    const percent = Math.round((cur / total) * 100);
                    onProgress({ status: 'downloading', progress: percent, downloadedBytes: cur, totalBytes: total });
                }
            });

            file.on('finish', () => {
                file.close(resolve);
            });

            file.on('error', (err) => {
                fs.unlink(destPath, () => reject(err));
            });
        });
    }

    async downloadModel(engineId, modelId, onProgress, onDownloadedBytes) {
        const config = WHISPER_CONFIG.models[engineId];
        if (!config || !config.files[modelId]) throw new Error(`Unknown model: ${modelId}`);

        const modelInfo = config.files[modelId];
        const engineModelDir = path.join(this.modelsDir, engineId);
        const modelDir = path.join(engineModelDir, modelId);
        
        if (!fs.existsSync(engineModelDir)) fs.mkdirSync(engineModelDir, { recursive: true });
        if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

        // 다운로드 ID 생성
        const downloadId = `${engineId}:${modelId}`;
        const controller = new AbortController();
        this.downloadControllers.set(downloadId, controller);

        console.log(`[WhisperManager] Downloading Faster-Whisper model '${modelId}' to ${modelDir}`);

        try {
            // CTranslate2 모델 다운로드 (HuggingFace에서 여러 파일)
            const baseUrl = `${config.baseUrl}/${modelInfo.repo}/resolve/main`;
            const apiUrl = `https://huggingface.co/api/models/Systran/${modelInfo.repo}`;
            const files = modelInfo.files;
            
            // HuggingFace API에서 파일 해시 정보 가져오기
            let fileHashes = {};
            try {
                console.log(`[WhisperManager] Fetching file hashes from HuggingFace API...`);
                const hashInfo = await this.fetchHuggingFaceHashes(modelInfo.repo);
                fileHashes = hashInfo;
            } catch (hashError) {
                console.warn(`[WhisperManager] Could not fetch hashes: ${hashError.message}. Downloading without verification.`);
            }
            
            let totalBytes = 0;
            const fileCount = files.length;
            
            for (let i = 0; i < fileCount; i++) {
                const fileName = files[i];
                const fileUrl = `${baseUrl}/${fileName}`;
                const filePath = path.join(modelDir, fileName);
                const expectedHash = fileHashes[fileName];
                
                console.log(`[WhisperManager] Downloading ${fileName} (${i+1}/${fileCount})...`);
                if (expectedHash) {
                    console.log(`[WhisperManager] Expected SHA256: ${expectedHash}`);
                }
                
                try {
                    await this.downloadFileWithRetry(fileUrl, filePath, (ratio, chunkSize) => {
                        // 전체 파일에 대한 진행률 계산
                        const fileProgress = (i + ratio) / fileCount;
                        if (onProgress) onProgress(fileProgress);
                        if (chunkSize && onDownloadedBytes) {
                            totalBytes += chunkSize;
                            onDownloadedBytes(totalBytes);
                        }
                    }, 3, controller.signal, expectedHash);
                    
                    console.log(`[WhisperManager] Downloaded ${fileName}`);
                } catch (error) {
                    // vocabulary/tokenizer 파일은 선택적이므로 404 에러는 무시
                    if ((fileName.includes('vocabulary') || fileName.includes('tokenizer')) && error.message.includes('HTTP 404')) {
                        console.log(`[WhisperManager] Skipping ${fileName} (not available for this model)`);
                        continue;
                    }
                    throw error;
                }
            }

            console.log(`[WhisperManager] Model downloaded successfully: ${modelDir}`);
            this.downloadControllers.delete(downloadId);
            return modelDir;
        } catch (error) {
            this.downloadControllers.delete(downloadId);
            // 실패한 부분 파일 정리
            if (fs.existsSync(modelDir)) {
                try {
                    const files = fs.readdirSync(modelDir);
                    files.forEach(file => {
                        fs.unlinkSync(path.join(modelDir, file));
                    });
                    fs.rmdirSync(modelDir);
                } catch (e) {
                    console.error(`[WhisperManager] Failed to cleanup partial model files:`, e);
                }
            }
            throw error;
        }
    }

    cancelDownload(engineId, modelId) {
        const downloadId = `${engineId}:${modelId}`;
        const controller = this.downloadControllers.get(downloadId);
        if (controller) {
            console.log(`[WhisperManager] Cancelling download: ${downloadId}`);
            controller.abort();
            this.downloadControllers.delete(downloadId);
            return true;
        }
        return false;
    }

    async deleteModel(engineId, modelId) {
        const config = WHISPER_CONFIG.models[engineId];
        if (!config) return;
        
        if (engineId === "faster-whisper") {
            // CTranslate2 모델은 폴더 전체 삭제
            const modelDir = path.join(this.modelsDir, engineId, modelId);
            if (fs.existsSync(modelDir)) {
                console.log(`[WhisperManager] Deleting model directory: ${modelDir}`);
                const files = fs.readdirSync(modelDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(modelDir, file));
                });
                fs.rmdirSync(modelDir);
            }
        }
    }

    async downloadFileWithRetry(url, destPath, onProgress, maxRetries = 3, signal) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            if (signal?.aborted) {
                throw new Error('Download cancelled');
            }
            
            try {
                console.log(`[WhisperManager] Download attempt ${attempt}/${maxRetries}: ${path.basename(destPath)}`);
                await this.downloadFile(url, destPath, onProgress, signal);
                return; // 성공
            } catch (error) {
                if (signal?.aborted) {
                    throw new Error('Download cancelled');
                }
                
                lastError = error;
                console.error(`[WhisperManager] Attempt ${attempt} failed: ${error.message}`);
                
                // 실패 시 파일 정리
                if (fs.existsSync(destPath)) {
                    try {
                        fs.unlinkSync(destPath);
                    } catch (e) {
                        // 무시
                    }
                }
                
                // 마지막 시도가 아니면 대기 후 재시도
                if (attempt < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // 지수 백오프 (최대 5초)
                    console.log(`[WhisperManager] Retrying in ${delay}ms...`);
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(resolve, delay);
                        // AbortSignal 이벤트 리스너 추가 시 once: true로 자동 제거
                        const abortHandler = () => {
                            clearTimeout(timeout);
                            reject(new Error('Download cancelled'));
                        };
                        if (signal) {
                            signal.addEventListener('abort', abortHandler, { once: true });
                        }
                    });
                }
            }
        }
        
        throw lastError;
    }

    async downloadFile(url, destPath, onProgress, signal, expectedHash) {
        return new Promise((resolve, reject) => {
            // URL에서 파일명만 추출하여 로그 출력 (리다이렉트 URL 노출 방지)
            const urlObj = new URL(url);
            const fileName = path.basename(urlObj.pathname);
            console.log(`[WhisperManager] Start downloading: ${fileName}`);
            
            const fileStream = createWriteStream(destPath);
            let downloadedBytes = 0;

            const request = https.get(url, { 
                headers: { 'User-Agent': 'ChzzkScribe/1.0' },
                signal 
            }, (response) => {
                // Redirect handling (301, 302, 303, 307, 308)
                if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                    fileStream.close();
                    if (response.headers.location) {
                        const nextUrl = new URL(response.headers.location, url).href; // Relative URL 대응
                        const nextUrlObj = new URL(nextUrl);
                        const nextFileName = path.basename(nextUrlObj.pathname);
                        console.log(`[WhisperManager] Redirecting (${response.statusCode}) to CDN: ${nextFileName}`);

                        // 리다이렉트 시 x-linked-etag 헤더 확인하여 해시 정보 획득
                        let nextExpectedHash = expectedHash;
                        if (!nextExpectedHash && response.headers['x-linked-etag']) {
                            nextExpectedHash = response.headers['x-linked-etag'].replace(/"/g, '');
                            console.log(`[WhisperManager] Found hash from header: ${nextExpectedHash}`);
                        }

                        return this.downloadFile(nextUrl, destPath, onProgress, signal, nextExpectedHash)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        return reject(new Error("Redirect location missing"));
                    }
                }

                if (response.statusCode !== 200) {
                    fileStream.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath); // Sync delete
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }

                const totalLength = parseInt(response.headers['content-length'], 10) || 0;
                let received = 0;

                response.on('data', (chunk) => {
                    received += chunk.length;
                    downloadedBytes += chunk.length;
                    
                    fileStream.write(chunk);
                    
                    if (onProgress && totalLength > 0) {
                        onProgress(received / totalLength, chunk.length);
                    }
                });

                response.on('end', () => {
                    fileStream.end();
                    fileStream.on('finish', () => {
                        fs.stat(destPath, (err, stats) => {
                            if (err) return reject(err);
                            console.log(`[WhisperManager] Download complete: ${destPath} (${stats.size} bytes)`);
                            
                            // 100KB 미만이고 model.bin 이면 에러로 간주 (HTML 등)
                            if (destPath.endsWith('model.bin') && stats.size < 100 * 1024) {
                                return reject(new Error(`File too small (${stats.size} bytes). Likely invalid download.`));
                            }

                            resolve();
                        });
                    });
                });

                response.on('error', (err) => {
                    fileStream.close();
                    if (fs.existsSync(destPath)) {
                        try { fs.unlinkSync(destPath); } catch (e) {} 
                    }
                    console.error(`[WhisperManager] Stream error: ${err.message}`);
                    reject(err);
                });
            });

            request.on('error', (err) => {
                fileStream.close();
                if (fs.existsSync(destPath)) {
                    try { fs.unlinkSync(destPath); } catch (e) {} 
                }
                console.error(`[WhisperManager] Request error: ${err.message}`);
                reject(err);
            });
            
            if (signal) {
                signal.addEventListener('abort', () => {
                    fileStream.close();
                    if (fs.existsSync(destPath)) {
                        try { fs.unlinkSync(destPath); } catch (e) {} 
                    }
                    request.destroy();
                    reject(new Error('Download cancelled'));
                }, { once: true });
            }
        });
    }

    async fetchHuggingFaceHashes(repoName) {
        return new Promise((resolve, reject) => {
            const apiUrl = `https://huggingface.co/api/models/Systran/${repoName}/tree/main`;
            
            https.get(apiUrl, { headers: { 'User-Agent': 'ChzzkScribe/1.0' } }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    if (response.headers.location) {
                        return this.fetchHuggingFaceHashes(repoName).then(resolve).catch(reject);
                    }
                }
                
                if (response.statusCode !== 200) {
                    return reject(new Error(`API returned ${response.statusCode}`));
                }
                
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const files = JSON.parse(data);
                        const hashes = {};
                        
                        // 파일 목록에서 SHA256 추출 (LFS oid 사용)
                        if (Array.isArray(files)) {
                            files.forEach(file => {
                                if (file.type === 'file' && file.lfs) {
                                    // HuggingFace LFS는 oid를 SHA256으로 사용
                                    // oid 형식: "sha256:abc123..." 또는 직접 해시값
                                    let hash = null;
                                    if (file.lfs.oid) {
                                        hash = file.lfs.oid.replace('sha256:', '');
                                    } else if (file.lfs.sha256) {
                                        hash = file.lfs.sha256;
                                    }
                                    
                                    if (hash && hash.length === 64) {
                                        hashes[file.path] = hash;
                                        console.log(`[WhisperManager] File: ${file.path}, Hash: ${hash}`);
                                    }
                                }
                            });
                        }
                        
                        console.log(`[WhisperManager] Found ${Object.keys(hashes).length} file hashes`);
                        resolve(hashes);
                    } catch (err) {
                        reject(new Error(`Failed to parse API response: ${err.message}`));
                    }
                });
            }).on('error', reject);
        });
    }

    async detectNvidiaGPU(pythonExe) {
        // Python을 통해 NVIDIA GPU 감지
        const { spawn } = require('child_process');
        
        return new Promise((resolve) => {
            const child = spawn(pythonExe, [
                '-c',
                'import subprocess; subprocess.run(["nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); print("GPU_FOUND")'
            ]);

            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', (code) => {
                // nvidia-smi가 성공하고 "GPU_FOUND" 출력되면 GPU 있음
                resolve(code === 0 && output.includes('GPU_FOUND'));
            });

            child.on('error', () => {
                resolve(false);
            });

            // 타임아웃 설정 (2초)
            setTimeout(() => {
                child.kill();
                resolve(false);
            }, 2000);
        });
    }

    async getEngineStatus(engineId) {
        if (engineId !== "faster-whisper") {
            return { installed: false, error: "Unknown engine" };
        }

        const isDev = !app.isPackaged;
        const appRoot = isDev 
            ? path.join(__dirname, '..') 
            : (process.resourcesPath || path.join(__dirname, '..'));
        
        const pythonExe = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'python.exe');
        
        // Python 실행 파일 존재 확인
        if (!fs.existsSync(pythonExe)) {
            return { installed: false, pythonPath: pythonExe };
        }

        // faster-whisper 패키지 설치 확인
        const sitePackages = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'Lib', 'site-packages');
        const fasterWhisperPath = path.join(sitePackages, 'faster_whisper');
        const torchPath = path.join(sitePackages, 'torch');

        const hasFasterWhisper = fs.existsSync(fasterWhisperPath);
        const hasTorch = fs.existsSync(torchPath);

        return {
            installed: hasFasterWhisper && hasTorch,
            pythonPath: pythonExe,
            sitePackages: sitePackages,
            hasFasterWhisper,
            hasTorch
        };
    }

    async installEngine(engineId, onProgress) {
        if (engineId !== "faster-whisper") {
            throw new Error("Unknown engine");
        }

        const isDev = !app.isPackaged;
        let appRoot;
        
        if (isDev) {
            appRoot = path.join(__dirname, '..');
        } else {
            // 빌드된 환경: app.asar의 상위가 resources 폴더
            const appPath = app.getAppPath();
            if (appPath.includes('app.asar')) {
                // resources/app.asar -> resources
                appRoot = path.dirname(appPath);
            } else {
                appRoot = appPath;
            }
        }
        
        const pythonExe = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'python.exe');
        
        console.log(`[WhisperManager] Install - App root: ${appRoot}`);
        console.log(`[WhisperManager] Install - Python path: ${pythonExe}`);
        console.log(`[WhisperManager] Install - Exists: ${fs.existsSync(pythonExe)}`);
        
        if (!fs.existsSync(pythonExe)) {
            throw new Error(`Python 환경을 찾을 수 없습니다.\n\n경로: ${pythonExe}\n\nPython 환경이 포함된 포터블 버전을 사용하거나\nsetup-python-env.js를 실행해주세요.`);
        }

        // GPU 감지
        const hasNvidiaGPU = await this.detectNvidiaGPU(pythonExe);
        console.log(`[WhisperManager] NVIDIA GPU detected: ${hasNvidiaGPU}`);

        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            let args;
            if (hasNvidiaGPU) {
                // NVIDIA GPU 있음: CUDA 버전 torch (~4GB)
                args = [
                    '-m', 'pip', 'install',
                    'faster-whisper',
                    'torch',
                    '--index-url', 'https://download.pytorch.org/whl/cu118'
                ];
            } else {
                // GPU 없음: CPU 전용 torch (~200MB)
                args = [
                    '-m', 'pip', 'install',
                    'faster-whisper',
                    'torch',
                    '--index-url', 'https://download.pytorch.org/whl/cpu'
                ];
            }

            const child = spawn(pythonExe, args, {
                cwd: appRoot,
                env: process.env
            });

            let output = '';
            let currentProgress = 0;

            child.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log('[Engine Install]', text);

                // pip 진행률 파싱 시도
                // "Downloading ... (190.8 MB)" 등의 메시지에서 추정
                if (text.includes('Downloading')) {
                    currentProgress = Math.min(currentProgress + 5, 90);
                    if (onProgress) onProgress(currentProgress / 100);
                } else if (text.includes('Installing')) {
                    currentProgress = Math.min(currentProgress + 2, 95);
                    if (onProgress) onProgress(currentProgress / 100);
                }
            });

            child.stderr.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log('[Engine Install stderr]', text);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    if (onProgress) onProgress(1.0);
                    resolve({ success: true, output });
                } else {
                    reject(new Error(`Installation failed with code ${code}: ${output}`));
                }
            });

            child.on('error', (err) => {
                reject(err);
            });
        });
    }
}

module.exports = { WhisperManager };
