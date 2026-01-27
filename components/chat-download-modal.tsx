"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Info } from "lucide-react";
import { ScreenPositionSelector } from "@/components/screen-position-selector";
import { useAppStore, type VOD, type DownloadItem } from "@/lib/store";
import { cn, generateFileName } from "@/lib/utils";
import { ipcBridge } from "@/lib/ipc-bridge";
import { toast } from "sonner";

interface ChatDownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vod?: VOD;
  item?: DownloadItem;
  mode?: "download" | "convert";
}

export function ChatDownloadModal({
  open,
  onOpenChange,
  vod,
  item,
  mode = "download", // default is download
}: ChatDownloadModalProps) {
  const { chatSettings, setChatSettings, addDownload, appSettings } =
    useAppStore();

  const handleAction = async () => {
    if (mode === "convert") {
      if (!item) return;

      console.log("Converting...", chatSettings);

      // Use stored folder path if available (newer downloads), otherwise construct it
      let folderPath = item.folderPath;

      if (!folderPath) {
        // Construct approximate folder path (assuming standard structure)
        // Sanitize streamer name to match server logic
        const sanitizedStreamer = item.streamerName
          ? item.streamerName.replace(/[<>:"/\\|?*]/g, "")
          : "";

        folderPath = sanitizedStreamer
          ? `${item.savePath}/${sanitizedStreamer}`
          : item.savePath;
      }

      console.log(`[Convert] Using folder path: ${folderPath}`);

      console.log(`[Convert] Attempting to find file at: ${folderPath}/${item.fileName}`);

      try {
        const result = await ipcBridge.convertLocalJsonToAss(
          folderPath,
          item.fileName,
          chatSettings
        );

        if (result.success) {
          toast.success(`변환 완료: ${result.filePath}`);
          onOpenChange(false);
        } else {
          // Try fallback: maybe file is in root savePath?
          const retryResult = await ipcBridge.convertLocalJsonToAss(
            item.savePath,
            item.fileName,
            chatSettings
          );
          if (retryResult.success) {
            toast.success(`변환 완료: ${retryResult.filePath}`);
            onOpenChange(false);
          } else {
            toast.error(`변환 실패: ${result.error}`);
          }
        }
      } catch (e) {
        toast.error("오류가 발생했습니다.");
        console.error(e);
      }
      return;
    }

    // Download mode
    if (!vod) return;

    // Fixed to JSON only
    const selectedFormats = ["json"];

    selectedFormats.forEach((format) => {
      const template = appSettings.filenameTemplate || "{title}";
      const generatedName = generateFileName(template, {
        title: vod.title,
        streamer: vod.streamerName || "",
        date: vod.timestamp ? new Date(vod.timestamp).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        downloadDate: new Date().toISOString().split("T")[0]
      });

      // Strip extension (like .mp4) to get base name
      const baseName = generatedName.replace(/\.[^/.]+$/, "");

      const download: DownloadItem = {
        id: `chat-${Date.now()}-${format}`,
        vodId: vod.id,
        title: vod.title,
        fileName: `${baseName}.${format}`, // Use base name + format (json)
        type: "chat",
        status: "queued",
        progress: 0,
        downloadedSize: "0 MB",
        totalSize: "-",
        speed: "-",
        eta: "-",
        savePath: appSettings.downloadPath,
        timestamp: vod.timestamp,
        streamerName: vod.streamerName,
      };
      addDownload(download);
    });

    onOpenChange(false);
  };

  // Always fully enabled since ASS is default
  const hasSelectedFormat = true;
  const title = mode === "convert" ? "ASS 자막 변환" : "채팅 다운로드";
  const actionText = mode === "convert" ? "변환" : "다운로드";

  // Use item title if available (for convert mode), else vod title
  const displayTitle = item?.title || vod?.title || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <p className="mb-2 line-clamp-1 text-sm text-muted-foreground">
              {displayTitle}
            </p>
            {mode === "convert" && item?.chatCount && (
              <div className="mt-2">
                <div className={cn("text-xs flex items-center gap-2",
                  (item.chatCount * (140 * chatSettings.maxLines + 12)) > 70 * 1024 * 1024 ? "text-red-500 font-bold" : "text-muted-foreground"
                )}>
                  <span>예상 파일 용량: {((item.chatCount * (140 * chatSettings.maxLines + 12)) / (1024 * 1024)).toFixed(1)} MB</span>
                  {(item.chatCount * (140 * chatSettings.maxLines + 12)) > 70 * 1024 * 1024 && (
                    <span className="flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      70MB 초과 가능성!
                    </span>
                  )}
                </div>
                {(item.chatCount * (140 * chatSettings.maxLines + 12)) > 70 * 1024 * 1024 && (
                  <p className="text-[11px] text-red-400 mt-1 ml-1">
                    * 자막 파일 용량이 70MB를 초과하면 팟플레이어 등에서 재생이 원활하지 않을 수 있습니다.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ASS Settings only visible in convert mode */}
          {mode === "convert" && (
            <div className="space-y-6 rounded-lg border border-border bg-secondary/30 p-4">
              <div className="space-y-3">
                <Label className="text-foreground">위치</Label>
                <div className="flex justify-center">
                  <ScreenPositionSelector
                    value={chatSettings.assPosition}
                    onChange={(position) =>
                      setChatSettings({ assPosition: position })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-foreground">박스 너비</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={chatSettings.boxWidth || 400}
                      onChange={(e) =>
                        setChatSettings({
                          boxWidth: parseInt(e.target.value) || 400,
                        })
                      }
                      min={200}
                      max={1000}
                      className="w-24 bg-input"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-foreground">폰트 크기</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={chatSettings.fontSize}
                      onChange={(e) =>
                        setChatSettings({
                          fontSize: parseInt(e.target.value) || 32,
                        })
                      }
                      min={12}
                      max={48}
                      className="w-20 bg-input"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="text-foreground">최대 줄 수</Label>
                </div>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[chatSettings.maxLines]}
                    onValueChange={([value]) =>
                      setChatSettings({ maxLines: value })
                    }
                    min={5}
                    max={30}
                    step={1}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-sm text-muted-foreground">
                    {chatSettings.maxLines}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button onClick={handleAction} disabled={!hasSelectedFormat}>
            {actionText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}
