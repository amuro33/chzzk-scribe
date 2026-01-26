"use client";

import {
  Video,
  MessageSquare,
  Pause,
  Play,
  X,
  FolderOpen,
  RotateCcw,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw, // Adding RefreshCw just in case, but RotateCcw is good for retry.
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { DownloadItem as DownloadItemType } from "@/lib/store";

interface DownloadItemProps {
  item: DownloadItemType;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onOpenFolder: () => void;
  onDownloadChat?: () => void;
  onConvert?: () => void;
  onConvertChat?: () => void;
  hasSubtitle?: boolean;
  matchColor?: string;
  relatedChatItem?: DownloadItemType;
}

export function DownloadItem({
  item,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpenFolder,
  onDownloadChat,
  onConvert,
  onConvertChat,
  hasSubtitle,
  matchColor,
  relatedChatItem
}: DownloadItemProps) {
  const getProgressColor = () => {
    switch (item.status) {
      case "downloading":
        return "bg-primary";
      case "paused":
        return "bg-warning";
      case "completed":
        return "bg-success";
      case "converting":
        return "bg-purple-500 animate-pulse";
      case "failed":
        return "bg-destructive";
      default:
        return "bg-muted";
    }
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-xl hover:border-primary/50 h-full",
      )}
    >
      {/* Thumbnail Section */}
      <div className="relative aspect-video w-full bg-secondary/50 overflow-hidden">
        {item.thumbnailUrl ? (
          <>
            <img
              src={item.thumbnailUrl}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

            {/* Badges Overlay */}
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
              {item.duration && (
                <div className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {item.duration}
                </div>
              )}
              {item.resolution && (
                <div className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
                  {item.resolution}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center relative">
            {item.type === "video" ? (
              <Video className="h-10 w-10 text-primary/50" />
            ) : (
              <MessageSquare className="h-10 w-10 text-accent/50" />
            )}
          </div>
        )}

        {/* Top Right Badges - Always Visible */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
          {(item.type === 'chat' && item.chatCount) || (relatedChatItem?.chatCount) ? (
            <div className="rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground backdrop-blur-md flex items-center gap-1 shadow-sm">
              <MessageSquare className="h-3 w-3" />
              {(item.chatCount || relatedChatItem?.chatCount)?.toLocaleString()}
            </div>
          ) : null}
        </div>

        {/* ... Status Overlay ... */}




        {/* Status Overlay (Active Downloads) */}
        {item.status !== "completed" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="text-center text-white">
              {item.status === "converting" ? (
                <>
                  <div className="font-bold text-lg animate-pulse">Converting...</div>
                  <div className="text-xs opacity-80">Finalizing video</div>
                </>
              ) : (
                <>
                  {/* Show percentage if available, otherwise show downloaded size */}
                  <div className="font-bold text-lg">
                    {item.progress > 0 ? `${item.progress}%` : (
                      item.downloadedSize && item.downloadedSize !== "0" && item.downloadedSize !== "0 B" && item.downloadedSize !== "0 MB"
                        ? item.downloadedSize
                        : "준비 중..." // "Starting..." in Korean
                    )}
                  </div>
                  <div className="text-xs opacity-80">
                    {item.progress === 0 && (item.downloadedSize === "0" || item.downloadedSize === "0 B") ? "" : (item.speed !== "-" ? item.speed : "")}
                  </div>
                  <div className="text-xs opacity-80">
                    {item.progress === 0 ? "" : (item.eta !== "-" ? `ETA: ${item.eta}` : "")}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar (Active) - Slim line at bottom of thumbnail */}
      {
        item.status !== "completed" && (
          <Progress
            value={item.progress}
            className="h-1 w-full bg-secondary rounded-none"
            indicatorClassName={cn(getProgressColor(), "rounded-none")}
          />
        )
      }

      {/* Content Section */}
      {/* Content Section */}
      {/* Content Section */}
      <div className="flex flex-1 flex-col p-3 relative">
        {matchColor && (
          <div
            className="absolute left-0 top-4 w-2 h-2 shadow-sm"
            style={{ backgroundColor: matchColor }}
          />
        )}
        <div className="flex flex-col gap-1 mb-1">
          <div className="flex items-center">
            <h3 className="font-semibold text-foreground text-sm truncate" title={item.fileName}>
              {item.fileName}
            </h3>
          </div>
        </div>

        <div className="mt-auto pt-2 flex items-end justify-between text-xs text-muted-foreground">
          <div className="flex flex-col gap-0.5">
            {item.streamerName && <span>{item.streamerName}</span>}
            <div className="flex items-center gap-1.5 opacity-80">
              <span>{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : new Date().toLocaleDateString()}</span>
              {(item.totalSize !== "-" || (item.downloadedSize && item.downloadedSize !== "Done" && item.downloadedSize !== "0" && item.downloadedSize !== "0 MB")) && (
                <>
                  <span>•</span>
                  <span>{item.totalSize !== "-" ? item.totalSize : item.downloadedSize}</span>
                </>
              )}
            </div>
          </div>

          {/* Simple Action Buttons */}
          <div className="flex items-center gap-0.5 transition-opacity">
            {item.status === 'completed' && (
              <>
                {item.type === 'chat' && onConvert && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onConvert} title="ASS 변환">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <path d="M15 14l4 -4l-4 -4" />
                      <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
                    </svg>
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onOpenFolder} title="폴더 열기">
                  <FolderOpen className="h-3.5 w-3.5" />
                </Button>

                {/* For Video items, always show chat download option if not actively downloading chat */}
                {item.type === 'video' && onDownloadChat && (
                  relatedChatItem && (relatedChatItem.status === 'downloading' || relatedChatItem.status === 'queued' || relatedChatItem.status === 'converting') ? (
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled title="채팅 다운로드 중...">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </Button>
                  ) : (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDownloadChat} title="채팅 다운로드">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </Button>
                  )
                )}
              </>
            )}
            {/* Pause/Resume Controls */}
            {(item.status === 'downloading' || item.status === 'converting') && onPause && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onPause} title="일시정지">
                <Pause className="h-3.5 w-3.5 fill-current" />
              </Button>
            )}
            {item.status === 'paused' && onResume && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary/80" onClick={onResume} title="재개">
                <Play className="h-3.5 w-3.5 fill-current" />
              </Button>
            )}
            {item.status === 'failed' && onRetry && (
              <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary/80" onClick={onRetry} title="재시도">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}

            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onCancel} title="삭제">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div >
  );
}
