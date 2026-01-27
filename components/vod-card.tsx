import { useState } from "react";
import { Download, MessageSquare, Clock, Check, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppStore, type VOD } from "@/lib/store";
import { cn } from "@/lib/utils";

interface VODCardProps {
  vod: VOD;
  onDownload: (vod: VOD, resolution: string) => void;
  onChatDownload: (vod: VOD) => void;
  isCompact?: boolean;
}

export function VODCard({ vod, onDownload, onChatDownload, isCompact = false }: VODCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { naverCookies, setNaverCookies, downloads, downloadHistory } = useAppStore();

  const isVideoDownloaded = [...downloads, ...downloadHistory].some(
    (d) => d.vodId === vod.id && d.type === 'video' && d.status === 'completed'
  );

  // Dialog States
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [showEnvAlert, setShowEnvAlert] = useState(false);

  // Pending action state to resume after login
  const [pendingAction, setPendingAction] = useState<{ type: 'video' | 'chat', resolution?: string } | null>(null);

  const startDownload = (type: 'video' | 'chat', resolution?: string) => {
    if (type === 'video' && resolution) {
      onDownload(vod, resolution);
    } else {
      onChatDownload(vod);
    }
  };

  const handleDownloadClick = async (type: 'video' | 'chat', resolution?: string) => {
    // 1. Check if adult content and not logged in
    if (vod.adult && !naverCookies) {
      if (typeof window !== 'undefined' && (window as any).electron) {
        // Show custom confirmation dialog
        setPendingAction({ type, resolution });
        setShowLoginConfirm(true);
      } else {
        // Electron not available (browser mode)
        setShowEnvAlert(true);
      }
      return;
    }

    // 2. Normal flow
    startDownload(type, resolution);
  };

  const handleLoginConfirm = async () => {
    try {
      const cookies = await (window as any).electron.openNaverLogin();
      if (cookies) {
        setNaverCookies(cookies);
        // Proceed with pending action
        if (pendingAction) {
          startDownload(pendingAction.type, pendingAction.resolution);
          setPendingAction(null);
        }
      } else {
        // Login cancelled or failed
        setPendingAction(null);
      }
    } catch (e) {
      console.error("Login failed", e);
      setPendingAction(null);
    }
  };

  const estimatedSize = (resolution: string) => {
    const bitrateMap: Record<string, number> = {
      "1080p": 6,
      "720p": 3,
      "480p": 1.5,
    };
    const bitrate = bitrateMap[resolution] || 3;
    const sizeGB = (vod.durationSeconds * bitrate) / 8 / 1024;
    return sizeGB >= 1 ? `${sizeGB.toFixed(1)} GB` : `${(sizeGB * 1024).toFixed(0)} MB`;
  };

  return (
    <>
      <div
        className={`group relative flex flex-col gap-0 rounded-xl border bg-card transition-all duration-200 ${isHovered ? "border-primary/60 shadow-xl shadow-primary/10" : "shadow-lg shadow-black/20"
          } border-border`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-t-xl bg-secondary">
          {vod.thumbnailUrl ? (
            <img
              src={vod.thumbnailUrl}
              alt={vod.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary/80">
              <Video className="h-10 w-10 text-muted-foreground/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
          {vod.adult && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] z-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-zinc-500 bg-black/50 text-zinc-100 font-bold text-xl mb-2">
                19
              </div>
              <span className="text-zinc-200 text-sm font-semibold">연령 제한</span>
            </div>
          )}

          <div className="absolute bottom-2 right-2 rounded-md bg-black/80 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm z-20">
            {vod.duration}
          </div>

        </div>

        <div className="flex flex-1 flex-col justify-between gap-3 p-4">
          <div>
            <div className="mb-2 flex items-start gap-2">
              <h3 className="line-clamp-2 flex-1 font-semibold text-foreground leading-snug text-sm">
                {vod.title}
              </h3>
              {vod.isNew && (
                <Badge variant="outline" className="shrink-0 border-primary text-primary font-bold text-[10px] px-1.5 h-5">
                  NEW
                </Badge>
              )}

            </div>
            <p className="text-xs text-muted-foreground font-medium mb-1">{vod.date}</p>
            <p className="text-xs text-muted-foreground">{vod.streamerName}</p>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className={cn(
                    "relative h-8 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/30 font-semibold text-xs",
                    isCompact ? "px-0 gap-0" : "gap-1.5"
                  )}
                  title={isCompact ? "비디오 다운로드" : undefined}
                >
                  <Download className="h-3.5 w-3.5" />
                  {!isCompact && "비디오"}

                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-popover border-border shadow-xl">
                {vod.resolutions.map((res) => (
                  <DropdownMenuItem
                    key={res}
                    onClick={() => handleDownloadClick('video', res)}
                    className="flex justify-between cursor-pointer"
                  >
                    <span className="font-medium">{res}</span>
                    <span className="text-muted-foreground text-xs">
                      ~{estimatedSize(res)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className={cn(
                "h-8 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/30 font-semibold text-xs",
                isCompact ? "px-0 gap-0" : "gap-1.5"
              )}
              onClick={() => handleDownloadClick('chat')}
              title={isCompact ? "채팅 다운로드" : undefined}
            >
              <Download className="h-3.5 w-3.5" />
              {!isCompact && "채팅"}
            </Button>
          </div>
        </div>
      </div>

      {/* Login Confirmation Dialog */}
      <AlertDialog open={showLoginConfirm} onOpenChange={setShowLoginConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>성인 인증이 필요합니다</AlertDialogTitle>
            <AlertDialogDescription>
              이 영상은 연령 제한이 걸려있습니다.
              <br />
              다운로드를 계속하려면 네이버 로그인이 필요합니다.
              <br className="mb-2" />
              <span className="text-xs text-muted-foreground block mt-2">
                * 로그인 정보는 사용자 PC에만 저장되며 외부로 전송되지 않습니다.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleLoginConfirm}>로그인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Environment Alert Dialog */}
      <AlertDialog open={showEnvAlert} onOpenChange={setShowEnvAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>환경 제한</AlertDialogTitle>
            <AlertDialogDescription>
              Electron 환경에서만 연령 제한 영상 및 채팅 다운로드가 가능합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
