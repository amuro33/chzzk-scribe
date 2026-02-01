const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class Transcriber {
    constructor(whisperManager) {
        this.whisperManager = whisperManager;
        this.currentProcess = null;
        this.ffmpegProcess = null;
        this.tempFiles = [];
        this.isCancelled = false;
    }

    async start(task, onProgress, onComplete, onError, onLog) {
        const { vodId, videoPath, whisperModel, whisperEngine } = task;
        this.isCancelled = false;
        this.tempFiles = [];
        
        const log = (message, type = 'info') => {
            console.log(`[Transcriber] ${message}`);
            if (onLog) onLog(message, type);
        };
        
        log(`작업 시작: ${path.basename(videoPath)}`);
        
        try {
            // 모델 경로 확인
            log(`모델 확인 중... (${whisperModel})`);
            const status = await this.whisperManager.getStatus(whisperEngine);
            const modelPath = status.models[whisperModel]?.localPath;
            
            if (!modelPath) {
                log(`모델을 찾을 수 없음: ${whisperModel}`, 'error');
                if (onError) onError(new Error(`Model ${whisperModel} not found`));
                return;
            }
            log(`모델 경로: ${path.basename(modelPath)}`);

            // 출력 디렉토리 (영상 파일과 같은 위치)
            const outputDir = path.dirname(videoPath);
            
            // whisper.cpp 실행 파일 경로
            const isDev = !app.isPackaged;
            let whisperCmd = null;
            
            // 엔진 경로 후보군 설정 (whisper-cli.exe 사용)
            const bundledDev = path.join(__dirname, '..', 'bin', 'whisper-cpp', 'whisper-cli.exe');
            const bundledProd = path.join(process.resourcesPath || '', 'bin', 'whisper-cpp', 'whisper-cli.exe');
            
            log('Whisper.cpp 엔진 검색 중...');
            console.log(`[Transcriber] Dev path: ${bundledDev} (exists: ${fs.existsSync(bundledDev)})`);
            console.log(`[Transcriber] Prod path: ${bundledProd} (exists: ${fs.existsSync(bundledProd)})`);
            
            if (isDev && fs.existsSync(bundledDev)) {
                whisperCmd = bundledDev;
                log('엔진 발견 (개발 모드)');
            } else if (fs.existsSync(bundledProd)) {
                whisperCmd = bundledProd;
                log('엔진 발견 (프로덕션 모드)');
            }
            
            if (!whisperCmd) {
                const errorMsg = `Whisper.cpp engine not found.\n\nPlease download whisper.cpp from:\nhttps://github.com/ggerganov/whisper.cpp/releases\n\nExtract whisper-cli.exe to: ${bundledDev}`;
                log('엔진을 찾을 수 없음!', 'error');
                console.error(`[Transcriber] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // ----------------------------------------------------------------
            // [Fix] Path Correction & Windows Special Char Support
            // 1. If input file doesn't exist, search in subdirectories (Streamer folders)
            // 2. Create ASCII hardlink to avoid Unicode issues in Python
            // ----------------------------------------------------------------
            
            log(`입력 파일 확인 중: ${path.basename(videoPath)}`);

            let targetVideoPath = videoPath;
            if (!fs.existsSync(targetVideoPath)) {
                 log('파일을 찾을 수 없음. 하위 폴더 검색 중...');
                 
                 const dir = path.dirname(targetVideoPath);
                 const filename = path.basename(targetVideoPath);
                 
                 // Check if we can find it in immediate subfolders (e.g. Downloads/Chzzk/Streamer/File.mp4)
                 let found = null;
                 if (fs.existsSync(dir)) {
                     const entries = fs.readdirSync(dir, { withFileTypes: true });
                     for (const entry of entries) {
                         if (entry.isDirectory()) {
                             const subPath = path.join(dir, entry.name, filename);
                             if (fs.existsSync(subPath)) {
                                 found = subPath;
                                 break;
                             }
                         }
                     }
                 }

                 if (found) {
                     log(`파일 발견: ${path.basename(found)}`);
                     targetVideoPath = found;
                 } else {
                     log(`파일을 찾을 수 없음: ${path.basename(videoPath)}`, 'error');
                     throw new Error(`Input file does not exist: ${videoPath}`);
                 }
            } else {
                log('입력 파일 확인 완료');
            }

            const ext = path.extname(targetVideoPath);
            const safeFileName = `temp_safe_${Date.now()}${ext}`;
            const safeVideoPath = path.join(outputDir, safeFileName);
            let usingSafePath = false;

            // Create safe ASCII link
            try {
                if (fs.existsSync(safeVideoPath)) fs.unlinkSync(safeVideoPath);
                this.tempFiles.push(safeVideoPath);
                
                let method = 'none';
                try {
                   fs.linkSync(targetVideoPath, safeVideoPath); 
                   method = 'link';
                } catch (linkErr) {
                   console.log(`[Transcriber] Hardlink failed (${linkErr.message}), trying copy...`);
                   try {
                       fs.copyFileSync(targetVideoPath, safeVideoPath);
                       method = 'copy';
                   } catch (copyErr) {
                       throw new Error(`Copy failed: ${copyErr.message}`);
                   }
                }
                
                log(`임시 파일 생성 완료 (${method})`);
                usingSafePath = true;
            } catch (fsErr) {
                log(`임시 파일 생성 실패: ${fsErr.message}`, 'error');
                throw new Error(`Failed to create temp file for sanitization: ${fsErr.message}`);
            }

            const targetInputPath = usingSafePath ? safeVideoPath : targetVideoPath;

            // ----------------------------------------------------------------
            // [Step 2] MP4를 WAV로 변환 (whisper.cpp는 WAV만 지원)
            // ----------------------------------------------------------------
            const wavPath = path.join(outputDir, `${path.parse(targetInputPath).name}.wav`);
            this.tempFiles.push(wavPath);
            
            log('오디오 변환 시작 (MP4 → WAV 16kHz)...');
            console.log(`[Transcriber] Input: ${targetInputPath}`);
            console.log(`[Transcriber] Output: ${wavPath}`);
            
            // FFmpeg 경로 찾기
            let ffmpegPath = 'ffmpeg';
            try {
                const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
                ffmpegPath = ffmpegInstaller.path;
            } catch (e) {
                console.log(`[Transcriber] Using system ffmpeg`);
            }

            // MP4 -> WAV 변환 (16kHz, mono, 16-bit PCM)
            const ffmpegArgs = [
                '-y',
                '-i', targetInputPath,
                '-ar', '16000',  // 16kHz 샘플링
                '-ac', '1',      // 모노
                '-c:a', 'pcm_s16le',  // 16-bit PCM
                wavPath
            ];

            await new Promise((resolve, reject) => {
                if (this.isCancelled) {
                    reject(new Error('작업이 취소되었습니다'));
                    return;
                }
                
                this.ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { shell: false });
                
                let ffmpegError = '';
                let durationMatch = null;
                
                this.ffmpegProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    ffmpegError += output;
                    
                    // FFmpeg 진행상황 파싱
                    if (!durationMatch) {
                        const match = output.match(/Duration: (\d+):(\d+):(\d+)/);
                        if (match) {
                            durationMatch = match;
                            log(`영상 길이: ${match[1]}:${match[2]}:${match[3]}`);
                        }
                    }
                    
                    const timeMatch = output.match(/time=(\d+):(\d+):(\d+)/);
                    if (timeMatch && durationMatch) {
                        const current = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]);
                        const total = parseInt(durationMatch[1]) * 3600 + parseInt(durationMatch[2]) * 60 + parseInt(durationMatch[3]);
                        const percent = Math.floor((current / total) * 100);
                        if (percent % 10 === 0) {
                            log(`오디오 변환 중... ${percent}%`);
                        }
                    }
                });

                this.ffmpegProcess.on('close', (code) => {
                    this.ffmpegProcess = null;
                    if (this.isCancelled) {
                        reject(new Error('작업이 취소되었습니다'));
                        return;
                    }
                    if (code === 0) {
                        log('오디오 변환 완료 ✓');
                        resolve();
                    } else {
                        log('오디오 변환 실패', 'error');
                        console.error(`[Transcriber] FFmpeg failed: ${ffmpegError}`);
                        reject(new Error(`FFmpeg conversion failed with code ${code}`));
                    }
                });

                this.ffmpegProcess.on('error', (err) => {
                    this.ffmpegProcess = null;
                    reject(new Error(`FFmpeg process error: ${err.message}`));
                });
            });

            if (this.isCancelled) {
                throw new Error('작업이 취소되었습니다');
            }

            // whisper.cpp 실행 인자
            // 출력 형식: SRT
            const outputBaseName = path.parse(targetVideoPath).name;  // 원본 파일명 사용
            const outputPath = path.join(outputDir, outputBaseName);
            const args = [
                '-m', modelPath,
                '-f', wavPath,  // WAV 파일 사용
                '--output-srt',
                '--output-file', outputPath,
                '-t', '4',  // 스레드 수
                '-l', 'auto'  // 언어 자동 감지
            ];

            log(`음성 인식 시작 (모델: ${whisperModel})...`);
            console.log(`[Transcriber] Spawning: ${whisperCmd} ${args.join(' ')}`);
            console.log(`[Transcriber] Working directory: ${outputDir}`);
            console.log(`[Transcriber] Model: ${modelPath}`);
            console.log(`[Transcriber] Input: ${targetInputPath}`);

            this.currentProcess = spawn(whisperCmd, args, { 
                cwd: outputDir,
                env: process.env,
                shell: false
            });

            let errorOutput = '';
            let stdoutOutput = '';

            this.currentProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdoutOutput += output;
                const lines = output.split('\n');
                lines.forEach(line => {
                    const l = line.trim();
                    if (l) {
                        console.log(`[Whisper STDOUT] ${l}`);
                        
                        // 진행률 파싱 및 UI 표시
                        const progressMatch = l.match(/progress\s*=\s*(\d+)%/);
                        if (progressMatch) {
                            log(`진행률: ${progressMatch[1]}%`);
                        }
                        
                        // 언어 감지 결과
                        if (l.includes('detecting language')) {
                            log('언어 감지 중...');
                        }
                        if (l.match(/language.*korean|korean/i)) {
                            log('언어 감지: 한국어');
                        }
                        
                        // 처리 시작
                        if (l.includes('processing')) {
                            log('오디오 처리 중...');
                        }
                    }
                });
            });

            this.currentProcess.stderr.on('data', (data) => {
                const output = data.toString();
                errorOutput += output;
                console.log(`[Whisper STDERR] ${output.trim()}`);
            });

            this.currentProcess.on('close', (code) => {
                this.currentProcess = null;
                
                // 취소된 경우 임시 파일만 정리하고 종료
                if (this.isCancelled) {
                    this.cleanup(outputDir, safeVideoPath, wavPath, usingSafePath, targetVideoPath);
                    if (onError) onError(new Error('작업이 취소되었습니다'));
                    return;
                }
                
                // [Cleanup] 작업 완료 후 임시 파일 및 결과물 처리
                if (usingSafePath) {
                    try {
                        // 결과물 이동: safeFileName.srt -> OriginalName.srt
                        const safeSrtPath = path.join(outputDir, `${path.parse(safeVideoPath).name}.srt`);
                        const finalSrtPath = path.join(outputDir, `${path.parse(targetVideoPath).name}.srt`);
                        
                        if (code === 0 && fs.existsSync(safeSrtPath)) {
                            if (fs.existsSync(finalSrtPath)) fs.unlinkSync(finalSrtPath);
                            fs.renameSync(safeSrtPath, finalSrtPath);
                            console.log(`[Transcriber] Renamed result to: ${finalSrtPath}`);
                        }
                    } catch (cleanupErr) {
                        console.error(`[Transcriber] Cleanup error (rename): ${cleanupErr.message}`);
                    }

                    try {
                        // 임시 입력 파일 삭제
                        if (fs.existsSync(safeVideoPath)) fs.unlinkSync(safeVideoPath);
                        console.log(`[Transcriber] Removed temp file: ${safeVideoPath}`);
                    } catch (cleanupErr) {
                         console.error(`[Transcriber] Cleanup error (delete): ${cleanupErr.message}`);
                    }
                }

                // WAV 임시 파일 삭제
                try {
                    if (fs.existsSync(wavPath)) {
                        fs.unlinkSync(wavPath);
                        console.log(`[Transcriber] Removed WAV temp file: ${wavPath}`);
                    }
                } catch (cleanupErr) {
                    console.error(`[Transcriber] Cleanup error (WAV): ${cleanupErr.message}`);
                }

                if (code === 0) {
                    log('자막 파일 생성 완료 ✓', 'success');
                    const finalSrtPath = path.join(outputDir, `${path.parse(targetVideoPath).name}.srt`);
                    log(`저장 위치: ${finalSrtPath}`);
                    if (onComplete) onComplete({
                        resultPath: finalSrtPath
                    });
                } else {
                    log(`작업 실패 (종료 코드: ${code})`, 'error');
                    console.error(`[Transcriber] Process exited with code ${code}`);
                    console.error(`[Transcriber] STDOUT:\n${stdoutOutput}`);
                    console.error(`[Transcriber] STDERR:\n${errorOutput}`);
                    if (onError) onError(new Error(`Whisper.cpp exited with code ${code}.\n\nSTDOUT:\n${stdoutOutput}\n\nSTDERR:\n${errorOutput}`));
                }
            });

            this.currentProcess.on('error', (err) => {
                this.currentProcess = null;
                if (onError) onError(err);
            });

        } catch (error) {
            if (onError) onError(error);
        }
    }

    cleanup(outputDir, safeVideoPath, wavPath, usingSafePath, targetVideoPath) {
        console.log('[Transcriber] Cleaning up temporary files...');
        
        // 임시 파일들 삭제
        for (const tempFile of this.tempFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                    console.log(`[Transcriber] Removed temp file: ${tempFile}`);
                }
            } catch (err) {
                console.error(`[Transcriber] Failed to remove ${tempFile}: ${err.message}`);
            }
        }
        
        this.tempFiles = [];
    }

    cancel() {
        console.log('[Transcriber] Cancel requested');
        this.isCancelled = true;
        
        // FFmpeg 프로세스 강제 종료
        if (this.ffmpegProcess) {
            try {
                console.log('[Transcriber] Killing FFmpeg process...');
                if (process.platform === 'win32') {
                    // Windows에서는 taskkill로 프로세스 트리 전체 종료
                    spawn('taskkill', ['/pid', this.ffmpegProcess.pid.toString(), '/f', '/t'], { shell: true });
                } else {
                    this.ffmpegProcess.kill('SIGKILL');
                }
                this.ffmpegProcess = null;
            } catch (err) {
                console.error(`[Transcriber] Failed to kill FFmpeg: ${err.message}`);
            }
        }
        
        // Whisper 프로세스 강제 종료
        if (this.currentProcess) {
            try {
                console.log('[Transcriber] Killing Whisper process...');
                if (process.platform === 'win32') {
                    // Windows에서는 taskkill로 프로세스 트리 전체 종료
                    spawn('taskkill', ['/pid', this.currentProcess.pid.toString(), '/f', '/t'], { shell: true });
                } else {
                    this.currentProcess.kill('SIGKILL');
                }
                this.currentProcess = null;
            } catch (err) {
                console.error(`[Transcriber] Failed to kill Whisper: ${err.message}`);
            }
        }
        
        // 임시 파일 정리
        for (const tempFile of this.tempFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                    console.log(`[Transcriber] Removed temp file: ${tempFile}`);
                }
            } catch (err) {
                console.error(`[Transcriber] Failed to remove ${tempFile}: ${err.message}`);
            }
        }
        
        this.tempFiles = [];
    }
}

module.exports = { Transcriber };
