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
        let engineType = null; // 'gpu' or 'cpu'
        
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
                
                const hasFasterWhisper = fs.existsSync(fasterWhisperPath);
                const hasTorch = fs.existsSync(torchPath);
                
                // GPU가 있는지 확인
                let needsGpuTorch = false;
                if (hasTorch) {
                    try {
                        // torch 버전 확인 (CPU vs CUDA)
                        const { execSync } = require('child_process');
                        const torchVersion = execSync(`"${pythonExe}" -c "import torch; print(torch.__version__)"`, { 
                            encoding: 'utf-8',
                            windowsHide: true,
                            timeout: 5000 // 5초 타임아웃
                        }).trim();
                        const isCpuVersion = torchVersion.includes('+cpu');
                        
                        // GPU 타입 설정
                        engineType = isCpuVersion ? 'cpu' : 'gpu';
                        
                        if (isCpuVersion) {
                            // GPU가 있는지 확인 (10초 타임아웃)
                            const hasGpu = await this.detectNvidiaGPU(pythonExe, 10000);
                            if (hasGpu) {
                                console.log('[WhisperManager] GPU가 있지만 CPU 버전 PyTorch가 설치되어 있습니다.');
                                needsGpuTorch = true;
                            }
                        }
                    } catch (e) {
                        console.warn('[WhisperManager] PyTorch 버전 확인 실패:', e.message);
                        // PyTorch import 실패 시 손상된 것으로 간주하고 재설치 필요
                        if (e.message.includes('Error loading') || e.message.includes('DLL') || e.message.includes('OSError')) {
                            console.error('[WhisperManager] PyTorch가 손상되었습니다. 재설치가 필요합니다.');
                            isEngineReady = false;
                            return {
                                engineId,
                                isEngineReady: false,
                                engineType: null,
                                corrupted: true,
                                corruptedMessage: 'PyTorch 라이브러리가 손상되었습니다. 엔진을 삭제 후 재설치해주세요.',
                                models: {}
                            };
                        }
                    }
                }
                
                isEngineReady = hasFasterWhisper && hasTorch && !needsGpuTorch;
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
            engineType,  // 'gpu' or 'cpu' or null
            corrupted: false,
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

    async detectNvidiaGPU(pythonExe, timeout = 2000) {
        // NVIDIA GPU 감지 강화: nvidia-smi + PyTorch CUDA 확인
        const { spawn } = require('child_process');
        
        return new Promise((resolve) => {
            // 먼저 nvidia-smi 확인, 그 다음 PyTorch에서 CUDA 사용 가능한지 확인
            const child = spawn(pythonExe, [
                '-c',
                `import subprocess
import sys
try:
    # 1. nvidia-smi 확인
    result = subprocess.run(["nvidia-smi"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    if result.returncode != 0:
        print("NO_GPU")
        sys.exit(1)
    
    # 2. PyTorch CUDA 확인
    try:
        import torch
        if torch.cuda.is_available():
            print(f"GPU_FOUND:{torch.cuda.get_device_name(0)}")
        else:
            print("NO_CUDA")
    except ImportError:
        # PyTorch가 없으면 nvidia-smi만 있어도 GPU로 간주
        print("GPU_FOUND:NVIDIA")
except Exception as e:
    print("NO_GPU")
`
            ], {
                windowsHide: true
            });

            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', (code) => {
                const hasGpu = output.includes('GPU_FOUND');
                if (hasGpu) {
                    console.log('[WhisperManager] GPU 감지:', output.trim());
                }
                resolve(hasGpu);
            });

            child.on('error', () => {
                resolve(false);
            });

            // 타임아웃 설정
            setTimeout(() => {
                child.kill();
                resolve(false);
            }, timeout);
        });
    }

    async deleteEngine(engineId) {
        if (engineId !== "faster-whisper") {
            throw new Error("Unknown engine");
        }

        const isDev = !app.isPackaged;
        const appRoot = isDev 
            ? path.join(__dirname, '..') 
            : (process.resourcesPath || path.join(__dirname, '..'));
        
        const pythonPath = path.join(appRoot, 'bin', 'faster-whisper-env', 'python');
        const sitePackages = path.join(pythonPath, 'Lib', 'site-packages');
        
        console.log('[WhisperManager] 엔진 삭제 시작...');
        console.log('  - PyTorch 삭제:', path.join(sitePackages, 'torch'));
        console.log('  - Faster-Whisper 삭제:', path.join(sitePackages, 'faster_whisper'));
        
        // 재귀적으로 폴더 삭제하는 헬퍼 함수 (Windows 호환)
        const deleteFolderRecursive = (folderPath) => {
            if (fs.existsSync(folderPath)) {
                try {
                    // maxRetries와 retryDelay 옵션 추가 (Windows에서 파일 잠금 문제 해결)
                    fs.rmSync(folderPath, { 
                        recursive: true, 
                        force: true,
                        maxRetries: 5,
                        retryDelay: 100
                    });
                    return true;
                } catch (error) {
                    // rmSync 실패 시 수동으로 재귀 삭제 시도
                    console.warn(`  ! rmSync 실패, 수동 삭제 시도: ${folderPath}`);
                    try {
                        const items = fs.readdirSync(folderPath);
                        for (const item of items) {
                            const itemPath = path.join(folderPath, item);
                            const stat = fs.statSync(itemPath);
                            if (stat.isDirectory()) {
                                deleteFolderRecursive(itemPath);
                            } else {
                                // 파일 삭제 시 재시도
                                let retries = 3;
                                while (retries > 0) {
                                    try {
                                        fs.unlinkSync(itemPath);
                                        break;
                                    } catch (e) {
                                        retries--;
                                        if (retries === 0) throw e;
                                        // 100ms 대기 후 재시도
                                        const start = Date.now();
                                        while (Date.now() - start < 100) {}
                                    }
                                }
                            }
                        }
                        fs.rmdirSync(folderPath);
                        return true;
                    } catch (manualError) {
                        console.error(`  ! 수동 삭제도 실패: ${folderPath}`, manualError.message);
                        return false;
                    }
                }
            }
            return true;
        };
        
        try {
            let allSuccess = true;
            
            // torch 폴더 삭제
            const torchPath = path.join(sitePackages, 'torch');
            if (fs.existsSync(torchPath)) {
                console.log('  - PyTorch 삭제 중...');
                if (deleteFolderRecursive(torchPath)) {
                    console.log('  ✓ PyTorch 삭제 완료');
                } else {
                    console.warn('  ! PyTorch 삭제 부분 실패');
                    allSuccess = false;
                }
            }
            
            // faster-whisper 폴더 삭제
            const fwPath = path.join(sitePackages, 'faster_whisper');
            if (fs.existsSync(fwPath)) {
                console.log('  - Faster-Whisper 삭제 중...');
                if (deleteFolderRecursive(fwPath)) {
                    console.log('  ✓ Faster-Whisper 삭제 완료');
                } else {
                    console.warn('  ! Faster-Whisper 삭제 부분 실패');
                    allSuccess = false;
                }
            }
            
            // 관련 dist-info 디렉토리들 삭제
            const files = fs.readdirSync(sitePackages);
            for (const file of files) {
                if (file.includes('torch') || file.includes('faster_whisper') || file.includes('ctranslate2')) {
                    const fullPath = path.join(sitePackages, file);
                    console.log(`  - ${file} 삭제 중...`);
                    if (deleteFolderRecursive(fullPath)) {
                        console.log(`  ✓ ${file} 삭제 완료`);
                    } else {
                        console.warn(`  ! ${file} 삭제 실패`);
                    }
                }
            }
            
            if (allSuccess) {
                console.log('[WhisperManager] ✅ 엔진 삭제 완료');
            } else {
                console.log('[WhisperManager] ⚠️ 엔진 삭제 일부 완료 (일부 파일이 사용 중일 수 있음)');
            }
            return { success: true };
        } catch (error) {
            console.error('[WhisperManager] 엔진 삭제 실패:', error);
            throw error;
        }
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

    /**
     * Python 패키지 자동 설치 (백그라운드)
     */
    async installPythonPackages(pythonExe, needTorch, needFasterWhisper) {
        const { spawn, execSync } = require('child_process');
        
        try {
            console.log('[WhisperManager] 자동 설치 시작...');
            console.log(`  - PyTorch: ${needTorch ? '설치/업그레이드 필요' : '이미 설치됨'}`);
            console.log(`  - Faster-Whisper: ${needFasterWhisper ? '설치 필요' : '이미 설치됨'}`);
            
            // GPU 감지
            const hasNvidiaGPU = await this.detectNvidiaGPU(pythonExe);
            console.log(`  - NVIDIA GPU: ${hasNvidiaGPU ? '감지됨 (CUDA 버전 설치)' : '없음 (CPU 버전 설치)'}`);
            
            if (needTorch) {
                if (hasNvidiaGPU) {
                    // 기존 CPU 버전 제거
                    try {
                        console.log('[WhisperManager] 기존 PyTorch 제거 중...');
                        execSync(`"${pythonExe}" -m pip uninstall -y torch`, { 
                            stdio: 'pipe',
                            windowsHide: true
                        });
                    } catch (e) {
                        // 이미 없으면 무시
                    }
                    
                    // GPU 버전 설치
                    return new Promise((resolve, reject) => {
                        console.log('[WhisperManager] PyTorch CUDA 버전 설치 중... (시간이 걸릴 수 있습니다)');
                        const args = ['-m', 'pip', 'install', 'torch', '--index-url', 'https://download.pytorch.org/whl/cu121'];
                        const child = spawn(pythonExe, args, { 
                            stdio: 'pipe',
                            windowsHide: true
                        });
                        
                        let stdout = '';
                        let stderr = '';
                        
                        child.stdout.on('data', (data) => {
                            stdout += data.toString();
                            console.log('[PyTorch Install]', data.toString().trim());
                        });
                        
                        child.stderr.on('data', (data) => {
                            stderr += data.toString();
                            console.error('[PyTorch Install Error]', data.toString().trim());
                        });
                        
                        child.on('close', (code) => {
                            if (code === 0) {
                                console.log('[WhisperManager] ✅ PyTorch CUDA 버전 설치 완료');
                                if (needFasterWhisper) {
                                    console.log('[WhisperManager] Faster-Whisper 설치 중...');
                                    const child2 = spawn(pythonExe, ['-m', 'pip', 'install', 'faster-whisper'], { 
                                        stdio: 'pipe',
                                        windowsHide: true
                                    });
                                    
                                    let stdout2 = '';
                                    let stderr2 = '';
                                    
                                    child2.stdout.on('data', (data) => {
                                        stdout2 += data.toString();
                                        console.log('[Faster-Whisper Install]', data.toString().trim());
                                    });
                                    
                                    child2.stderr.on('data', (data) => {
                                        stderr2 += data.toString();
                                        console.error('[Faster-Whisper Install Error]', data.toString().trim());
                                    });
                                    
                                    child2.on('close', (code2) => {
                                        if (code2 === 0) {
                                            console.log('[WhisperManager] ✅ Faster-Whisper 설치 완료');
                                            resolve();
                                        } else {
                                            const errorMsg = `Faster-Whisper 설치 실패 (exit code: ${code2})\n\n${stderr2 || stdout2}`;
                                            console.error(errorMsg);
                                            reject(new Error(errorMsg));
                                        }
                                    });
                                } else {
                                    resolve();
                                }
                            } else {
                                const errorMsg = `PyTorch 설치 실패 (exit code: ${code})\n\n${stderr || stdout}`;
                                console.error(errorMsg);
                                reject(new Error(errorMsg));
                            }
                        });
                    });
                } else {
                    // CPU 버전
                    return new Promise((resolve, reject) => {
                        console.log('[WhisperManager] PyTorch CPU 버전 설치 중...');
                        const packages = needFasterWhisper ? ['torch', 'faster-whisper'] : ['torch'];
                        const args = ['-m', 'pip', 'install', ...packages];
                        const child = spawn(pythonExe, args, { 
                            stdio: 'pipe',
                            windowsHide: true
                        });
                        
                        let stdout = '';
                        let stderr = '';
                        
                        child.stdout.on('data', (data) => {
                            stdout += data.toString();
                            console.log('[Package Install]', data.toString().trim());
                        });
                        
                        child.stderr.on('data', (data) => {
                            stderr += data.toString();
                            console.error('[Package Install Error]', data.toString().trim());
                        });
                        
                        child.on('close', (code) => {
                            if (code === 0) {
                                console.log('[WhisperManager] ✅ 패키지 설치 완료');
                                resolve();
                            } else {
                                const errorMsg = `패키지 설치 실패 (exit code: ${code})\n\n${stderr || stdout}`;
                                console.error(errorMsg);
                                reject(new Error(errorMsg));
                            }
                        });
                    });
                }
            } else if (needFasterWhisper) {
                return new Promise((resolve, reject) => {
                    console.log('[WhisperManager] Faster-Whisper 설치 중...');
                    const child = spawn(pythonExe, ['-m', 'pip', 'install', 'faster-whisper'], { 
                        stdio: 'pipe',
                        windowsHide: true
                    });
                    
                    let stdout = '';
                    let stderr = '';
                    
                    child.stdout.on('data', (data) => {
                        stdout += data.toString();
                        console.log('[Faster-Whisper Install]', data.toString().trim());
                    });
                    
                    child.stderr.on('data', (data) => {
                        stderr += data.toString();
                        console.error('[Faster-Whisper Install Error]', data.toString().trim());
                    });
                    
                    child.on('close', (code) => {
                        if (code === 0) {
                            console.log('[WhisperManager] ✅ Faster-Whisper 설치 완료');
                            resolve();
                        } else {
                            const errorMsg = `Faster-Whisper 설치 실패 (exit code: ${code})\n\n${stderr || stdout}`;
                            console.error(errorMsg);
                            reject(new Error(errorMsg));
                        }
                    });
                });
            }
            
            console.log('[WhisperManager] 설치할 패키지 없음');
        } catch (error) {
            console.error('[WhisperManager] 자동 설치 실패:', error);
            // 실패해도 무시 (사용자가 수동으로 할 수 있음)
        }
    }

    async installEngine(engineId, onProgress, useGpu = true) {
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
        console.log(`[WhisperManager] Install - Use GPU: ${useGpu}`);
        
        if (!fs.existsSync(pythonExe)) {
            throw new Error(`Python 환경을 찾을 수 없습니다.\n\n경로: ${pythonExe}\n\nPython 환경이 포함된 포터블 버전을 사용하거나\nsetup-python-env.js를 실행해주세요.`);
        }

        // 설치 전 기존 패키지 완전 제거 (손상된 파일 방지)
        console.log('[WhisperManager] 기존 패키지 완전 제거 중...');
        const sitePackages = path.join(appRoot, 'bin', 'faster-whisper-env', 'python', 'Lib', 'site-packages');
        
        try {
            // pip uninstall로 먼저 시도
            const { execSync } = require('child_process');
            try {
                console.log('  - pip uninstall torch...');
                execSync(`"${pythonExe}" -m pip uninstall -y torch`, { 
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 30000
                });
            } catch (e) {
                console.log('  - torch uninstall 스킵 (이미 없음)');
            }
            
            try {
                console.log('  - pip uninstall faster-whisper...');
                execSync(`"${pythonExe}" -m pip uninstall -y faster-whisper`, { 
                    stdio: 'pipe',
                    windowsHide: true,
                    timeout: 30000
                });
            } catch (e) {
                console.log('  - faster-whisper uninstall 스킵 (이미 없음)');
            }
            
            // 수동으로 폴더 삭제 (잔여 파일 제거)
            const foldersToDelete = ['torch', 'faster_whisper', 'ctranslate2'];
            for (const folder of foldersToDelete) {
                const folderPath = path.join(sitePackages, folder);
                if (fs.existsSync(folderPath)) {
                    console.log(`  - 수동 삭제: ${folder}`);
                    try {
                        fs.rmSync(folderPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
                    } catch (e) {
                        console.warn(`  ! ${folder} 삭제 실패 (무시하고 계속):`, e.message);
                    }
                }
            }
            
            // dist-info 디렉토리들도 삭제
            if (fs.existsSync(sitePackages)) {
                const files = fs.readdirSync(sitePackages);
                for (const file of files) {
                    if (file.includes('torch') || file.includes('faster_whisper') || file.includes('ctranslate2')) {
                        const fullPath = path.join(sitePackages, file);
                        try {
                            fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
                            console.log(`  - 삭제: ${file}`);
                        } catch (e) {
                            console.warn(`  ! ${file} 삭제 실패 (무시하고 계속)`);
                        }
                    }
                }
            }
            
            console.log('[WhisperManager] 기존 패키지 제거 완료');
        } catch (error) {
            console.warn('[WhisperManager] 기존 패키지 제거 중 일부 오류 (무시하고 계속):', error.message);
        }

        const { spawn } = require('child_process');
        
        return new Promise((resolve, reject) => {
            // Step 1: torch 설치
            const installTorch = () => {
                return new Promise((resolveTorch, rejectTorch) => {
                    let torchArgs;
                    if (useGpu) {
                        console.log('[WhisperManager] Step 1/2: PyTorch 최신 버전 (CUDA 12.9) 설치 중...');
                        if (onProgress) onProgress(0.05, 'PyTorch 최신 버전 (CUDA 12.9) 다운로드 중...');
                        torchArgs = [
                            '-m', 'pip', 'install',
                            '--force-reinstall',
                            '--no-cache-dir',
                            '--upgrade',  // 최신 버전으로 업그레이드
                            'torch',
                            '--index-url', 'https://download.pytorch.org/whl/cu129'  // CUDA 12.9 버전 (최신)
                        ];
                    } else {
                        console.log('[WhisperManager] Step 1/2: PyTorch CPU 버전 설치 중...');
                        if (onProgress) onProgress(0.05, 'PyTorch CPU 버전 다운로드 중...');
                        torchArgs = [
                            '-m', 'pip', 'install',
                            '--force-reinstall',
                            '--no-cache-dir',
                            'torch',
                            '--index-url', 'https://download.pytorch.org/whl/cpu'  // CPU 버전 강제
                        ];
                    }

                    const torchChild = spawn(pythonExe, torchArgs, {
                        cwd: appRoot,
                        env: process.env
                    });

                    let torchOutput = '';
                    let currentProgress = 5;

                    torchChild.stdout.on('data', (data) => {
                        const text = data.toString();
                        torchOutput += text;
                        console.log('[Torch Install]', text);

                        const lines = text.split('\n').filter(line => line.trim());
                        for (const line of lines) {
                            let message = '';
                            
                            if (line.includes('Collecting')) {
                                const match = line.match(/Collecting\s+([^\s(]+)/);
                                if (match) message = `PyTorch 수집 중: ${match[1]}`;
                            } else if (line.includes('Downloading')) {
                                message = 'PyTorch 다운로드 중...';
                                currentProgress = Math.min(currentProgress + 2, 40);
                            } else if (line.includes('Installing collected packages')) {
                                message = 'PyTorch 설치 중...';
                                currentProgress = 45;
                            } else if (line.includes('Successfully installed')) {
                                message = 'PyTorch 설치 완료!';
                                currentProgress = 50;
                            }
                            
                            if (message && onProgress) {
                                onProgress(currentProgress / 100, message);
                            }
                        }
                    });

                    torchChild.stderr.on('data', (data) => {
                        const text = data.toString();
                        torchOutput += text;
                        console.log('[Torch Install stderr]', text);
                    });

                    torchChild.on('close', (code) => {
                        if (code === 0) {
                            if (onProgress) onProgress(0.5, 'PyTorch 설치 완료');
                            resolveTorch(torchOutput);
                        } else {
                            rejectTorch(new Error(`PyTorch installation failed: ${torchOutput}`));
                        }
                    });

                    torchChild.on('error', (err) => {
                        rejectTorch(err);
                    });
                });
            };

            // Step 2: faster-whisper 및 ctranslate2 설치
            const installWhisper = () => {
                return new Promise((resolveWhisper, rejectWhisper) => {
                    console.log('[WhisperManager] Step 2/2: Faster-Whisper 설치 중...');
                    if (onProgress) onProgress(0.55, 'Faster-Whisper 다운로드 중...');
                    
                    const whisperArgs = [
                        '-m', 'pip', 'install',
                        '--no-cache-dir',
                        'faster-whisper',
                        'ctranslate2==4.0.0'
                    ];

                    const whisperChild = spawn(pythonExe, whisperArgs, {
                        cwd: appRoot,
                        env: process.env
                    });

                    let whisperOutput = '';
                    let currentProgress = 55;

                    whisperChild.stdout.on('data', (data) => {
                        const text = data.toString();
                        whisperOutput += text;
                        console.log('[Whisper Install]', text);

                        const lines = text.split('\n').filter(line => line.trim());
                        for (const line of lines) {
                            let message = '';
                            
                            if (line.includes('Collecting')) {
                                const match = line.match(/Collecting\s+([^\s(]+)/);
                                if (match) message = `패키지 수집 중: ${match[1]}`;
                            } else if (line.includes('Downloading')) {
                                const match = line.match(/Downloading\s+([^\s(]+)/);
                                if (match) {
                                    const pkgName = match[1].split('-')[0];
                                    message = `다운로드 중: ${pkgName}`;
                                }
                                currentProgress = Math.min(currentProgress + 3, 85);
                            } else if (line.includes('Installing collected packages')) {
                                message = '패키지 설치 중...';
                                currentProgress = 90;
                            } else if (line.includes('Successfully installed')) {
                                message = '설치 완료!';
                                currentProgress = 98;
                            }
                            
                            if (message && onProgress) {
                                onProgress(currentProgress / 100, message);
                            }
                        }
                    });

                    whisperChild.stderr.on('data', (data) => {
                        const text = data.toString();
                        whisperOutput += text;
                        console.log('[Whisper Install stderr]', text);
                    });

                    whisperChild.on('close', (code) => {
                        if (code === 0) {
                            if (onProgress) onProgress(1.0, '설치 완료');
                            resolveWhisper(whisperOutput);
                        } else {
                            rejectWhisper(new Error(`Faster-Whisper installation failed: ${whisperOutput}`));
                        }
                    });

                    whisperChild.on('error', (err) => {
                        rejectWhisper(err);
                    });
                });
            };

            // 순차 실행
            installTorch()
                .then(() => installWhisper())
                .then((output) => {
                    resolve({ success: true, output });
                })
                .catch((err) => {
                    reject(err);
                });
        });
    }
}

module.exports = { WhisperManager };
