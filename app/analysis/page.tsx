"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Brain, Plus, Sparkles, X, PlayCircle, Info, Pause, Play, XCircle, RotateCcw, FileText, Download, Eye, Trash2, AlertCircle, Settings, ExternalLink, FolderOpen } from "lucide-react";
import type { StreamLog, TranscriptionTask, AnalysisTask, AnalysisResult } from "@/types/analysis";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AddStreamLogDialog } from "@/components/add-stream-log-dialog";
import { AnalysisSettingsDialog } from "@/components/analysis-settings-dialog";
import { ChatFirepowerChart } from "@/components/chat-firepower-chart";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";
import { ipcBridge } from "@/lib/ipc-bridge"; // 추가

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState("stream-log");
  const { transcriptionTasks, analysisTasks, updateTranscriptionTask, addStreamLog, addTranscriptionTaskLog, downloads } = useAppStore();

  const activeTaskCount = [
    ...transcriptionTasks,
    ...analysisTasks
  ].filter(t => t.status === "processing" || t.status === "queued").length;

  useEffect(() => {
    // 작업 상태 업데이트 수신
    const cleanupUpdate = ipcBridge.onTaskUpdate(({ taskId, status, progress, result, error }) => {
        // 전사의 경우
        const task = transcriptionTasks.find(t => t.id === taskId);
        if (task) {
            updateTranscriptionTask(taskId, { 
                status, 
                progress, 
                error, 
                startedAt: status === 'processing' && !task.startedAt ? new Date().toISOString() : task.startedAt,
                completedAt: status === 'completed' ? new Date().toISOString() : undefined 
            });
            
            if (status === 'completed' && result) {
                // 다운로드 정보에서 썸네일 URL 가져오기
                const download = downloads.find(d => d.vodId === task.vodId);
                
                // 스트림 로그 생성
                const newLog: StreamLog = {
                    id: crypto.randomUUID(),
                    vodId: task.vodId,
                    vodTitle: task.vodTitle,
                    streamerName: task.streamerName,
                    thumbnailUrl: download?.thumbnailUrl || task.thumbnailUrl,
                    broadcastDate: new Date().toISOString(), // 메타데이터가 있다면 그걸 쓰는게 좋음
                    videoPath: task.videoPath,
                    streamLogPath: result.resultPath,
                    createdAt: new Date().toISOString(),
                    status: 'completed',
                    statistics: result.statistics
                };
                addStreamLog(newLog);
                toast.success(`'${task.vodTitle}' 음성 인식이 완료되었습니다.`);
            } else if (status === 'failed') {
                toast.error(`'${task.vodTitle}' 작업 실패: ${error}`);
            }
        }
    });

    // 작업 로그 업데이트 수신
    const cleanupLog = ipcBridge.onTaskLog(({ taskId, message, type, timestamp }) => {
        addTranscriptionTaskLog(taskId, { message, type, timestamp });
    });

    return () => {
        cleanupUpdate();
        cleanupLog();
    };
  }, [transcriptionTasks, updateTranscriptionTask, addStreamLog, addTranscriptionTaskLog]);

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex-1 ml-16 flex flex-col">
        <div className="flex-1 p-6 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="mb-2 w-fit bg-secondary/30 border border-border/50 h-12 p-1">
              <TabsTrigger value="stream-log" className="text-sm h-10 w-[120px] data-[state=active]:bg-background data-[state=active]:text-primary relative data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-2 data-[state=active]:after:right-2 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary">스트림 로그</TabsTrigger>
              <TabsTrigger value="task-queue" className="text-sm h-10 w-[120px] data-[state=active]:bg-background data-[state=active]:text-primary relative data-[state=active]:after:absolute data-[state=active]:after:bottom-0 data-[state=active]:after:left-2 data-[state=active]:after:right-2 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-primary">
                작업 큐
                {activeTaskCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 px-1 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                    {activeTaskCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden">
              <TabsContent value="stream-log" className="h-full m-0">
                <StreamLogTab setActiveTab={setActiveTab} />
              </TabsContent>

              <TabsContent value="task-queue" className="h-full m-0">
                <TaskQueueTab />
              </TabsContent>

              <TabsContent value="results" className="h-full m-0">
                <ResultsTab />
              </TabsContent>

              <TabsContent value="settings" className="h-full m-0">
                <SettingsTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

// 스트림 로그 탭
function StreamLogTab({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const { streamLogs, downloads, addTranscriptionTask, removeStreamLog } = useAppStore();
  const [showWelcome, setShowWelcome] = useState(true);
  const [selectedLog, setSelectedLog] = useState<StreamLog | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAnalysisDialogOpen, setIsAnalysisDialogOpen] = useState(false);

  const handleDelete = (logId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('이 스트림 로그를 삭제하시겠습니까?')) {
      removeStreamLog(logId);
      if (selectedLog?.id === logId) {
        setSelectedLog(null);
      }
      toast.success('스트림 로그가 삭제되었습니다.');
    }
  };

  const handleOpenFolder = async (streamLogPath: string | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!streamLogPath) {
      toast.error("파일 경로 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      // streamLogPath에서 디렉토리 경로 추출
      const folderPath = streamLogPath.substring(0, streamLogPath.lastIndexOf('\\'));
      const error = await ipcBridge.openPath(folderPath);
      if (error && error !== "") {
        toast.error("폴더를 여는 중 오류가 발생했습니다.");
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      toast.error("폴더를 여는 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="h-6 w-1.5 rounded-full bg-primary" />
            생성된 로그
            <Badge variant="secondary" className="ml-1 text-xs">{streamLogs.length}</Badge>
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            생성된 로그 파일을 ChatGPT에 업로드해 보세요! '오늘 방송 중 시청자 반응이 좋았던 구간 찾아줘' 같은 디테일한 분석이 가능해집니다.
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          신규 생성
        </Button>
      </div>

      {/* 스트림 로그 목록 */}
      <div className="flex-1 overflow-auto">
        {streamLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">스트림 로그가 없습니다</h3>
            <p className="text-sm text-muted-foreground mb-4">
              스트림 로그를 생성해야 AI 분석을 시작 할 수 있습니다!
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              스트림 로그 생성
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-1">
            {[...streamLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((log) => (
              <Card 
                key={log.id} 
                className={`group cursor-pointer overflow-hidden border-l-4 border-l-green-500/60 border-t-border/20 border-r-border/20 border-b-border/20 shadow-none mb-1.5 ${
                  selectedLog?.id === log.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedLog(log)}
              >
                <CardHeader className="p-2">
                  <div className="flex items-center gap-4">
                    
                    {/* 썸네일 영역 */}
                    <div className="relative w-32 aspect-video bg-muted rounded-sm overflow-hidden flex-shrink-0 border border-border/50 self-center">
                      {log.thumbnailUrl ? (
                        <img src={log.thumbnailUrl} alt={log.vodTitle} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full text-muted-foreground bg-secondary/50">
                          <PlayCircle className="h-8 w-8 opacity-20" />
                        </div>
                      )}
                    </div>

                    {/* 컨텐츠 영역 */}
                    <div className="flex-1 min-w-0 flex gap-4 overflow-hidden">
                      
                      {/* 왼쪽: 정보 영역 */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
                        
                        {/* 상단: 타이틀 및 상태 */}
                        <div className="flex items-center justify-between gap-1">
                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5 mb-1.0">
                              <span className="text-[11px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider flex-shrink-0 bg-green-500/10 px-1 rounded-[2px] leading-tight">
                                스트림 로그
                              </span>
                              <h4 className="font-medium text-sm truncate leading-none mb-0.5 pt-0.5" title={log.vodTitle}>
                                {log.vodTitle}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <p className="text-[12px] text-muted-foreground truncate leading-none">
                                {log.streamerName}
                              </p>
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5">
                                {new Date(log.broadcastDate).toLocaleDateString("ko-KR")}
                              </Badge>
                            </div>
                            
                            {/* 통계 정보 */}
                            {log.statistics && (
                              <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium">방송시작시간:</span>
                                  <span>{new Date(log.broadcastDate).toLocaleString("ko-KR", {
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: false
                                  }).replace(/\. /g, "-").replace(/\./g, "").replace(/-/g, "-").slice(0, -3)}</span>
                                </div>
                                {log.statistics.durationMinutes && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium">방송:</span>
                                    <span>{Math.round(log.statistics.durationMinutes)}분</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-3">
                                  <span>총 이벤트: <strong className="text-foreground">{log.statistics.totalEvents || 0}</strong></span>
                                    <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-5 w-5 ml-1"
                                    onClick={(e) => handleOpenFolder(log.streamLogPath, e)}
                                    title="폴더 열기"
                                  >
                                    <FolderOpen className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 오른쪽: 차트 영역 */}
                      <div className="flex-1 min-w-0 flex items-start h-[90px]" onClick={(e) => e.stopPropagation()}>
                        <ChatFirepowerChart streamLogPath={log.streamLogPath || ''} videoPath={log.videoPath} />
                      </div>
                    </div>

                    {/* 삭제 버튼 */}
                    <div className="flex items-center flex-shrink-0 -mr-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive transition-opacity"
                        onClick={(e) => handleDelete(log.id, e)}
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 다이얼로그들 */}
      <AddStreamLogDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onConfirm={async (data) => {
          let vodTitle = "Unknown Title";
          let streamerName = "Unknown";
          let vodId = data.vodId;
          let thumbnailUrl: string | undefined = undefined;
          
          // 파일명 추출 (fallback용)
          const filename = data.videoPath.split(/[/\\]/).pop();
          
          // vodUrl에서 vodId 추출 (로컬 파일 + VOD 주소 입력한 경우)
          if (!vodId && data.vodUrl) {
            const match = data.vodUrl.match(/\/video\/(\d+)/);
            if (match) {
              vodId = match[1];
            }
          }
          
          // downloads에서 정보 찾기
          if (vodId && !vodId.startsWith('local_')) {
             const download = downloads.find(d => d.vodId === vodId);
             if (download) {
                vodTitle = download.title;
                streamerName = download.streamerName || "Unknown";
                thumbnailUrl = download.thumbnailUrl;
             } else {
                // downloads에 없으면 API에서 직접 가져오기 시도
                try {
                  const response = await fetch(`https://api.chzzk.naver.com/service/v3/videos/${vodId}`, {
                    headers: { "User-Agent": "Mozilla/5.0" }
                  });
                  if (response.ok) {
                    const result = await response.json();
                    if (result.content) {
                      vodTitle = result.content.videoTitle || filename || vodTitle;
                      streamerName = result.content.channel?.channelName || streamerName;
                      thumbnailUrl = result.content.thumbnailImageUrl;
                    }
                  }
                } catch (error) {
                  console.error('Failed to fetch VOD info:', error);
                }
                
                // API 실패 시 파일명 사용
                if (vodTitle === "Unknown Title" && filename) {
                  vodTitle = filename;
                }
             }
          } else if (filename) {
             // 로컬 파일인 경우 파일명 사용
             vodTitle = filename;
          }

          const newTask: TranscriptionTask = {
            id: crypto.randomUUID(),
            vodId: vodId || `local_${Date.now()}`,
            vodTitle,
            streamerName,
            thumbnailUrl,
            videoPath: data.videoPath,
            vodUrl: data.vodUrl,
            whisperModel: data.whisperModel,
            whisperEngine: data.whisperEngine,
            status: 'queued',
            progress: 0,
            createdAt: new Date().toISOString()
          };
          
          addTranscriptionTask(newTask);
          ipcBridge.addTranscriptionTask(newTask); // Electron Backend로 작업 전달
          
          // 썸네일이 있으면 스토어에 임시 다운로드 항목 추가 (썸네일 표시용)
          if (thumbnailUrl && vodId) {
            // downloads 배열에 임시로 추가하지 않고, 작업에만 썸네일 정보 포함
            // 나중에 streamLog 생성 시 사용
          }
          
          toast.success("작업이 큐에 추가되었습니다.");
          setActiveTab("task-queue"); // 작업 큐 탭으로 이동
        }}
      />

      <Dialog open={isAnalysisDialogOpen} onOpenChange={setIsAnalysisDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>AI 분석 설정</DialogTitle>
            <DialogDescription>
              {selectedLog?.vodTitle}
            </DialogDescription>
          </DialogHeader>
          <AnalysisSettingsDialog
            open={isAnalysisDialogOpen}
            onOpenChange={setIsAnalysisDialogOpen}
            streamLog={selectedLog}
            onConfirm={(data) => {
              console.log("AI 분석 시작:", data);
              // TODO: 실제 AI 분석 시작 로직
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 작업 큐 탭
function TaskQueueTab() {
  const { 
    transcriptionTasks, 
    analysisTasks, 
    streamLogs,
    removeTranscriptionTask, 
    removeAnalysisTask,
    updateTranscriptionTask,
    addTranscriptionTask,
    downloads
  } = useAppStore();

  const allTasks = [
    ...transcriptionTasks.map(t => ({ ...t, taskType: 'transcription' as const })),
    ...analysisTasks.map(t => {
        const log = streamLogs.find(l => l.id === t.streamLogId);
        return { 
            ...t, 
            taskType: 'analysis' as const,
            vodId: log?.vodId || '' 
        };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleCancelTask = async (task: any) => {
    if (task.status === 'processing' || task.status === 'queued') {
      if (task.taskType === 'transcription') {
        await ipcBridge.cancelTranscriptionTask(task.id);
        // 취소 후 상태 변경 (삭제가 아니라 취소 상태로)
        updateTranscriptionTask(task.id, { status: 'cancelled' });
        toast.info("작업이 취소되었습니다.");
      } else {
        // AI 분석 취소 로직 (구현 필요 시 추가)
        removeAnalysisTask(task.id);
        toast.info("작업이 취소되었습니다.");
      }
    }
  };

  const handleDeleteTask = (task: any) => {
    if (task.taskType === 'transcription') {
      removeTranscriptionTask(task.id);
    } else {
      removeAnalysisTask(task.id);
    }
    toast.success("작업 내역이 삭제되었습니다.");
  };

  const handleRetryTask = (task: any) => {
    if (task.taskType === 'transcription') {
      // 재시도를 위해 상태 초기화 및 재전송
      updateTranscriptionTask(task.id, { status: 'queued', progress: 0, error: undefined });
      ipcBridge.addTranscriptionTask(task);
      toast.success("작업이 다시 큐에 추가되었습니다.");
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      queued: { variant: "secondary", label: "대기 중" },
      processing: { variant: "default", label: "처리 중" },
      completed: { variant: "outline", label: "완료" },
      failed: { variant: "destructive", label: "실패" },
      cancelled: { variant: "outline", label: "취소됨" },
    };
    const config = variants[status] || variants.queued;
    return <Badge variant={config.variant} className="text-[10px] px-1.5 h-5">{config.label}</Badge>;
  };

  const getThumbnail = (task: any) => {
    // task에 thumbnailUrl이 있으면 우선 사용
    if (task.thumbnailUrl) {
      return task.thumbnailUrl;
    }
    // 없으면 downloads에서 찾기
    const downloadItem = downloads.find(d => d.vodId === task.vodId);
    return downloadItem?.thumbnailUrl || null;
  };

  const [currentTime, setCurrentTime] = useState(Date.now());

  // 1초마다 업데이트하여 경과 시간 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getElapsedTime = (startedAt?: string, completedAt?: string, status?: string) => {
    if (!startedAt) return "대기 중...";
    
    // 완료된 작업은 총 걸린 시간 표시
    let elapsed;
    if (status === 'completed' && completedAt) {
      elapsed = Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    } else {
      elapsed = Math.floor((currentTime - new Date(startedAt).getTime()) / 1000);
    }
    
    // 음수 방지
    if (elapsed < 0) elapsed = 0;
    
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    } else {
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          작업 큐
          <Badge variant="secondary" className="ml-1 text-xs">{allTasks.length}</Badge>
        </h2>
      </div>

      <div className="flex-1 overflow-auto">
        {allTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">진행 중인 작업이 없습니다</h3>
            <p className="text-sm text-muted-foreground">
              스트림 로그를 생성하거나 AI 분석을 시작하세요
            </p>
          </div>
        ) : (
          <div className="space-y-0 p-0">
            {allTasks.map((task) => {
              const thumbnailUrl = getThumbnail(task);
              
              // 상태에 따라 왼쪽 보더 색상 결정
              const borderColor = task.status === 'completed' 
                ? 'border-l-green-500/60' 
                : 'border-l-green-300/40';

              return (
              <Card key={task.id} className={`overflow-hidden border-l-4 ${borderColor} border-t-border/20 border-r-border/20 border-b-border/20 shadow-none mb-1.5`}>
                <CardHeader className="p-2">
                  <div className="flex items-center gap-4">
                    
                    {/* 썸네일 영역 - 2배 확대 */}
                    <div className="relative w-32 aspect-video bg-muted rounded-sm overflow-hidden flex-shrink-0 border border-border/50 self-center">
                        {thumbnailUrl ? (
                            <img src={thumbnailUrl} alt={task.vodTitle} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex items-center justify-center w-full h-full text-muted-foreground bg-secondary/50">
                                <FileText className="h-8 w-8 opacity-20" />
                            </div>
                        )}
                    </div>

                        {/* 컨텐츠 영역 */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 overflow-hidden">
                      
                      {/* 상단: 타이틀 및 상태 */}
                      <div className="flex items-center justify-between gap-1">
                         <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <div className="flex items-center gap-1.5 mb-1.0">
                                <span className="text-[11px] font-bold text-primary uppercase tracking-wider flex-shrink-0 bg-primary/10 px-1 rounded-[2px] leading-tight">
                                    {task.taskType === 'transcription' ? '음성인식' : 'AI분석'}
                                </span>
                                <h4 className="font-medium text-sm truncate leading-none mb-0.5 pt-0.5" title={task.vodTitle}>
                                    {task.vodTitle}
                                </h4>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <p className="text-[12px] text-muted-foreground truncate leading-none">
                                    {task.streamerName}
                                </p>
                                {getStatusBadge(task.status)}
                                {/* GPU 가속 활성화 표시 */}
                                {task.taskType === 'transcription' && task.logs && task.logs.some(log => 
                                  log.message.includes('NVIDIA GPU') || 
                                  log.message.includes('GPU 가속') ||
                                  log.message.includes('🚀 GPU')
                                ) && (
                                  <Badge variant="default" className="text-[10px] px-2 h-5">
                                    🚀 GPU 가속 활성화
                                  </Badge>
                                )}
                            </div>
                         </div>
                         
                         {/* 버튼 그룹 - 크기 최소화 */}
                         <div className="flex items-center flex-shrink-0 -mr-1">
                            {/* 취소 버튼: 처리 중이거나 대기 중일 때 */}
                            {(task.status === "processing" || task.status === "queued") && (
                                <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-6 w-6"
                                onClick={() => handleCancelTask(task)}
                                title="작업 취소"
                                >
                                <XCircle className="h-3.5 w-3.5" />
                                </Button>
                            )}
                            
                            {/* 재시도 버튼: 실패했거나 취소되었을 때 */}
                            {(task.status === "failed" || task.status === "cancelled") && (
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-6 w-6"
                                    onClick={() => handleRetryTask(task)}
                                    title="다시 시도"
                                >
                                <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                            )}

                            {/* 삭제 버튼: 완료, 실패, 취소 상태일 때 목록에서 제거 */}
                            {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && (
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteTask(task)}
                                    title="목록에서 삭제"
                                >
                                <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                         </div>
                      </div>

                      {/* 하단: 진행률 바 (처리 중일 때만) */}
                      {(task.status === "processing" || task.status === "queued") && (
                        <div className="space-y-0.5 mt-1">
                            <div className="flex items-center justify-between text-[11px] leading-none">
                                <span className="text-red-500 font-semibold">{getElapsedTime(task.startedAt, task.completedAt, task.status)}</span>
                                <span className="text-muted-foreground">{task.progress}%</span>
                            </div>
                             <div className="w-full bg-secondary rounded-full h-1.5">
                                <div
                                className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${task.progress}%` }}
                                />
                            </div>
                        </div>
                       )}
                       
                       {/* 완료된 작업의 총 걸린 시간 표시 */}
                       {task.status === "completed" && task.startedAt && (
                        <div className="mt-1">
                            <div className="text-[11px] text-muted-foreground leading-none">
                                <span>총 소요시간: {getElapsedTime(task.startedAt, task.completedAt, task.status)}</span>
                            </div>
                        </div>
                       )}
                       
                       {/* 에러 메시지 - 줄바꿈 없이 한줄로 */}
                       {task.status === "failed" && task.error && (
                           <div className="mt-0.5 grid grid-cols-1">
                               <div className="text-[11px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded flex items-center gap-1 min-w-0">
                                   <AlertCircle className="h-3 w-3 flex-shrink-0" />
                                   <span className="truncate" title={task.error}>
                                       {task.error}
                                   </span>
                               </div>
                           </div>
                       )}

                       {/* 로그 출력 (처리 중일 때만 표시) */}
                       {task.taskType === 'transcription' && task.status === "processing" && task.logs && task.logs.length > 0 && (
                           <div className="mt-1 border-t border-border/30 pt-1">
                               <div className="space-y-0.5 max-h-20 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/50">
                                   {task.logs.slice(-5).map((log, idx) => (
                                       <div key={idx} className="flex items-start gap-1.5 text-[10px] leading-tight">
                                           <span className="text-muted-foreground/60 flex-shrink-0 font-mono tabular-nums">
                                               {new Date(log.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                           </span>
                                           <span className={`flex-1 ${
                                               log.type === 'error' ? 'text-destructive' :
                                               log.type === 'success' ? 'text-green-500' :
                                               log.type === 'warning' ? 'text-yellow-500' :
                                               'text-foreground/70'
                                           }`}>
                                               {log.message}
                                           </span>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       )}

                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// 분석 결과 탭
function ResultsTab() {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      summary: "요약",
      highlights: "하이라이트",
      qa: "Q&A",
      custom: "커스텀",
    };
    return labels[method] || method;
  };

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          분석 결과
          <Badge variant="secondary" className="ml-1 text-xs">{results.length}</Badge>
        </h2>
      </div>

      <ScrollArea className="flex-1">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-center">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">분석 결과가 없습니다</h3>
            <p className="text-sm text-muted-foreground">
              스트림 로그를 분석하여 결과를 확인하세요
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
            {results.map((result) => (
              <Card key={result.id} className="cursor-pointer hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base line-clamp-2">
                        {result.vodTitle}
                      </CardTitle>
                      <CardDescription>{result.streamerName}</CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setSelectedResult(result);
                          setIsDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{getMethodLabel(result.analysisMethod)}</Badge>
                    <Badge variant="secondary">{result.provider}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(result.createdAt).toLocaleString("ko-KR")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* 결과 상세 다이얼로그 */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedResult?.vodTitle}</DialogTitle>
            <DialogDescription>
              {selectedResult?.streamerName} • {getMethodLabel(selectedResult?.analysisMethod || "")}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans">
                {selectedResult?.content}
              </pre>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              닫기
            </Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              다운로드
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 설정 탭
function SettingsTab() {
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [googleApiKey, setGoogleApiKey] = useState("");

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          설정
        </h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl space-y-8 p-1">
          {/* Ollama 설정 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Ollama 설정</h3>
              <p className="text-sm text-muted-foreground">
                로컬 AI 모델 실행을 위한 Ollama 설정
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Ollama 서버 주소</Label>
                <Input
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline">
                  연결 테스트
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href="https://ollama.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ollama 다운로드
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* OpenAI 설정 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">OpenAI 설정</h3>
              <p className="text-sm text-muted-foreground">
                GPT 모델 사용을 위한 OpenAI API 키
              </p>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          </div>

          <Separator />

          {/* Google AI 설정 */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Google AI 설정</h3>
              <p className="text-sm text-muted-foreground">
                Gemini 모델 사용을 위한 Google API 키
              </p>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="AIza..."
              />
            </div>
          </div>

          <div className="pb-4">
            <Button>설정 저장</Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
