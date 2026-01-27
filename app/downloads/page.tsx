"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { DownloadItem } from "@/components/download-item";
import { ipcBridge } from "@/lib/ipc-bridge";
import path from "path";
import { ChatDownloadModal } from "@/components/chat-download-modal";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppStore, type DownloadItem as DownloadItemType } from "@/lib/store";
import { stringToColor, cn, generateFileName } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export default function DownloadsPage() {
  const {
    downloads,
    pauseDownload,
    resumeDownload,
    removeDownload,
    updateDownload,
    clearCompletedDownloads,
    addDownload,
    naverCookies,
    setNaverCookies,
    appSettings,
    setAppSettings,
    favoriteStreamers,
  } = useAppStore();

  const [selectedItem, setSelectedItem] = useState<DownloadItemType | null>(null);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);

  // Use persisted settings directly
  const sortOption = appSettings.downloadSortOption || "download";
  const groupOption = appSettings.downloadGroupOption || "none";


  // Handle global paste event for quick download
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Ignore if pasting into an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const text = e.clipboardData?.getData("text");
      if (!text) return;

      // Regex to match Chzzk video URL or simple VOD ID
      // Matches: 
      // - https://chzzk.naver.com/video/12345
      // - chzzk.naver.com/video/12345
      // - 12345
      const urlMatch = text.match(/chzzk\.naver\.com\/video\/(\d+)/);
      const idMatch = text.match(/^(\d+)$/);

      const vodId = urlMatch ? urlMatch[1] : (idMatch ? idMatch[1] : null);

      if (vodId) {
        e.preventDefault();
        toast.info(`비디오 정보를 불러오는 중... (${vodId})`);

        try {
          const videoMeta = await ipcBridge.getVideoMeta(vodId);
          if (!videoMeta) {
            toast.error("비디오 정보를 찾을 수 없습니다.");
            return;
          }

          // Check for duplication
          const exists = downloads.some(d => d.vodId === String(videoMeta.videoNo) && d.type === "video");
          if (exists) {
            toast.warning("이미 다운로드 목록에 존재하는 영상입니다.");
            return;
          }

          const template = appSettings.filenameTemplate || "{title}";
          const generatedName = generateFileName(template, {
            title: videoMeta.videoTitle,
            streamer: videoMeta.channel.channelName,
            date: videoMeta.publishDate.split(" ")[0],
            downloadDate: new Date().toISOString().split("T")[0]
          });

          const fileName = generatedName.toLowerCase().endsWith(".mp4")
            ? generatedName
            : `${generatedName}.mp4`;

          const download: DownloadItemType = {
            id: `dl-${Date.now()}`,
            vodId: String(videoMeta.videoNo),
            title: videoMeta.videoTitle,
            fileName: fileName,
            type: "video",
            status: "queued",
            progress: 0,
            downloadedSize: "0 MB",
            totalSize: "-",
            speed: "-",
            eta: "-",
            resolution: "1080p", // Default to best
            savePath: appSettings.downloadPath,
            thumbnailUrl: videoMeta.thumbnailImageUrl,
            duration: new Date(videoMeta.duration * 1000).toISOString().substr(11, 8),
            streamerName: videoMeta.channel.channelName,
            timestamp: videoMeta.publishDateAt,
          };

          addDownload(download);
          toast.success("다운로드 대기열에 추가되었습니다.");

        } catch (error) {
          console.error("Quick download failed:", error);
          toast.error("오류가 발생했습니다.");
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addDownload, appSettings.downloadPath, downloads]);
  // Create a map of VodId -> ChatItem for lookups
  const chatItemsMap = useMemo(() => {
    const map = new Map<string, DownloadItemType>();
    downloads.filter(d => d.type === 'chat').forEach(d => {
      map.set(d.vodId, d);
    });
    return map;
  }, [downloads]);

  // Determine which items to display
  // - Show all Video items
  // - Show Chat items ONLY if they don't have a corresponding Video item
  const visibleDownloads = useMemo(() => {
    return downloads.filter(item => item.type === 'video');
  }, [downloads]);

  const activeDownloads = visibleDownloads.filter(
    (d) => d.status === "downloading" || d.status === "queued" || d.status === "paused" || d.status === "converting"
  );
  const completedDownloads = visibleDownloads.filter((d) => d.status === "completed");
  const failedDownloads = visibleDownloads.filter((d) => d.status === "failed");

  const handlePause = async (id: string) => {
    // Cancel the backend process first
    await ipcBridge.cancelVideoDownload(id);
    pauseDownload(id);
  };

  const handleResume = (id: string) => {
    // Set to queued so the processor picks it up again
    updateDownload(id, { status: "queued", error: undefined });
  };

  const handleCancel = async (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (item && item.type === "video" && item.status !== "completed") {
      // For active or failed downloads, we want to cancel process AND delete temp files
      await ipcBridge.cancelVideoDownload(id);
      await ipcBridge.deleteVideoFiles(id);
    }
    removeDownload(id);
  };

  const handleRetry = (id: string) => {
    updateDownload(id, { status: "queued", progress: 0, error: undefined });
  };

  const handleOpenFolder = async (folderPath?: string, streamerName?: string) => {
    if (!folderPath) {
      toast.error("폴더 경로 정보를 찾을 수 없습니다.");
      return;
    }

    try {
      let targetPath = folderPath;

      // If we don't have a specific folderPath and we have a streamerName, 
      // it might be in a subfolder. But usually folderPath is already full from the processor.
      if (!targetPath.includes(streamerName || "") && streamerName) {
        const sanitized = streamerName.replace(/[<>:"/\\|?*]/g, "");
        // Basic check to see if we need to append
        if (!targetPath.endsWith(sanitized)) {
          targetPath = `${targetPath}/${sanitized}`;
        }
      }

      const error = await ipcBridge.openPath(targetPath);
      // shell.openPath returns an empty string "" on success, or an error message on failure
      if (error && error !== "") {
        // Fallback to parent if the specific streamer folder doesn't exist yet
        await ipcBridge.openPath(folderPath);
      }
    } catch (error) {
      console.error("Failed to open folder:", error);
      toast.error("폴더를 여는 중 오류가 발생했습니다.");
    }
  };

  const handleConvert = (item: DownloadItemType) => {
    setSelectedItem(item);
    setIsConvertModalOpen(true);
  };


  const handleDownloadChat = (videoItem: DownloadItemType) => {
    // Check if exists
    const existingItem = downloads.find(
      (d) => d.type === "chat" && d.vodId === videoItem.vodId && d.status !== "failed"
    );

    if (existingItem) {
      // If file is missing, allow re-download (reset status)
      if (existingItem.fileExists === false) {
        updateDownload(existingItem.id, {
          status: "queued",
          progress: 0,
          downloadedSize: "0 B",
          error: undefined,
          fileExists: undefined
        });
        toast.success("채팅 다운로드를 다시 시작합니다.");
        return;
      }

      // precise feedback
      toast.info("이미 채팅 다운로드가 존재합니다.");
      return;
    }

    // Use template for consistent naming
    const template = appSettings.filenameTemplate || "{title}";
    const generatedName = generateFileName(template, {
      title: videoItem.title,
      streamer: videoItem.streamerName || "",
      date: videoItem.timestamp ? new Date(videoItem.timestamp).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      downloadDate: new Date().toISOString().split("T")[0]
    });

    // Strip extension (like .mp4) from the name so we can append .json cleanly
    const baseName = generatedName.replace(/\.[^/.]+$/, "");

    // Ensure .json extension for UI consistency
    const fileName = baseName.toLowerCase().endsWith(".json")
      ? baseName
      : `${baseName}.json`;

    const chatItem: DownloadItemType = {
      id: `chat-${Date.now()}`,
      vodId: videoItem.vodId,
      title: videoItem.title,
      fileName: fileName,
      type: "chat",
      status: "queued",
      progress: 0,
      downloadedSize: "0 B",
      totalSize: "-",
      speed: "-",
      eta: "-",
      savePath: videoItem.savePath,
      streamerName: videoItem.streamerName,
      timestamp: videoItem.timestamp,
      thumbnailUrl: videoItem.thumbnailUrl,
      duration: videoItem.duration
    };

    addDownload(chatItem);
  };

  const getSortedAndGroupedItems = (items: DownloadItemType[]) => {
    // 1. Sort
    const sorted = [...items].sort((a, b) => {
      if (sortOption === "dateDesc") {
        return (b.timestamp || 0) - (a.timestamp || 0);
      } else if (sortOption === "dateAsc") {
        return (a.timestamp || 0) - (b.timestamp || 0);
      }
      // Default: download order (id is roughly timestamp-based)
      return b.id.localeCompare(a.id);
    });

    // 2. Group
    if (groupOption === "none") {
      return { grouped: false, items: sorted };
    }

    const groups: Record<string, DownloadItemType[]> = {};
    sorted.forEach(item => {
      const key = item.streamerName || "Unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    // Sort groups
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupOption === "streamerBookmark") {
        const aFav = favoriteStreamers.some(s => s.name === a);
        const bFav = favoriteStreamers.some(s => s.name === b);
        if (aFav && !bFav) return -1;
        if (!aFav && bFav) return 1;
        return a.localeCompare(b);
      } else if (groupOption === "streamerNameAsc") {
        return a.localeCompare(b);
      } else if (groupOption === "streamerNameDesc") {
        return b.localeCompare(a);
      }
      return 0;
    });

    return { grouped: true, groups, sortedKeys };
  };

  const renderDownloadList = (items: DownloadItemType[]) => {
    const videos = items.filter(i => i.type === "video");


    const { grouped, items: sortedVideos, groups, sortedKeys } = getSortedAndGroupedItems(videos);

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">다운로드 항목이 없습니다</p>
        </div>
      );
    }

    const renderGrid = (gridItems: DownloadItemType[]) => {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {gridItems.map((item) => {
            const relatedChat = chatItemsMap.get(item.vodId);
            const hasSubtitle = !!relatedChat;
            const color = hasSubtitle ? stringToColor(item.vodId) : undefined;

            return (
              <DownloadItem
                key={item.id}
                item={item}
                relatedChatItem={relatedChat}
                hasSubtitle={hasSubtitle}
                matchColor={color}
                onPause={() => handlePause(item.id)}
                onResume={() => handleResume(item.id)}
                onCancel={() => handleCancel(item.id)}
                onRetry={() => handleRetry(item.id)}
                onOpenFolder={() => handleOpenFolder(item.folderPath || item.savePath, item.streamerName)}
                onDownloadChat={() => handleDownloadChat(item)}
                onConvertChat={relatedChat?.status === 'completed' ? () => handleConvert(relatedChat) : undefined}
              />
            );
          })}
        </div>
      );
    };

    return (
      <div className="space-y-12">
        {/* Videos Section (Sorted/Grouped) */}
        {videos.length > 0 && (
          <div>
            {/* Show header if not grouped, or if users prefer a main header always. 
                     If grouped, we have per-streamer headers. 
                     Let's show the main header only if NOT grouped to avoid clutter, 
                     OR if grouped, maybe just don't show the main "Video" header? 
                     The original had "Video" header. 
                 */}
            {/* Controls moved to Video Section Header */}
            <div className="flex items-center justify-between mb-4">
              {!grouped ? (
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <span className="h-6 w-1.5 rounded-full bg-primary" />
                  동영상
                  <Badge variant="secondary" className="ml-1 text-xs">{videos.length}</Badge>
                  <span className="ml-2 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hidden lg:inline-block">
                    다시보기 주소나 다시보기 ID를 붙여넣으면 바로 다운로드 됩니다
                  </span>
                </h2>
              ) : (
                <div /> // Spacer
              )}

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">정렬</span>
                  <Select
                    value={sortOption}
                    onValueChange={(val) => setAppSettings({ downloadSortOption: val })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="정렬 기준" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="download">다운로드 순</SelectItem>
                      <SelectItem value="dateDesc">방송 날짜 순 (최신)</SelectItem>
                      <SelectItem value="dateAsc">방송 날짜 순 (오래된)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">그룹</span>
                  <Select
                    value={groupOption}
                    onValueChange={(val) => setAppSettings({ downloadGroupOption: val })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="그룹 기준" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">없음</SelectItem>
                      <SelectItem value="streamerBookmark">스트리머 (즐겨찾기 순)</SelectItem>
                      <SelectItem value="streamerNameAsc">스트리머 (이름 오름차순)</SelectItem>
                      <SelectItem value="streamerNameDesc">스트리머 (이름 내림차순)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


              </div>
            </div>

            {grouped && groups && sortedKeys ? (
              <div className="space-y-8">
                {sortedKeys.map(streamer => (
                  <div key={streamer}>
                    <h3 className="mb-4 text-lg font-semibold text-foreground flex items-center gap-2">
                      <span className="h-6 w-1.5 rounded-full bg-primary" />
                      {streamer}
                      <Badge variant="secondary" className="ml-1 text-xs">{groups[streamer].length}</Badge>
                    </h3>
                    {renderGrid(groups[streamer])}
                  </div>
                ))}
              </div>
            ) : (
              renderGrid(sortedVideos!)
            )}
          </div>
        )}


      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-16 flex-1 overflow-auto">
        <div className="p-8">


          {renderDownloadList(visibleDownloads)}

          {/* Convert Subtitle Modal */}
          {selectedItem && (
            <ChatDownloadModal
              open={isConvertModalOpen}
              onOpenChange={setIsConvertModalOpen}
              item={selectedItem}
              mode="convert"
            />
          )}


        </div>
      </main>
    </div>
  );
}
