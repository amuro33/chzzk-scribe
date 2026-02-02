const { Transcriber } = require('./transcriber');

class TaskProcessor {
    constructor(whisperManager, webContents) {
        this.transcriber = new Transcriber(whisperManager);
        this.webContents = webContents; // 렌더러로 상태 전송용
        this.queue = [];
        this.currentTask = null;
        this.isProcessing = false;
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
        console.log('[TaskProcessor] Cleaning up tasks on shutdown');
        // 현재 진행 중인 작업 취소
        if (this.currentTask) {
            console.log(`[TaskProcessor] Cancelling current task: ${this.currentTask.id}`);
            this.transcriber.cancel();
            this.sendTaskUpdate(this.currentTask.id, 'failed', 0, null, '프로그램 종료로 작업이 중단되었습니다');
        }
        // 큐에 대기 중인 모든 작업 실패 처리
        this.queue.forEach(task => {
            console.log(`[TaskProcessor] Failing queued task: ${task.id}`);
            this.sendTaskUpdate(task.id, 'failed', 0, null, '프로그램 종료로 작업이 취소되었습니다');
        });
        this.queue = [];
        this.currentTask = null;
        this.isProcessing = false;
    }
}

module.exports = { TaskProcessor };
