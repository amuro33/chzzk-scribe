"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Plus, Video, Download, AlertCircle, CheckCircle2, Trash2, Loader2, StopCircle } from "lucide-react";
import type { WhisperModel, WhisperEngine } from "@/types/analysis";
import { ipcBridge } from "@/lib/ipc-bridge";
import { useAppStore } from "@/lib/store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddStreamLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: {
    vodId: string;
    videoPath: string;
    vodUrl?: string;
    whisperModel: string;
    whisperEngine: string;
  }) => void;
}

export function AddStreamLogDialog({
  open,
  onOpenChange,
  onConfirm,
}: AddStreamLogDialogProps) {
  const { downloads } = useAppStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<"saved" | "local">("saved");
  const [savedVods, setSavedVods] = useState<any[]>([]);
  const [selectedVod, setSelectedVod] = useState<any | null>(null);
  
  // 로컬 비디오 추가
  const [localVideoPath, setLocalVideoPath] = useState("");
  const [vodUrl, setVodUrl] = useState("");
  
  // Whisper 설정
  const [whisperModels, setWhisperModels] = useState<WhisperModel[]>([
    { id: "tiny", name: "Tiny", size: "~75 MB", downloaded: false },
    { id: "base", name: "Base", size: "~145 MB", downloaded: false },
    { id: "small", name: "Small", size: "~488 MB", downloaded: false },
    { id: "medium", name: "Medium", size: "~1.5 GB", downloaded: false },
    { id: "large-v2", name: "Large-v2", size: "~3.0 GB", downloaded: false },
  ]);

  const modelInfo: Record<string, { vram: string; time: string; desc: string }> = {
    tiny: { vram: "약 400 MB", time: "약 15초 (60분 기준, GPU)", desc: "고속, 낮은 정확도" },
    base: { vram: "약 600 MB", time: "약 20초 (60분 기준, GPU)", desc: "고속, 기본 정확도" },
    small: { vram: "약 1.2 GB", time: "약 30초 (60분 기준, GPU)", desc: "빠르고 정확함 (추천)" },
    medium: { vram: "약 3.0 GB", time: "약 1분 (60분 기준, GPU)", desc: "매우 정확함" },
    "large-v2": { vram: "약 5.0 GB", time: "약 1분 30초 (60분 기준, GPU)", desc: "최고 정확도" },
  };

  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('whisper-last-model') || "";
    }
    return "";
  });
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('whisper-last-engine') || "faster-whisper";
    }
    return "faster-whisper";
  });
  
  const [engines, setEngines] = useState<WhisperEngine[]>([
    { id: "faster-whisper", name: "Faster-Whisper (Python + GPU)", available: false },
  ]);

  const [engineInstalled, setEngineInstalled] = useState(false);
  const [installingEngine, setInstallingEngine] = useState(false);
  const [engineInstallProgress, setEngineInstallProgress] = useState(0);

  // faster-whisper는 사용자가 직접 다운로드해야 함
  const isEngineDownloadable = (engineId: string) => engineId === "faster-whisper";

  const engineInfo: Record<string, string> = {
    "faster-whisper": "NVIDIA GPU 최적화 엔진 (CPU도 지원, 가장 빠름)",
  };

  const [downloading, setDownloading] = useState<Record<string, number>>({});

  const handleModelSelect = (modelId: string) => {
    setSelectedModel(modelId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('whisper-last-model', modelId);
    }
  };

  const handleEngineSelect = (engineId: string) => {
    setSelectedEngine(engineId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('whisper-last-engine', engineId);
    }
  };

   const refreshEngineStatus = async () => {
    if (!selectedEngine) return;
    const status = await ipcBridge.getEngineStatus(selectedEngine);
    if (status) {
      const installed = status.installed === true;
      setEngineInstalled(installed);
      setEngines(prev => prev.map(e => e.id === selectedEngine ? { ...e, available: installed } : e));
    }
   };

   const refreshStatus = async (targetEngineId?: string) => {
    const eid = targetEngineId || selectedEngine;
    if (!eid) return;
    const status = await ipcBridge.getWhisperStatus(eid);
    if (status) {
         setEngines(prev => prev.map(e => e.id === eid ? { ...e, available: status.isEngineReady } : e));
         // 현재 선택된 엔진인 경우에만 모델 상태 업데이트 (다른 엔진 상태 조회 시 모델 목록 덮어쓰기 방지)
         if (eid === selectedEngine) {
             setWhisperModels(prev => prev.map(m => {
                 const mStatus = status.models?.[m.id];
                 // 다운로드 중인 모델은 상태 업데이트를 건드리지 않음 (UI 깜빡임 방지)
                 if (downloading[m.id] !== undefined) {
                     return m;
                 }
                 return mStatus ? { ...m, downloaded: mStatus.downloaded } : m;
             }));
         }
    }
   };

  useEffect(() => {
    if (open && step === 2 && selectedEngine) {
        refreshEngineStatus();
        refreshStatus(selectedEngine);
    }
  }, [open, step, selectedEngine]);

  useEffect(() => {
    const cleanup = ipcBridge.onDownloadProgress(({ type, engineId, modelId, progress, error }) => {
        // progress가 없는 이벤트(예: downloadedBytes 업데이트)는 무시하여 상태 초기화 방지
        if (typeof progress === 'undefined' && !error) return;

        const key = type === 'model' ? modelId : engineId;
        if (progress === -1 || error) {
            // 다운로드 실패
            setDownloading(prev => {
                const next = { ...prev };
                delete next[key!];
                return next;
            });
            setTimeout(() => refreshStatus(engineId), 100);
        } else if (progress >= 1) {
             // 다운로드 완료 - 상태 제거 후 모델 목록 새로고침
             setDownloading(prev => {
                 const next = { ...prev };
                 delete next[key!];
                 return next;
             });
             // 상태 업데이트 완료 후 모델 상태 새로고침
             setTimeout(() => refreshStatus(engineId), 100);
        } else {
             setDownloading(prev => ({ ...prev, [key!]: progress }));
        }
    });
    return cleanup;
  }, [selectedEngine]);

  useEffect(() => {
    const cleanup = ipcBridge.onEngineInstallProgress(({ engineId, progress, error }) => {
        if (progress === -1 || error) {
            // 설치 실패
            setInstallingEngine(false);
            setEngineInstallProgress(0);
            alert(`엔진 설치 실패: ${error || '알 수 없는 오류'}`);
        } else if (progress >= 1) {
            // 설치 완료
            setInstallingEngine(false);
            setEngineInstallProgress(0);
            setTimeout(() => refreshEngineStatus(), 100);
        } else {
            setEngineInstallProgress(progress);
        }
    });
    return cleanup;
  }, [selectedEngine]);

  // 다이얼로그가 열릴 때 스텝 초기화
  useEffect(() => {
    if (open) {
      setStep(1);
    }
  }, [open]);

  // VOD 목록 불러오기
  useEffect(() => {
    const completedVideos = downloads
      .filter((d) => d.status === "completed" && d.type === "video")
      .map((d) => ({
        videoId: d.vodId,
        title: d.title,
        thumbnailUrl: d.thumbnailUrl,
        videoPath: d.savePath ? `${d.savePath}\\${d.fileName}` : `${d.folderPath}\\${d.fileName}`,
        downloadedDate: d.timestamp,
        streamerName: d.streamerName,
      }))
      // 중복 제거 (vodId 기준) - optional
      .filter((v, i, a) => a.findIndex(t => t.videoId === v.videoId) === i)
      // 최근 다운로드된 항목이 위로 오도록 정렬
      .sort((a, b) => {
        const timeA = a.downloadedDate ? new Date(a.downloadedDate).getTime() : 0;
        const timeB = b.downloadedDate ? new Date(b.downloadedDate).getTime() : 0;
        return timeB - timeA;
      });

    setSavedVods(completedVideos);
  }, [downloads]);

  const handleSelectLocalVideo = async () => {
    const filePath = await ipcBridge.selectFile([{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]);
    if (filePath) {
      setLocalVideoPath(filePath);
    }
  };

  const canProceedToStep2 = () => {
    if (activeTab === "saved") {
      return !!selectedVod;
    } else {
      // 로컬 동영상 선택 시 파일과 VOD 주소 모두 필수
      return !!localVideoPath && !!vodUrl;
    }
  };

  const handleDownloadResource = async (type: 'model' | 'engine', id: string) => {
    if (type === 'engine') {
      // 엔진 설치
      setInstallingEngine(true);
      setEngineInstallProgress(0);
      try {
        const result = await ipcBridge.installWhisperEngine(id);
        if (!result.success) {
          alert(`엔진 설치 실패: ${result.error}`);
          setInstallingEngine(false);
        }
      } catch (err: any) {
        alert(`엔진 설치 중 오류: ${err.message}`);
        setInstallingEngine(false);
      }
    } else {
      // 모델 다운로드
      setDownloading(prev => ({ ...prev, [id]: 0.01 })); // Optimistic update
      // 다운로드 시작 시 해당 모델의 downloaded 상태를 false로 설정하여 UI 깜빡임 방지
      setWhisperModels(prev => prev.map(m => m.id === id ? { ...m, downloaded: false } : m));
      await ipcBridge.downloadWhisperResource(type, selectedEngine, id);
    }
  };

  const handleDeleteResource = async (type: 'model' | 'engine', id: string) => {
    if (!confirm("정말 삭제하시겠습니까? 다운로드된 파일이 영구적으로 삭제됩니다.")) return;
    await ipcBridge.deleteWhisperResource(type, selectedEngine, type === 'model' ? id : undefined);
    refreshStatus(selectedEngine);
  };

  const canCreate = () => {
    if (!selectedModel || !selectedEngine) return false;
    if (!engineInstalled) return false;
    const selectedModelInfo = whisperModels.find(m => m.id === selectedModel);
    return selectedModelInfo?.downloaded === true;
  };

  const handleCreate = async () => {
    if (!canCreate()) return;

    if (activeTab === "saved") {
      let finalVideoPath = selectedVod.videoPath;
      
      // 경로 자동 보정 (파일이 없으면 스트리머 이름 폴더 체크)
      const exists = await ipcBridge.checkFileExists(finalVideoPath);
      if (!exists && selectedVod.streamerName) {
         // 경로 분해
         // 예: C:\Downloads\Chzzk\영상.mp4 -> C:\Downloads\Chzzk\스트리머\영상.mp4
         // 가정: videoPath는 folderPath + fileName 으로 구성되어 있음
         // folderPath가 스트리머 폴더를 포함하지 않았을 가능성 체크
         
         const parts = finalVideoPath.split(/[/\\]/);
         const fileName = parts.pop();
         const folderPath = parts.join('\\');
         
         // 단순하게 스트리머 이름을 삽입해본다. 
         // 주의: 스트리머 이름도 sanitization이 필요할 수 있음 (VideoDownloader와 동일하게)
         // 하지만 여기선 정확한 로직보다 '혹시 여기 있나?' 체크
         
         // 1. 스트리머 폴더명 추측 (VideoDownloader가 사용하는 방식: replace(/[<>:"/\\|?*]/g, ""))
         const safeStreamerName = selectedVod.streamerName.replace(/[<>:"/\\|?*]/g, "");
         const alternativePath = `${folderPath}\\${safeStreamerName}\\${fileName}`;
         
         const altExists = await ipcBridge.checkFileExists(alternativePath);
         if (altExists) {
             console.log(`[AddStreamLog] Found file at alternative path: ${alternativePath}`);
             finalVideoPath = alternativePath;
         }
      }

      onConfirm({
        vodId: selectedVod.videoId,
        videoPath: finalVideoPath,
        whisperModel: selectedModel,
        whisperEngine: selectedEngine,
      });
    } else {
      onConfirm({
        vodId: "",
        videoPath: localVideoPath,
        vodUrl: vodUrl,
        whisperModel: selectedModel,
        whisperEngine: selectedEngine,
      });
    }
    
    onOpenChange(false);
  };

  const getTitleInfo = () => {
    if (step === 2) {
      if (activeTab === "saved" && selectedVod) {
        return <span className="text-xs font-normal text-muted-foreground ml-2 italic">[{selectedVod.title}] 선택됨</span>;
      } else if (activeTab === "local" && localVideoPath) {
        const fileName = localVideoPath.split(/[/\\]/).pop();
        return <span className="text-xs font-normal text-muted-foreground ml-2 italic">[{fileName}] 선택됨</span>;
      }
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 7a9.3 9.3 0 0 0 1.516 -.546c.911 -.438 1.494 -1.015 1.937 -1.932c.207 -.428 .382 -.928 .547 -1.522c.165 .595 .34 1.095 .547 1.521c.443 .918 1.026 1.495 1.937 1.933c.426 .205 .925 .38 1.516 .546a9.3 9.3 0 0 0 -1.516 .547c-.911 .438 -1.494 1.015 -1.937 1.932a9 9 0 0 0 -.547 1.521c-.165 -.594 -.34 -1.095 -.547 -1.521c-.443 -.918 -1.026 -1.494 -1.937 -1.932a9 9 0 0 0 -1.516 -.547" /><path d="M3 14a21 21 0 0 0 1.652 -.532c2.542 -.953 3.853 -2.238 4.816 -4.806a20 20 0 0 0 .532 -1.662a20 20 0 0 0 .532 1.662c.963 2.567 2.275 3.853 4.816 4.806q .75 .28 1.652 .532a21 21 0 0 0 -1.652 .532c-2.542 .953 -3.854 2.238 -4.816 4.806a20 20 0 0 0 -.532 1.662a20 20 0 0 0 -.532 -1.662c-.963 -2.568 -2.275 -3.853 -4.816 -4.806a21 21 0 0 0 -1.652 -.532" /></svg>
              스트림 로그 생성
            </div>
            {getTitleInfo()}
          </DialogTitle>
        </DialogHeader>
    <div className="flex flex-col h-[70vh] min-h-[500px]">
      <div className="flex items-center justify-between px-8 py-6">
        <div className="flex flex-col items-center gap-2 relative z-10">
          <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${step >= 1 ? "border-primary bg-primary text-primary-foreground shadow-md scale-110" : "border-muted-foreground text-muted-foreground bg-background"}`}>
            {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
          </div>
          <span className={`text-xs font-medium absolute -bottom-5 w-20 text-center transition-colors duration-300 ${step >= 1 ? "text-primary" : "text-muted-foreground"}`}>VOD 선택</span>
        </div>
        
        <div className="flex-1 h-[2px] bg-muted mx-4 relative">
            <div className={`absolute inset-0 bg-primary transition-all duration-500 origin-left ${step >= 2 ? "scale-x-100" : "scale-x-0"}`} />
        </div>

        <div className="flex flex-col items-center gap-2 relative z-10">
          <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${step >= 2 ? "border-primary bg-primary text-primary-foreground shadow-md scale-110" : "border-muted-foreground text-muted-foreground bg-background"}`}>
             {step === 2 && canCreate() ? <CheckCircle2 className="h-4 w-4" /> : "2"}
          </div>
          <span className={`text-xs font-medium absolute -bottom-5 w-24 text-center transition-colors duration-300 ${step >= 2 ? "text-primary" : "text-muted-foreground"}`}>Whisper 설정</span>
        </div>

        <div className="flex-1 h-[2px] bg-muted mx-4 relative">
            <div className={`absolute inset-0 bg-primary transition-all duration-500 origin-left ${step === 2 && canCreate() ? "scale-x-100" : "scale-x-0"}`} />
        </div>

        <div className="flex flex-col items-center gap-2 relative z-10">
          <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300 ${step === 2 && canCreate() ? "border-primary bg-primary text-primary-foreground shadow-md scale-110" : "border-muted-foreground text-muted-foreground bg-background"}`}>
            3
          </div>
          <span className={`text-xs font-medium absolute -bottom-5 w-20 text-center transition-colors duration-300 ${step === 2 && canCreate() ? "text-primary" : "text-muted-foreground"}`}>생성 대기</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden mt-4">
        {step === 1 ? (
          <div className="h-full flex flex-col space-y-4">
            <div className="pt-2">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "saved" | "local")} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-secondary/30 border border-border/50 h-12 p-1">
                  <TabsTrigger value="saved" className="gap-2 h-10 data-[state=active]:bg-background data-[state=active]:text-primary">
                    나의 VOD
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/15 text-[10px] font-bold">
                      {savedVods.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="local" className="h-10 data-[state=active]:bg-background data-[state=active]:text-primary">로컬 동영상</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            
            {activeTab === "saved" && (
              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full w-full rounded-md border bg-muted/10" type="always">
                  <div className="p-1 space-y-0.5">
                    {savedVods.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-[200px] text-center">
                        <Video className="h-10 w-10 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          나의 VOD가 없습니다
                        </p>
                      </div>
                    ) : (
                      savedVods.map((vod) => (
                        <div
                          key={vod.videoId}
                          className={`flex items-center gap-2 p-1.5 cursor-pointer transition-all rounded-md border ${
                            selectedVod?.videoId === vod.videoId 
                              ? "bg-primary/20 border-primary/50 shadow-sm" 
                              : "hover:bg-accent/50 border-transparent hover:border-border/50"
                          }`}
                          onClick={() => setSelectedVod(vod)}
                        >
                          <div className="relative h-12 aspect-video flex-shrink-0 rounded overflow-hidden bg-background border shadow-sm">
                            {vod.thumbnailUrl ? (
                              <img
                                src={vod.thumbnailUrl}
                                alt={vod.title}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                               <div className="flex h-full w-full items-center justify-center bg-muted">
                                 <Video className="h-4 w-4 text-muted-foreground/50" />
                               </div>
                            )}
                          </div>
                          
                          <div className="flex flex-col justify-center flex-1 min-w-0">
                            <h4 className={`text-sm font-medium truncate leading-tight ${
                              selectedVod?.videoId === vod.videoId ? "text-primary" : "text-foreground"
                            }`}>
                              {vod.title}
                            </h4>
                            <div className="flex items-center text-xs text-muted-foreground gap-1.5 mt-0.5 w-full">
                              <span className="truncate max-w-[100px] flex-shrink-1 font-medium text-foreground/70">
                                {vod.streamerName || "Unknown"}
                              </span>
                              <span className="text-[10px] opacity-30 flex-shrink-0">•</span>
                              <span className="flex-shrink-0 whitespace-nowrap opacity-70">
                                {vod.downloadedDate 
                                  ? new Date(vod.downloadedDate).toLocaleDateString() 
                                  : new Date().toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {activeTab === "local" && (
              <div className="flex-1 space-y-4">
                <div className="rounded-lg border border-dashed p-6 text-center space-y-4 hover:bg-accent/5 transition-colors">
                  <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Video className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">로컬 동영상 파일 선택</p>
                    <p className="text-xs text-muted-foreground">PC에 저장된 동영상 파일을 직접 선택하세요</p>
                  </div>
                  <div className="flex gap-2 max-w-sm mx-auto">
                    <Input
                      value={localVideoPath}
                      placeholder="파일이 선택되지 않았습니다"
                      readOnly
                      className="text-xs h-9 bg-background"
                    />
                    <Button onClick={handleSelectLocalVideo} size="sm" variant="secondary" className="h-9">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      찾아보기
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground ml-1">VOD 주소 (채팅 로그용)</Label>
                  <Input
                    value={vodUrl}
                    onChange={(e) => setVodUrl(e.target.value)}
                    placeholder="https://chzzk.naver.com/video/..."
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full bg-muted/5 rounded-lg border">
            <div className="p-4 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground/80">인식 엔진</Label>
                </div>
                <div className="rounded-md border bg-background shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 text-xs w-[200px]">엔진</TableHead>
                        <TableHead className="h-8 text-xs text-center w-[80px]">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engines.map((engine) => (
                        <TableRow 
                          key={engine.id} 
                          className={`cursor-pointer h-12 ${selectedEngine === engine.id ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"}`}
                          onClick={() => engine.available && handleEngineSelect(engine.id)}
                        >
                          <TableCell className="font-medium py-2">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2.5">
                                <div className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${selectedEngine === engine.id ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                                  {selectedEngine === engine.id && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                                </div>
                                <span className={`text-sm ${!engine.available && "text-muted-foreground"}`}>{engine.name}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground pl-6">
                                {engineInfo[engine.id]}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            {installingEngine && engine.id === selectedEngine ? (
                              <div className="w-[120px] mx-auto space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                    설치 중...
                                  </span>
                                  <span className="font-mono">{(engineInstallProgress * 100).toFixed(0)}%</span>
                                </div>
                                <Progress value={engineInstallProgress * 100} className="h-1.5" />
                              </div>
                            ) : engine.available ? (
                              <div className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                <span>준비됨</span>
                              </div>
                            ) : isEngineDownloadable(engine.id) ? (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-6 text-[10px] px-2 gap-1.5 hover:bg-primary hover:text-primary-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadResource('engine', engine.id);
                                }}
                              >
                                <Download className="h-3 w-3" />
                                엔진 설치
                              </Button>
                            ) : (
                              <div className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                <AlertCircle className="h-2.5 w-2.5" />
                                <span>미설치</span>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground/80">Whisper 모델</Label>
                </div>
                <div className="rounded-md border bg-background shadow-sm overflow-hidden">
                  <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[120px] h-9 text-xs">모델</TableHead>
                      <TableHead className="h-9 text-xs">용량</TableHead>
                      <TableHead className="h-9 text-xs">스펙</TableHead>
                      <TableHead className="h-9 text-xs">특징</TableHead>
                      <TableHead className="h-9 text-xs text-center w-[120px]">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whisperModels.map((model) => (
                      <TableRow 
                        key={model.id} 
                        className={`cursor-pointer h-12 ${selectedModel === model.id ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"}`}
                        onClick={() => handleModelSelect(model.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${selectedModel === model.id ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                              {selectedModel === model.id && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                            </div>
                            <span className="text-sm">{model.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {model.size}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-[10px] text-muted-foreground gap-0.5">
                            <span>VRAM: {modelInfo[model.id]?.vram}</span>
                            <span>예상작업시간: {modelInfo[model.id]?.time}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {modelInfo[model.id]?.desc}
                        </TableCell>
                        <TableCell className="text-center">
                           {downloading[model.id] !== undefined ? (
                                <div className="w-[120px] mx-auto space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                                    <span className="flex items-center gap-1">
                                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      다운로드 중...
                                    </span>
                                    <span className="font-mono">{(downloading[model.id] * 100).toFixed(0)}%</span>
                                  </div>
                                  <Progress value={downloading[model.id] * 100} className="h-1.5" />
                                </div>
                           ) : model.downloaded ? (
                            <div className="group relative flex justify-center h-6 w-full items-center">
                                <div className="absolute transition-opacity group-hover:opacity-0 inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                    <span>준비됨</span>
                                </div>
                                <Button
                                    size="sm" variant="ghost"
                                    className="h-6 text-[10px] px-2 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity absolute text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteResource('model', model.id);
                                    }}
                                >
                                     <Trash2 className="h-3 w-3" />
                                     제거
                                </Button>
                            </div>
                           ) : (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="h-6 text-[10px] px-2 gap-1.5 hover:bg-primary hover:text-primary-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadResource('model', model.id);
                                }}
                              >
                                <Download className="h-3 w-3" />
                                다운로드
                              </Button>
                           )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        {step === 1 ? (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canProceedToStep2()} className="px-6">
              다음
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep(1)}>
              이전
            </Button>
             <Button onClick={handleCreate} disabled={!canCreate()} className="px-6">
              생성하기
            </Button>
          </>
        )}
      </div>
    </div>
      </DialogContent>
    </Dialog>
  );
}
