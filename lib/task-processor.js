const { Transcriber } = require('./transcriber');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class TaskProcessor {
    constructor(whisperManager, webContents) {
        this.transcriber = new Transcriber(whisperManager);
        this.webContents = webContents; // 렌더러로 상태 전송용
        this.queue = [];
        this.currentTask = null;
        this.isProcessing = false;
        this.stateFilePath = path.join(app.getPath('userData'), 'task-queue-state.json');
        
        // 저장된 작업 상태 복원
        this.restoreState();
    }
    
    restoreState() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                const state = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf-8'));
                console.log(`[TaskProcessor] 저장된 작업 상태 복원 중... (${state.queue?.length || 0}개 작업)`);
                
                if (state.currentTask) {
                    // 진행 중이던 작업을 큐의 맨 앞에 추가
                    console.log(`[TaskProcessor] 복원: 진행 중이던 작업 - ${state.currentTask.vodTitle}`);
                    this.queue.push({
                        ...state.currentTask,
                        status: 'queued', // 상태를 queued로 초기화
                        progress: 0
                    });
                }
                
                if (state.queue && state.queue.length > 0) {
                    console.log(`[TaskProcessor] 복원: 대기 중이던 작업 ${state.queue.length}개`);
                    this.queue.push(...state.queue.map(task => ({
                        ...task,
                        status: 'queued'
                    })));
                }
                
                // 복원 완료 후 상태 파일 삭제
                fs.unlinkSync(this.stateFilePath);
                
                // 복원된 작업이 있으면 UI에 알림
                if (this.queue.length > 0) {
                    setTimeout(() => {
                        if (this.webContents && !this.webContents.isDestroyed()) {
                            this.webContents.send('tasks-restored', {
                                count: this.queue.length,
                                tasks: this.queue
                            });
                        }
                        // 자동으로 처리 시작
                        this.processQueue();
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('[TaskProcessor] 작업 상태 복원 실패:', error);
        }
    }
    
    saveState() {
        try {
            const state = {
                currentTask: this.currentTask,
                queue: this.queue,
                savedAt: new Date().toISOString()
            };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
            console.log(`[TaskProcessor] 작업 상태 저장 완료 (현재 작업: ${this.currentTask ? '1' : '0'}개, 대기 작업: ${this.queue.length}개)`);
        } catch (error) {
            console.error('[TaskProcessor] 작업 상태 저장 실패:', error);
        }
    }

    addTask(task) {
        console.log(`[TaskProcessor] Adding task: ${task.id}`);
        this.queue.push(task);
        this.processQueue();
    }

    cancelTask(taskId) {
        console.log(`[TaskProcessor] Cancelling task: ${taskId}`);
        if (this.currentTask && this.currentTask.id === taskId) {
            this.transcriber.cancel();
            // 현재 작업 실패/취소 처리
            this.sendTaskUpdate(taskId, 'cancelled');
            this.currentTask = null;
            this.isProcessing = false;
            // 다음 작업 진행
            setTimeout(() => this.processQueue(), 1000);
        } else {
            this.queue = this.queue.filter(t => t.id !== taskId);
            this.sendTaskUpdate(taskId, 'cancelled');
        }
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        this.currentTask = this.queue.shift();
        const task = this.currentTask;

        const startTime = new Date();
        console.log(`[TaskProcessor] ⏱️  작업 시작: ${task.id} - ${startTime.toLocaleTimeString('ko-KR')}`);
        this.sendTaskUpdate(task.id, 'processing', 0);

        // 작업 유형에 따라 프로세서 분기 가능
        if (task.taskType === 'transcription' || !task.taskType) { 
            // 기본은 transcription으로 처리 (호환성)
            await this.transcriber.start(
                task,
                (progress) => {
                    // 진행률 업데이트를 UI로 전송
                    console.log(`[TaskProcessor] Progress update: ${task.id} -> ${progress}%`);
                    this.sendTaskUpdate(task.id, 'processing', progress);
                },
                (result) => {
                    const endTime = new Date();
                    const elapsed = ((endTime - startTime) / 1000).toFixed(1);
                    console.log(`[TaskProcessor] ✅ 작업 완료: ${task.id} - ${endTime.toLocaleTimeString('ko-KR')} (소요시간: ${elapsed}초)`);
                    this.sendTaskUpdate(task.id, 'completed', 100, result);
                    this.isProcessing = false;
                    this.currentTask = null;
                    this.processQueue();
                },
                (error) => {
                    console.error(`[TaskProcessor] Task failed: ${task.id}`, error);
                    this.sendTaskUpdate(task.id, 'failed', 0, null, error.message);
                    this.isProcessing = false;
                    this.currentTask = null;
                    this.processQueue();
                },
                (message, type) => {
                    // 로그 메시지를 UI로 전송
                    this.sendTaskLog(task.id, message, type);
                }
            );
        } else {
            console.error(`[TaskProcessor] Unknown task type: ${task.taskType}`);
            this.sendTaskUpdate(task.id, 'failed', 0, null, 'Unknown task type');
            this.isProcessing = false;
            this.currentTask = null;
            this.processQueue();
        }
    }

    sendTaskUpdate(taskId, status, progress = 0, result = null, error = null) {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send('task-update', {
                taskId,
                status,
                progress,
                result,
                error
            });
        }
    }

    sendTaskLog(taskId, message, type = 'info') {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send('task-log', {
                taskId,
                message,
                type,
                timestamp: new Date().toISOString()
            });
        }
    }

    cleanup() {
        console.log('[TaskProcessor] 프로그램 종료 - 작업 상태 저장 중...');
        
        // 진행 중인 작업이나 대기 중인 작업이 있으면 상태 저장
        if (this.currentTask || this.queue.length > 0) {
            this.saveState();
            console.log('[TaskProcessor] 다음 실행 시 작업이 자동으로 재개됩니다.');
        }
        
        // 현재 진행 중인 작업 중단
        if (this.currentTask) {
            console.log(`[TaskProcessor] 작업 일시 중단: ${this.currentTask.id}`);
            this.transcriber.cancel();
        }
        
        this.currentTask = null;
        this.isProcessing = false;
    }
}

module.exports = { TaskProcessor };
