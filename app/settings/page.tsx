"use client";

import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { FolderOpen, Monitor, Moon, Sun, Palette, Download, RefreshCcw, Info, KeyRound } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { ipcBridge, isElectron } from "@/lib/ipc-bridge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";

function SettingsContent() {
  const searchParams = useSearchParams();
  const isFirstTime = searchParams.get("firstTime") === "true";

  const { downloads, appSettings, setAppSettings, resetSettings } = useAppStore();
  const { setTheme } = useTheme();
  const [appVersion, setAppVersion] = useState<string>("v1.0.0");
  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued"
  ).length;

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [openaiOAuthStatus, setOpenaiOAuthStatus] = useState("확인 전");

  useEffect(() => {
    if (!isElectron) return;

    const cleanupStatus = ipcBridge.onUpdateStatus((status: any, info: any) => {
      setUpdateStatus(status);
      if (status === 'available' || status === 'downloaded') {
        setUpdateInfo(info);
      }
      if (status === 'error') {
        toast.error(`업데이트 오류: ${info}`);
      }
      if (status === 'downloaded') {
        toast.success("업데이트가 다운로드되었습니다. 다시 시작하여 설치하세요.");
      }
    });

    const cleanupProgress = ipcBridge.onUpdateProgress((percent: number) => {
      setUpdateProgress(percent);
      setUpdateStatus('downloading');
    });

    return () => {
      cleanupStatus();
      cleanupProgress();
    };
  }, []);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const { ipcBridge } = await import("@/lib/ipc-bridge");
        const version = await ipcBridge.getAppVersion();
        setAppVersion(`v${version}`);
      } catch (error) {
        console.error("Failed to fetch app version:", error);
      }
    };
    fetchVersion();
  }, []);

  const handleCheckForUpdates = async () => {
    if (!isElectron) {
      toast.error("Electron 환경이 아닙니다.");
      return;
    }

    try {
      setUpdateStatus('checking');
      await ipcBridge.checkForUpdates();
    } catch (error) {
      console.error(error);
      setUpdateStatus('error');
    }
  };

  const handleApplyUpdate = () => {
    ipcBridge.quitAndInstall();
  };

  const handleOpenAiOAuthLogin = async () => {
    if (!isElectron) {
      toast.error("Electron 환경이 아닙니다.");
      return;
    }

    try {
      const result = await ipcBridge.openOpenAiOAuthLogin({
        clientId: appSettings.openaiOAuthClientId,
        authorizationUrl: appSettings.openaiOAuthAuthorizationUrl,
        tokenUrl: appSettings.openaiOAuthTokenUrl,
      });
      if (result?.success) {
        setOpenaiOAuthStatus("인증됨");
        toast.success("OpenAI OAuth 인증이 완료되었습니다.");
      } else {
        setOpenaiOAuthStatus("실패");
        toast.error(result?.error || "OpenAI OAuth 인증에 실패했습니다.");
      }
    } catch (error: any) {
      setOpenaiOAuthStatus("실패");
      toast.error(error?.message || "OpenAI OAuth 인증에 실패했습니다.");
    }
  };

  const handleOpenAiOAuthStatus = async () => {
    const status = await ipcBridge.getOpenAiOAuthStatus();
    setOpenaiOAuthStatus(status.authenticated ? `인증됨 (${status.savedAt || "저장됨"})` : "인증 안 됨");
  };

  const handleOpenAiOAuthLogout = async () => {
    await ipcBridge.logoutOpenAiOAuth();
    setOpenaiOAuthStatus("인증 안 됨");
    toast.success("OpenAI OAuth 토큰을 삭제했습니다.");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-16 flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl p-8">


          <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight">설정</h1>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <Palette className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">일반</h2>
              </div>

              <div className="grid gap-4 rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-3">
                  <Label>테마</Label>
                  <RadioGroup
                    value={appSettings.theme}
                    onValueChange={(value: "light" | "dark" | "system") => {
                      setAppSettings({ theme: value });
                      setTheme(value);
                    }}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="light" id="theme-light" />
                      <Label htmlFor="theme-light" className="cursor-pointer">라이트</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="dark" id="theme-dark" />
                      <Label htmlFor="theme-dark" className="cursor-pointer">다크</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="system" id="theme-system" />
                      <Label htmlFor="theme-system" className="cursor-pointer">시스템</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">AI 인증</h2>
              </div>

              <div className="grid gap-4 rounded-xl border bg-card p-6 shadow-sm">
                <div className="space-y-1">
                  <div className="font-medium">OpenAI OAuth</div>
                  <p className="text-sm text-muted-foreground">
                    OpenAI 호환 OAuth 제공자의 PKCE 설정을 입력하고, 페르소나 추출에 사용할 기본 모델을 선택합니다.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>기본 모델</Label>
                  <Select
                    value={appSettings.openaiModel || "gpt-5.5"}
                    onValueChange={(value) => setAppSettings({ openaiModel: value })}
                  >
                    <SelectTrigger className="bg-background font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-5.5">gpt-5.5</SelectItem>
                      <SelectItem value="gpt-5.4">gpt-5.4</SelectItem>
                      <SelectItem value="gpt-5.4-mini">gpt-5.4-mini</SelectItem>
                      <SelectItem value="gpt-5.3-codex">gpt-5.3-codex</SelectItem>
                      <SelectItem value="gpt-5.2">gpt-5.2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>OAuth Client ID</Label>
                  <Input
                    value={appSettings.openaiOAuthClientId || ""}
                    onChange={(e) => setAppSettings({ openaiOAuthClientId: e.target.value })}
                    placeholder="client-id"
                    className="bg-background font-mono text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Authorization URL</Label>
                  <Input
                    value={appSettings.openaiOAuthAuthorizationUrl || ""}
                    onChange={(e) => setAppSettings({ openaiOAuthAuthorizationUrl: e.target.value })}
                    placeholder="https://..."
                    className="bg-background font-mono text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Token URL</Label>
                  <Input
                    value={appSettings.openaiOAuthTokenUrl || ""}
                    onChange={(e) => setAppSettings({ openaiOAuthTokenUrl: e.target.value })}
                    placeholder="https://..."
                    className="bg-background font-mono text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleOpenAiOAuthLogin}
                    disabled={!appSettings.openaiOAuthClientId || !appSettings.openaiOAuthAuthorizationUrl || !appSettings.openaiOAuthTokenUrl}
                  >
                    브라우저 인증
                  </Button>
                  <Button variant="outline" onClick={handleOpenAiOAuthStatus}>
                    상태 확인
                  </Button>
                  <Button variant="outline" onClick={handleOpenAiOAuthLogout}>
                    토큰 삭제
                  </Button>
                  <span className="text-xs text-muted-foreground">상태: {openaiOAuthStatus}</span>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <Download className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">다운로드</h2>
              </div>

              <div className={`grid gap-6 rounded-xl border bg-card p-6 shadow-sm transition-all duration-500 ${isFirstTime ? "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse" : ""
                }`}>
                {isFirstTime && (
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-primary mb-1">처음 오셨군요! 👋</p>
                        <p className="text-sm text-muted-foreground">
                          먼저 <strong className="text-foreground">기본 저장 경로</strong>를 설정해주세요.
                          다운로드한 영상과 채팅이 이 폴더에 저장됩니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className={`grid gap-2 ${isFirstTime ? "animate-in fade-in slide-in-from-left-2 duration-700 delay-300" : ""}`}>
                  <Label className={isFirstTime ? "text-primary font-bold" : ""}>
                    기본 저장 경로 {isFirstTime && <span className="text-primary">⬅️ 여기를 설정하세요!</span>}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={appSettings.downloadPath}
                      onChange={(e) => setAppSettings({ downloadPath: e.target.value })}
                      className="bg-background font-mono text-sm"
                      placeholder="폴더를 선택해주세요..."
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className={isFirstTime ? "animate-bounce" : ""}
                      onClick={async () => {
                        const path = await ipcBridge.selectDirectory(appSettings.downloadPath);
                        if (path) {
                          setAppSettings({ downloadPath: path });
                          if (isFirstTime) {
                            toast.success("저장 경로가 설정되었습니다! 이제 치지직 스크라이브를 사용할 준비가 되었습니다. 🎉");
                          }
                        }
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>
                    임시 작업 폴더
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (기본값: 저장 경로/.downloading)
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={appSettings.tempPath || ""}
                      onChange={(e) => setAppSettings({ tempPath: e.target.value })}
                      placeholder="기본값 사용"
                      className="bg-background font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        const defaultTempPath = appSettings.tempPath || (appSettings.downloadPath ? `${appSettings.downloadPath}\\.downloading` : undefined);
                        const path = await ipcBridge.selectDirectory(defaultTempPath);
                        if (path) setAppSettings({ tempPath: path });
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>
                    파일명 형식
                  </Label>
                  <Input
                    value={appSettings.filenameTemplate || "{title}"}
                    onChange={(e) => setAppSettings({ filenameTemplate: e.target.value })}
                    placeholder="{방송날짜}_{방송제목}"
                    className="bg-background font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    사용 가능: <code className="rounded bg-muted px-1">{`{title}`}</code>, <code className="rounded bg-muted px-1">{`{date}`}</code>, <code className="rounded bg-muted px-1">{`{streamer}`}</code>
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>섬네일 저장</Label>
                    <p className="text-xs text-muted-foreground">다운로드 시 가로형 섬네일(.jpg) 파일을 함께 저장합니다.</p>
                  </div>
                  <Switch
                    checked={appSettings.saveThumbnail || false}
                    onCheckedChange={(checked) => setAppSettings({ saveThumbnail: checked })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>최대 동시 다운로드</Label>
                  <Select
                    value={String(appSettings.concurrentDownloads)}
                    onValueChange={(value) =>
                      setAppSettings({ concurrentDownloads: parseInt(value) })
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <SelectItem key={num} value={String(num)}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <RefreshCcw className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">초기화</h2>
              </div>

              <div className="flex items-center justify-between rounded-xl border bg-card p-6 shadow-sm">
                <div className="space-y-1">
                  <div className="font-medium">설정 초기화</div>
                  <p className="text-sm text-muted-foreground">모든 설정을 기본값으로 되돌립니다.</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">초기화</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>설정을 초기화하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 작업은 되돌릴 수 없습니다. 확인을 누르면 모든 설정이 초기값으로 변경됩니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => resetSettings()}>초기화</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <Info className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium">정보</h2>
              </div>

              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 text-sm text-muted-foreground">
                  <div>
                    <p className="text-base font-semibold text-foreground">치지직 스크라이브 (Chzzk Scribe) {appVersion}</p>
                    <p className="mt-1">치지직의 다시보기 및 채팅 다운로드를 위한 강력한 도구입니다. 치지직 스크라이브는 어떠한 정보도 외부로 전송하지 않습니다.</p>
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">업데이트 확인</p>
                        <p className="text-xs text-muted-foreground">
                          {updateStatus === 'idle' && "새 버전이 있는지 확인합니다."}
                          {updateStatus === 'checking' && "업데이트를 확인 중입니다..."}
                          {updateStatus === 'available' && `새로운 버전(${updateInfo?.version || ""})이 있습니다!`}
                          {updateStatus === 'not-available' && "현재 최신 버전을 사용 중입니다."}
                          {updateStatus === 'downloading' && `업데이트 다운로드 중... (${updateProgress.toFixed(0)}%)`}
                          {updateStatus === 'downloaded' && "업데이트 다운로드 완료. 지금 설치하시겠습니까?"}
                          {updateStatus === 'error' && "업데이트 확인 중 오류가 발생했습니다."}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {updateStatus === 'downloaded' ? (
                          <Button size="sm" onClick={handleApplyUpdate}>설치 및 재시작</Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCheckForUpdates}
                            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                          >
                            {updateStatus === 'checking' ? (
                              <>
                                <RefreshCcw className="mr-2 h-3 w-3 animate-spin" />
                                확인 중
                              </>
                            ) : "지금 확인"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {updateStatus === 'downloading' && (
                      <Progress value={updateProgress} className="h-1.5" />
                    )}
                  </div>

                  <div className="space-y-2 border-t pt-4">
                    <div className="flex gap-2">
                      <span className="w-16 font-medium text-foreground">개발자</span>
                      <span>강헉스</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 font-medium text-foreground">메일</span>
                      <span>amuro33@naver.com</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="w-16 font-medium text-foreground">GitHub</span>
                      <a
                        href="#"
                        className="text-primary underline hover:text-primary/80"
                        onClick={(e) => {
                          e.preventDefault();
                          ipcBridge.openExternal("https://github.com/amuro33/chzzk-scribe");
                        }}
                      >
                        github.com/amuro33/chzzk-scribe
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main >
    </div >
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-background">
        <AppSidebar />
        <main className="ml-16 flex-1 overflow-auto">
          <div className="mx-auto max-w-2xl p-8">
            <div className="space-y-6">
              <h1 className="text-2xl font-bold tracking-tight">설정</h1>
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          </div>
        </main>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
