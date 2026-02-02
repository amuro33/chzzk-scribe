const { spawn, execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { mergeStreamLog } = require('./merge-stream-log');

class Transcriber {
    constructor(whisperManager) {
        this.whisperManager = whisperManager;
        this.currentProcess = null;
        this.isCancelled = false;
    }

    async start(task, onProgress, onComplete, onError, onLog) {
        const { vodId, videoPath, whisperModel, whisperEngine, streamerName, vodTitle } = task;
        this.isCancelled = false;
        
        const log = (message, type = 'info') => {
            console.log(`[Transcriber] ${message}`);
            if (onLog) onLog(message, type);
        };
        
        log(`작업 시작: ${path.basename(videoPath)}`);
        
        try {
            const outputDir = path.dirname(videoPath);
            const aiFolder = path.join(outputDir, 'AI');
            const cacheFolder = path.join(aiFolder, '.cache');
            
            // 완료된 단계 체크를 위한 파일 경로들
            const videoBaseName = path.parse(videoPath).name;
            const expectedSrtPath = path.join(cacheFolder, `${videoBaseName}.srt`);
            const expectedMdPath = path.join(aiFolder, `${videoBaseName}_로그.md`);
            
            let chatJsonPath = null;
            let srtPath = null;
            let mergedResult = null;
            
            // === 1단계: 채팅 데이터 확인/다운로드 (스킵 가능) ===
            log('1단계: 채팅 데이터 확인 중...');
            chatJsonPath = await this.ensureChatData(vodId, streamerName, vodTitle, outputDir, log);
            
            if (!chatJsonPath) {
                const errorMsg = '채팅 데이터를 다운로드할 수 없습니다.\n\n스트림 로그는 다시보기 영상(VOD)만 생성 가능합니다.\n업로드 영상은 채팅 데이터가 존재하지 않습니다.';
                log(errorMsg, 'error');
                throw new Error(errorMsg);
            }
            
            log(`✓ 1단계 완료: ${path.basename(chatJsonPath)}`);
            
            // === 2단계: 음성인식 (SRT 생성) ===
            log('2단계: 음성인식 시작...');
            srtPath = await this.transcribeToSrt(task, outputDir, log, onProgress);
            
            if (this.isCancelled) {
                throw new Error('작업이 취소되었습니다');
            }
            
            log(`✓ 2단계 완료: ${path.basename(srtPath)}`);
            
            // === 3단계: 채팅 + SRT 병합 ===
            log('3단계: 채팅과 자막 병합 중...');
            mergedResult = await this.mergeStreamLog(chatJsonPath, srtPath, aiFolder, log);
            log(`✓ 3단계 완료: ${path.basename(mergedResult.outputPath)}`);
            
            log('스트림 로그 생성 완료 ✓', 'success');
            log(`저장 위치: ${mergedResult.outputPath}`);
            
            if (onComplete) {
                onComplete({
                    resultPath: mergedResult.outputPath,
                    srtPath: srtPath,
                    chatPath: chatJsonPath,
                    statistics: mergedResult.statistics
                });
            }

        } catch (error) {
            log(`작업 실패: ${error.message}`, 'error');
            if (onError) onError(error);
        }
    }

    /**
     * 1단계: 채팅 JSON 파일 확인 및 다운로드
     */
    async ensureChatData(vodId, streamerName, vodTitle, outputDir, log) {
        // vodId가 없으면 로컬 파일 (채팅 없음)
        if (!vodId || vodId.startsWith('local_')) {
            log('로컬 파일은 채팅 데이터가 없습니다', 'warn');
            return null;
        }

        // 채팅 JSON 파일 경로 패턴 검색 (영상과 같은 폴더에 저장)
        const chatFolder = outputDir;
        
        // 기존 채팅 파일 찾기
        let existingChatFile = null;
        if (fs.existsSync(chatFolder)) {
            const files = fs.readdirSync(chatFolder);
            existingChatFile = files.find(f => f.includes(vodId) && f.endsWith('.json'));
            
            if (existingChatFile) {
                const chatPath = path.join(chatFolder, existingChatFile);
                log(`기존 채팅 파일 발견: ${existingChatFile}`);
                return chatPath;
            }
        }

        // 채팅 다운로드 시도
        log(`채팅 데이터 다운로드 중... (VOD: ${vodId})`);
        
        try {
            // VOD의 liveOpenDate 가져오기 (ASS 변환기와 동일한 로직)
            let videoTimestamp = Date.now(); // 기본값
            try {
                const r = await fetch(`https://api.chzzk.naver.com/service/v3/videos/${vodId}`, { 
                    headers: { "User-Agent": "Mozilla/5.0" } 
                });
                if (r.ok) {
                    const d = await r.json();
                    const liveOpenDate = d.content?.liveOpenDate;
                    if (liveOpenDate && typeof liveOpenDate === 'string') {
                        videoTimestamp = new Date(liveOpenDate).getTime();
                        log(`방송 시작 시간: ${new Date(videoTimestamp).toLocaleString()}`);
                    }
                }
            } catch (err) {
                log(`liveOpenDate 조회 실패, 기본값 사용: ${err.message}`, 'warn');
            }
            
            const result = await this.downloadChat(vodId, streamerName, vodTitle, videoTimestamp, outputDir);
            
            if (result.success) {
                log(`채팅 다운로드 완료: ${result.chatCount}개 메시지`);
                return result.filePath;
            } else {
                log(`채팅 다운로드 실패: ${result.error}`, 'warn');
                return null;
            }
        } catch (err) {
            log(`채팅 다운로드 오류: ${err.message}`, 'warn');
            return null;
        }
    }

    /**
     * 채팅 다운로드 (main.js의 download-chat 로직 복제)
     */
    async downloadChat(vodId, streamerName, videoTitle, videoTimestamp, savePath) {
        try {
            const sanitizedTitle = videoTitle.replace(/[<>:"/\\|?*]/g, "_");
            
            // filenameTemplate 적용 (기본값: {title})
            const fileNameBase = sanitizedTitle;
            
            const folderPath = savePath; // 영상과 같은 폴더에 저장
            const fullPathJson = path.join(folderPath, `${fileNameBase}.json`);
            
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            let nextMessageTime = 0;
            let prevMessageTime = -1;
            let allChats = [];
            
            while (true) {
                const r = await fetch(`https://api.chzzk.naver.com/service/v1/videos/${vodId}/chats?playerMessageTime=${nextMessageTime}`, { 
                    headers: { "User-Agent": "Mozilla/5.0" } 
                });
                
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
                    error: "채팅 데이터가 없습니다. 다시보기 영상만 지원됩니다."
                };
            }

            fs.writeFileSync(
                fullPathJson, 
                JSON.stringify({ 
                    data: allChats, 
                    meta: { vodId, streamerName, videoTitle, videoTimestamp, downloadDate: new Date().toISOString() } 
                }, null, 2), 
                "utf-8"
            );
            
            return { 
                success: true, 
                filePath: fullPathJson, 
                fileName: `${fileNameBase}.json`, 
                folderPath, 
                chatCount: allChats.length 
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * 2단계: 음성인식 실행 (기존 로직)
     */
    async transcribeToSrt(task, outputDir, log, onProgress) {
        const { videoPath, whisperModel, whisperEngine } = task;
        
        log(`작업 시작: ${path.basename(videoPath)}`);
        
        try {
            // 모델 경로 확인
            log(`모델 확인 중... (${whisperModel})`);
            const status = await this.whisperManager.getStatus(whisperEngine);
            const modelPath = status.models[whisperModel]?.localPath;
            
            if (!modelPath) {
                log(`모델을 찾을 수 없음: ${whisperModel}`, 'error');
                throw new Error(`Model ${whisperModel} not found`);
            }
            log(`모델 경로: ${path.basename(modelPath)}`);

            // Python 실행 파일 경로 찾기 (포터블 환경 대응)
            const isDev = !app.isPackaged;
            let pythonExe = null;
            
            // 포터블 버전 대응: bin 폴더는 resources 폴더 안에 위치
            let appRoot;
            if (isDev) {
                appRoot = path.join(__dirname, '..');
            } else {
                const appPath = app.getAppPath();
                if (appPath.includes('app.asar')) {
                    // resources/app.asar -> resources
                    appRoot = path.dirname(appPath);
                } else {
                    appRoot = appPath;
                }
            }
            
            const pythonRelPath = path.join('bin', 'faster-whisper-env', 'python', 'python.exe');
            pythonExe = path.join(appRoot, pythonRelPath);
            
            log(`Python 환경 검색 중... (포터블 대응)`);
            console.log(`[Transcriber] App root: ${appRoot}`);
            console.log(`[Transcriber] Python path: ${pythonExe}`);
            console.log(`[Transcriber] Exists: ${fs.existsSync(pythonExe)}`);
            
            if (!fs.existsSync(pythonExe)) {
                const errorMsg = `Faster-Whisper Python 환경을 찾을 수 없습니다.\\n\\n경로: ${pythonExe}\\n\\nsetup_faster_whisper.ps1 스크립트를 먼저 실행해주세요.`;
                log('Python 환경을 찾을 수 없음!', 'error');
                console.error(`[Transcriber] ${errorMsg}`);
                throw new Error(errorMsg);
            }
            log(`Python 환경 발견: ${pythonExe}`);

            // 파일 경로 확인 (서브폴더 검색 포함)
            log(`입력 파일 확인 중: ${path.basename(videoPath)}`);

            let targetVideoPath = videoPath;
            if (!fs.existsSync(targetVideoPath)) {
                log('파일을 찾을 수 없음. 하위 폴더 검색 중...');
                
                const dir = path.dirname(targetVideoPath);
                const filename = path.basename(targetVideoPath);
                
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

            if (this.isCancelled) {
                throw new Error('작업이 취소되었습니다');
            }

            // Python 래퍼 스크립트 경로 (asar unpacked 경로 처리)
            let wrapperScript = path.join(__dirname, 'transcribe_wrapper.py');
            if (wrapperScript.includes('app.asar')) {
                wrapperScript = wrapperScript.replace('app.asar', 'app.asar.unpacked');
            }
            
            // SRT 출력 디렉토리 (스트리머이름/AI/.cache 폴더)
            const srtOutputDir = path.join(outputDir, 'AI', '.cache');
            
            // AI/.cache 폴더가 없으면 생성
            if (!fs.existsSync(srtOutputDir)) {
                fs.mkdirSync(srtOutputDir, { recursive: true });
                log(`캐시 폴더 생성: ${srtOutputDir}`);
            }
            
            // Python 실행 인자 (배열로 전달 - 특수문자/공백 안전)
            const args = [
                '-u',  // Unbuffered 모드 (중요: 실시간 출력)
                wrapperScript,
                '--input', targetVideoPath,    // spawn이 자동으로 이스케이프 처리
                '--model', modelPath,
                '--device', 'auto',            // GPU 자동 감지
                '--output_dir', srtOutputDir,
                '--language', 'auto'
            ];

            log(`음성 인식 시작 (모델: ${whisperModel})...`);
            console.log(`[Transcriber] Python: ${pythonExe}`);
            console.log(`[Transcriber] Input: ${path.basename(targetVideoPath)}`);
            console.log(`[Transcriber] Args:`, args);

            // spawn 사용 (shell: false) - 특수문자 안전
            return new Promise((resolve, reject) => {
                this.currentProcess = spawn(pythonExe, args, {
                    cwd: outputDir,
                    env: { ...process.env, PYTHONUNBUFFERED: '1' },
                    shell: false,
                    windowsHide: true
                });

                let stdoutBuffer = '';
                let stderrOutput = '';
                let resultReceived = null;

                this.currentProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    stdoutBuffer += output;
                    
                    const lines = stdoutBuffer.split('\n');
                    stdoutBuffer = lines.pop() || '';
                    
                    lines.forEach((line) => {
                        if (!line.trim()) return;
                        
                        try {
                            const json = JSON.parse(line);
                            
                            if (json.type === 'log') {
                                log(json.message, json.level.toLowerCase());
                            } else if (json.type === 'progress') {
                                const percent = Math.round(json.progress * 100);
                                if (onProgress) onProgress(percent);
                            } else if (json.type === 'result') {
                                resultReceived = json;
                                if (json.success) {
                                    console.log(`[Transcriber] ✅ SRT 생성 성공: ${json.output_path}`);
                                }
                            }
                        } catch (e) {
                            console.log(`[Transcriber STDOUT] ${line}`);
                        }
                    });
                });

                this.currentProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    stderrOutput += output;
                    console.log(`[Transcriber STDERR] ${output.trim()}`);
                });

                this.currentProcess.on('close', (code) => {
                    this.currentProcess = null;
                    
                    if (this.isCancelled) {
                        reject(new Error('작업이 취소되었습니다'));
                        return;
                    }
                    
                    if (resultReceived && resultReceived.success) {
                        resolve(resultReceived.output_path);
                    } else if (code === 0) {
                        const finalSrtPath = path.join(outputDir, `${path.parse(targetVideoPath).name}.srt`);
                        resolve(finalSrtPath);
                    } else {
                        if (resultReceived && !resultReceived.success) {
                            reject(new Error(resultReceived.error || 'Transcription failed'));
                        } else {
                            reject(new Error(`Transcription failed with code ${code}.\n\n${stderrOutput}`));
                        }
                    }
                });

                this.currentProcess.on('error', (err) => {
                    this.currentProcess = null;
                    reject(err);
                });
            });

        } catch (error) {
            throw error;
        }
    }

    /**
     * 3단계: 채팅과 SRT 병합 (JavaScript로 직접 처리)
     */
    async mergeStreamLog(chatJsonPath, srtPath, outputDir, log) {
        // 출력 파일명 생성
        const baseName = path.basename(srtPath, '.srt');
        const outputMdPath = path.join(outputDir, `${baseName}_로그.md`);
        
        // 채팅 JSON에서 메타데이터 읽기
        let liveStartMs = Date.now(); // 기본값
        try {
            const chatData = JSON.parse(fs.readFileSync(chatJsonPath, 'utf-8'));
            if (chatData.meta && chatData.meta.videoTimestamp) {
                liveStartMs = chatData.meta.videoTimestamp;
            }
        } catch (err) {
            log(`메타데이터 읽기 실패, 기본값 사용: ${err.message}`, 'warn');
        }
        
        log(`병합 실행 중... (live_start: ${liveStartMs})`);
        
        try {
            // JavaScript 모듈로 직접 병합 실행
            const merged = await mergeStreamLog(chatJsonPath, srtPath, outputMdPath, liveStartMs);
            
            // 통계 정보 추출
            const stats = merged.statistics || {};
            const chatCount = merged.chat_data?.messages?.length || 0;
            const srtCount = merged.srt_data?.length || 0;
            
            const events = merged.events || [];
            let durationMinutes = 0;
            if (events.length > 0) {
                const maxTimeSec = Math.max(...events.map(e => e.time_sec || 0));
                durationMinutes = maxTimeSec / 60.0;
            }
            
            const statistics = {
                totalEvents: stats.total || 0,
                chatCount,
                srtCount,
                durationMinutes: Math.round(durationMinutes * 100) / 100,
                byType: stats.by_type || {}
            };
            
            log('병합 완료 ✓');
            return { outputPath: outputMdPath, statistics };
        } catch (error) {
            console.error('[Merge] Error:', error);
            throw new Error(`병합 오류: ${error.message}`);
        }
    }

    cancel() {
        console.log('[Transcriber] Cancel requested');
        this.isCancelled = true;
        
        // Python 프로세스 강제 종료
        if (this.currentProcess) {
            try {
                console.log('[Transcriber] Killing Python process...');
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', this.currentProcess.pid.toString(), '/f', '/t'], { shell: true });
                } else {
                    this.currentProcess.kill('SIGKILL');
                }
                this.currentProcess = null;
            } catch (err) {
                console.error(`[Transcriber] Failed to kill process: ${err.message}`);
            }
        }
    }
}

module.exports = { Transcriber };
