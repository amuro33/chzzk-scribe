"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2, Ghost } from "lucide-react";
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


export default function ChatPage() {
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

  // Create a map of VodId -> ChatItem for lookups
  const chatItemsMap = useMemo(() => {
    const map = new Map<string, DownloadItemType>();
    downloads.filter(d => d.type === 'chat').forEach(d => {
      map.set(d.vodId, d);
    });
    return map;
  }, [downloads]);

  // Determine which items to display
  // - Show only Chat items
  const visibleDownloads = useMemo(() => {
    return downloads.filter(item => item.type === 'chat');
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

      const success = await ipcBridge.openPath(targetPath);
      if (!success) {
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
    // items passed are already filtered to chats by visibleDownloads
    const chats = items;

    const { grouped, items: sortedChats, groups, sortedKeys } = getSortedAndGroupedItems(chats);

    if (items.length === 0) {
      return (
        <div className="relative flex flex-col items-center justify-center py-24 text-center">
          <div className="absolute inset-0 flex items-center justify-center opacity-20 blur-3xl pointer-events-none">
            <div className="h-64 w-64 rounded-full bg-primary/20" />
          </div>
          <div className="relative">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/5 shadow-inner">
              <Ghost className="h-10 w-10 text-primary animate-pulse" />
            </div>
          </div>
          <p className="text-muted-foreground font-medium">다운로드된 채팅이 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground/60">스트리머의 다시보기에서 채팅을 다운로드해 보세요</p>
        </div>
      );
    }

    const renderGrid = (gridItems: DownloadItemType[]) => {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {gridItems.map((item) => {
            // For chat items, we might want to color code by vodId for consistency
            const color = stringToColor(item.vodId);

            return (
              <DownloadItem
                key={item.id}
                item={item}
                matchColor={color}
                onPause={() => handlePause(item.id)}
                onResume={() => handleResume(item.id)}
                onCancel={() => handleCancel(item.id)}
                onRetry={() => handleRetry(item.id)}
                onOpenFolder={() => handleOpenFolder(item.folderPath || item.savePath, item.streamerName)}
                onConvert={() => handleConvert(item)}
              />
            );
          })}
        </div>
      );
    };

    return (
      <div className="space-y-12">
        <div>
          <div className="flex items-center justify-between mb-4">
            {!grouped ? (
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <span className="h-6 w-1.5 rounded-full bg-primary" />
                채팅
                <Badge variant="secondary" className="ml-1 text-xs">{chats.length}</Badge>
                <span className="ml-2 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hidden lg:inline-block">
                  채팅은 ASS 자막으로 변환이 가능합니다
                </span>
              </h2>
            ) : (
              <div />
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
                    <span className="h-6 w-1 rounded-full bg-accent" />
                    {streamer}
                    <Badge variant="secondary" className="ml-1 text-xs">{groups[streamer].length}</Badge>
                  </h3>
                  {renderGrid(groups[streamer])}
                </div>
              ))}
            </div>
          ) : (
            renderGrid(sortedChats!)
          )}
        </div>
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
