"use client";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { useState, Suspense, useMemo, memo } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, UserPlus, Check, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, LayoutGrid } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";

// Lazy load heavy components
const VODCard = dynamic(() => import("@/components/vod-card").then(mod => ({ default: mod.VODCard })), {
  loading: () => <div className="animate-pulse bg-muted rounded-lg h-[280px]"></div>,
  ssr: false
});
const ChatDownloadModal = dynamic(() => import("@/components/chat-download-modal").then(mod => ({ default: mod.ChatDownloadModal })), {
  ssr: false
});
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore, type VOD, type DownloadItem, type Streamer } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { ipcBridge } from "@/lib/ipc-bridge";
import type { SearchResult } from "@/types/chzzk";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import Loading from "./loading";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { generateFileName } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";



function SearchPageContent() {
  const searchParams = useSearchParams();
  const streamerId = searchParams.get("streamer");

  const { downloads, addDownload, updateDownload, appSettings, addFavoriteStreamer, favoriteStreamers, lastActiveStreamerId, setLastActiveStreamerId } = useAppStore();
  const router = useRouter();
  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued"
  ).length;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVOD, setSelectedVOD] = useState<VOD | null>(null);
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // VOD State
  const [vods, setVods] = useState<VOD[]>([]);
  const [isLoadingVods, setIsLoadingVods] = useState(false);
  const [sortType, setSortType] = useState<"LATEST" | "POPULAR">("LATEST");
  const [videoType, setVideoType] = useState<string>("");
  // Track which streamerId the current vods were fetched for to prevent flash of old data
  const [fetchedId, setFetchedId] = useState<string | null>("initial");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Grid State
  const [gridColumns, setGridColumns] = useState<number>(4);

  // Combined Feed State
  const [enabledStreamerIds, setEnabledStreamerIds] = useState<string[]>([]);
  const { naverCookies } = useAppStore(); // Get cookies

  useEffect(() => {
    if (streamerId) {
      if (lastActiveStreamerId !== streamerId) {
        setLastActiveStreamerId(streamerId);
      }
    }
    else if (lastActiveStreamerId) {
      router.replace(`/search?streamer=${lastActiveStreamerId}`);
    }
  }, [streamerId, lastActiveStreamerId, setLastActiveStreamerId, router]);

  useEffect(() => {
    if (!streamerId || streamerId === "all") {
      setEnabledStreamerIds(favoriteStreamers.map(s => s.id));
    }
  }, [favoriteStreamers, streamerId]);

  const fetchVods = async (page: number = 0) => {
    setIsLoadingVods(true);
    const currentId = (streamerId && streamerId !== "all") ? streamerId : "all";

    try {
      if (streamerId && streamerId !== "all") {
        const response = await ipcBridge.getChannelVideos(streamerId, page, 18, sortType, naverCookies, videoType);
        const mappedVods = mapVideosToVODs(response.videos);
        setVods(mappedVods);

        setCurrentPage(response.page);
        setTotalPages(response.totalPages);
        setTotalCount(response.totalCount);

        const vodsToCheck = mappedVods.map(v => ({
          videoNo: v.videoNo,
          title: v.title,
          timestamp: v.timestamp,
          streamerName: v.streamerName
        }));

        ipcBridge.checkDownloadedFiles(vodsToCheck, appSettings.downloadPath).then((downloadedIds: number[]) => {
          if (downloadedIds.length > 0) {
            setVods(prev => prev.map(v =>
              downloadedIds.includes(v.videoNo) ? { ...v, isDownloaded: true } : v
            ));
          }
        });

        // Update thumbnails for existing downloads (especially for age-restricted VODs)
        mappedVods.forEach(vod => {
          if (vod.thumbnailUrl) {
            downloads.forEach(download => {
              if (download.vodId === String(vod.videoNo) && !download.thumbnailUrl) {
                updateDownload(download.id, { thumbnailUrl: vod.thumbnailUrl });
              }
            });
          }
        });

      } else {
        if (favoriteStreamers.length === 0) {
          setVods([]);
          setFetchedId(currentId);
          setIsLoadingVods(false);
          setTotalPages(0);
          return;
        }

        const promises = favoriteStreamers.map(s => ipcBridge.getChannelVideos(s.id, 0, 18, sortType, naverCookies, videoType));
        const results = await Promise.all(promises);

        let allVods: VOD[] = [];

        results.forEach(response => {
          const mapped = mapVideosToVODs(response.videos);
          allVods = [...allVods, ...mapped];
        });

        if (sortType === "LATEST") {
          allVods.sort((a, b) => b.timestamp - a.timestamp);
        } else {
          allVods.sort((a, b) => b.timestamp - a.timestamp);
        }
        setVods(allVods);

        setTotalPages(0);
        setCurrentPage(0);

        const vodsToCheck = allVods.map(v => ({
          videoNo: v.videoNo,
          title: v.title,
          timestamp: v.timestamp,
          streamerName: v.streamerName
        }));

        ipcBridge.checkDownloadedFiles(vodsToCheck, appSettings.downloadPath).then((downloadedIds: number[]) => {
          if (downloadedIds.length > 0) {
            setVods(prev => prev.map(v =>
              downloadedIds.includes(v.videoNo) ? { ...v, isDownloaded: true } : v
            ));
          }
        });

        // Update thumbnails for existing downloads (especially for age-restricted VODs)
        allVods.forEach(vod => {
          if (vod.thumbnailUrl) {
            downloads.forEach(download => {
              if (download.vodId === String(vod.videoNo) && !download.thumbnailUrl) {
                updateDownload(download.id, { thumbnailUrl: vod.thumbnailUrl });
              }
            });
          }
        });
      }
    } catch (e) {
      console.error("Failed to fetch videos", e);
      toast.error("영상 목록을 불러오는데 실패했습니다.");
    } finally {
      setFetchedId(currentId);
      setIsLoadingVods(false);
    }
  };

  useEffect(() => {
    setCurrentPage(0);
    fetchVods(0);
  }, [streamerId, favoriteStreamers, naverCookies, sortType, videoType]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 0 || newPage >= totalPages) return;
    fetchVods(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mapVideosToVODs = (videos: any[]): VOD[] => {
    return videos.map(v => ({
      id: String(v.videoNo),
      videoNo: v.videoNo,
      title: v.videoTitle,
      streamerName: v.channel.channelName,
      streamerId: v.channel.channelId,
      thumbnailUrl: v.thumbnailImageUrl,
      channelImageUrl: v.channel.channelImageUrl,
      duration: new Date(v.duration * 1000).toISOString().substr(11, 8),
      durationSeconds: v.duration,
      date: v.publishDate.split(" ")[0],
      timestamp: v.publishDateAt,
      resolutions: ["1080p", "720p"],
      isDownloaded: false,
      isNew: (Date.now() - v.publishDateAt) < 1000 * 60 * 60 * 24 * 3,
      adult: v.adult
    }));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await ipcBridge.searchChannels(searchQuery);
      setSearchResults(results);
      setHasSearched(true);
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddStreamer = async (streamer: SearchResult) => {
    const isAlreadyAdded = favoriteStreamers.some(s => s.id === streamer.id);
    if (isAlreadyAdded) {
      toast.info("이미 추가된 스트리머입니다.");
      return;
    }

    const socials = await ipcBridge.getChannelSocials(streamer.id);

    const newStreamer: Streamer = {
      id: streamer.id,
      name: streamer.name,
      avatarUrl: streamer.avatarUrl,
      channelUrl: streamer.channelUrl,
      description: streamer.description,
      isVerified: streamer.isVerified,
      socialLinks: socials,
    };

    addFavoriteStreamer(newStreamer);
    toast.success(`${streamer.name}님이 즐겨찾기에 추가되었습니다.`);
  };

  const handleStreamerSelect = (id: string) => {
    setSearchQuery("");
    setHasSearched(false);
    setSearchResults([]);
    router.push(`/search?streamer=${id}`);
  };

  const isStreamerAdded = (id: string) => favoriteStreamers.some(s => s.id === id);

  const handleDownload = (vod: VOD, resolution: string) => {
    const template = appSettings.filenameTemplate || "{title}";
    const generatedName = generateFileName(template, {
      title: vod.title,
      streamer: vod.streamerName,
      date: vod.date,
      downloadDate: new Date().toISOString().split("T")[0]
    });

    const fileName = generatedName.toLowerCase().endsWith(".mp4")
      ? generatedName
      : `${generatedName}.mp4`;

    const download: DownloadItem = {
      id: `dl-${Date.now()}`,
      vodId: String(vod.videoNo),
      title: vod.title,
      fileName: fileName,
      type: "video",
      status: "queued",
      progress: 0,
      downloadedSize: "0 MB",
      totalSize: "-",
      speed: "-",
      eta: "-",
      resolution,
      savePath: appSettings.downloadPath,
      thumbnailUrl: vod.thumbnailUrl,
      duration: vod.duration,
      durationSeconds: vod.durationSeconds,
      streamerName: vod.streamerName,
      timestamp: vod.timestamp,
    };
    addDownload(download);
  };

  const handleChatDownload = (vod: VOD) => {
    const template = appSettings.filenameTemplate || "{title}";
    const generatedName = generateFileName(template, {
      title: vod.title,
      streamer: vod.streamerName,
      date: vod.date,
      downloadDate: new Date().toISOString().split("T")[0]
    });

    const baseName = generatedName.replace(/\.[^/.]+$/, "");
    const fileName = baseName.toLowerCase().endsWith(".json")
      ? baseName
      : `${baseName}.json`;

    const download: DownloadItem = {
      id: `chat-${Date.now()}-json`,
      vodId: String(vod.videoNo || vod.id),
      title: vod.title,
      fileName: fileName,
      type: "chat",
      status: "queued",
      progress: 0,
      downloadedSize: "0 MB",
      totalSize: "-",
      speed: "-",
      eta: "-",
      resolution: "JSON",
      savePath: appSettings.downloadPath,
      streamerName: vod.streamerName,
      timestamp: vod.timestamp,
      thumbnailUrl: vod.thumbnailUrl,
    };
    addDownload(download);
    toast.success("채팅 다운로드가 시작되었습니다 (JSON)");
  };

  const clearPersistentStreamer = () => {
    setLastActiveStreamerId("all");
    setHasSearched(false);
    setSearchQuery("");
    router.push("/search?streamer=all");
    setEnabledStreamerIds(favoriteStreamers.map(s => s.id));
  };

  const toggleStreamerFilter = (id: string) => {
    setEnabledStreamerIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(sid => sid !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const displayedVods = (streamerId && streamerId !== "all")
    ? vods
    : vods.filter(v => enabledStreamerIds.includes(v.streamerId));

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-16 flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-6 relative">
            <Input
              placeholder="스트리머 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-12 bg-secondary/50 pl-6 pr-12 text-base rounded-full border-border focus-visible:ring-offset-0 focus-visible:border-primary/50"
              disabled={isSearching}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSearch}
              disabled={isSearching}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full hover:bg-transparent text-muted-foreground hover:text-primary"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>

          {streamerId && streamerId !== "all" && (
            <div className="mb-6">
              <div className="inline-flex items-center gap-1 pl-3 pr-1 py-1 bg-secondary/50 rounded-full text-sm font-medium text-foreground border border-border">
                <span className="flex items-center gap-2">
                  {favoriteStreamers.find(s => s.id === streamerId)?.name || vods[0]?.streamerName || "선택된 스트리머"}
                </span>
                <button
                  onClick={clearPersistentStreamer}
                  className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                  title="필터 해제"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {(!streamerId || streamerId === "all") && !hasSearched && favoriteStreamers.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              {favoriteStreamers.map(streamer => {
                if (!enabledStreamerIds.includes(streamer.id)) return null;
                return (
                  <div key={streamer.id} className="flex items-center gap-1 pl-3 pr-1 py-1 bg-secondary/50 rounded-full text-sm font-medium text-foreground border border-border">
                    {streamer.name}
                    <button
                      onClick={() => toggleStreamerFilter(streamer.id)}
                      className="p-1 hover:bg-destructive/10 hover:text-destructive rounded-full transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
              {favoriteStreamers.some(s => !enabledStreamerIds.includes(s.id)) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEnabledStreamerIds(favoriteStreamers.map(s => s.id))}
                  className="h-8 text-xs text-muted-foreground hover:text-primary"
                >
                  필터 초기화
                </Button>
              )}
            </div>
          )}

          <div className="space-y-6">
            {hasSearched && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground">
                  채널 검색 결과 ({searchResults.length})
                </h2>
                {searchResults.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {searchResults.map((streamer) => (
                      <Card
                        key={streamer.id}
                        className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => handleStreamerSelect(streamer.id)}
                      >
                        <CardContent className="flex items-center gap-4 p-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={streamer.avatarUrl} alt={streamer.name} />
                            <AvatarFallback>{streamer.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 overflow-hidden">
                            <div className="flex items-center gap-1">
                              <h3 className="truncate font-medium leading-none">
                                {streamer.name}
                              </h3>
                              {streamer.isVerified && (
                                <Check className="h-3 w-3 text-blue-500" />
                              )}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">
                              {streamer.description || "소개 없음"}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant={isStreamerAdded(streamer.id) ? "secondary" : "default"}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddStreamer(streamer);
                            }}
                            disabled={isStreamerAdded(streamer.id)}
                          >
                            {isStreamerAdded(streamer.id) ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <UserPlus className="h-4 w-4" />
                            )}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-1.5 rounded-full bg-primary" />
                    {(isLoadingVods || fetchedId !== ((streamerId && streamerId !== "all") ? streamerId : "all"))
                      ? "VOD 목록 로딩 중..."
                      : (streamerId && streamerId !== "all"
                        ? (
                          <>
                            VOD 목록
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {totalCount > 0 ? totalCount : displayedVods.length}
                            </Badge>
                          </>
                        )
                        : (
                          <>
                            최신 VOD
                            <Badge variant="secondary" className="ml-1 text-xs">{displayedVods.length}</Badge>
                          </>
                        )
                      )
                    }
                  </div>

                  <Tabs defaultValue="" value={videoType} onValueChange={(val: any) => setVideoType(val)} className="h-9">
                    <TabsList className="bg-secondary/30 border border-border/50 h-9 p-0.5">
                      <TabsTrigger value="" className="text-xs h-[30px] px-3 data-[state=active]:bg-background data-[state=active]:text-primary">전체</TabsTrigger>
                      <TabsTrigger value="REPLAY" className="text-xs h-[30px] px-3 data-[state=active]:bg-background data-[state=active]:text-primary">지난방송</TabsTrigger>
                      <TabsTrigger value="UPLOAD" className="text-xs h-[30px] px-3 data-[state=active]:bg-background data-[state=active]:text-primary">업로드</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </h2>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-4 bg-secondary/30 px-3 py-1.5 rounded-lg border border-border/50 h-9">
                    <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                    <div className="w-[80px]">
                      <Slider
                        defaultValue={[4]}
                        value={[gridColumns]}
                        onValueChange={(vals) => setGridColumns(vals[0])}
                        max={10}
                        min={1}
                        step={1}
                        className="cursor-pointer"
                      />
                    </div>
                    <span className="text-xs font-medium w-10 text-right tabular-nums text-muted-foreground">
                      {gridColumns}
                    </span>
                  </div>

                  <Tabs defaultValue="LATEST" value={sortType} onValueChange={(val: any) => setSortType(val)} className="h-9">
                    <TabsList className="bg-secondary/30 border border-border/50 h-9 p-0.5">
                      <TabsTrigger value="LATEST" className="text-xs h-[30px] px-3 data-[state=active]:bg-background data-[state=active]:text-primary">최신순</TabsTrigger>
                      <TabsTrigger value="POPULAR" className="text-xs h-[30px] px-3 data-[state=active]:bg-background data-[state=active]:text-primary">인기순</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              {(isLoadingVods || fetchedId !== ((streamerId && streamerId !== "all") ? streamerId : "all")) ? (
                <div className="text-center py-12">
                  <p>로딩 중...</p>
                </div>
              ) : (
                <div className={`grid gap-4 ${gridColumns === 1 ? "grid-cols-1" :
                  gridColumns === 2 ? "grid-cols-2" :
                    gridColumns === 3 ? "grid-cols-3" :
                      gridColumns === 4 ? "grid-cols-4" :
                        gridColumns === 5 ? "grid-cols-5" :
                          gridColumns === 6 ? "grid-cols-6" :
                            gridColumns === 7 ? "grid-cols-7" :
                              gridColumns === 8 ? "grid-cols-8" :
                                gridColumns === 9 ? "grid-cols-9" : "grid-cols-10"
                  }`}>
                  {displayedVods.length > 0 ? displayedVods.map((vod) => (
                    <VODCard
                      key={vod.id}
                      vod={vod}
                      onDownload={handleDownload}
                      onChatDownload={handleChatDownload}
                      isCompact={gridColumns >= 7}
                    />
                  )) : (
                    <div className="text-center py-8 text-muted-foreground">
                      {streamerId
                        ? "해당 스트리머의 영상이 없습니다."
                        : (hasSearched
                          ? "검색된 VOD가 없습니다."
                          : "최신 VOD가 없습니다.")
                      }
                    </div>
                  )}
                </div>
              )}


              {!isLoadingVods && totalPages > 1 && streamerId && streamerId !== "all" && (
                <div className="flex justify-center items-center gap-2 mt-8 pb-8">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(0)}
                    disabled={currentPage === 0}
                    className="h-8 w-8"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="h-8 w-8"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1 mx-2">
                    {(() => {
                      const maxButtons = 5;
                      let startPage = Math.max(0, currentPage - 2);
                      let endPage = Math.min(totalPages - 1, startPage + maxButtons - 1);

                      if (endPage - startPage + 1 < maxButtons) {
                        startPage = Math.max(0, endPage - maxButtons + 1);
                      }

                      return Array.from({ length: endPage - startPage + 1 }, (_, i) => {
                        const p = startPage + i;
                        return (
                          <Button
                            key={p}
                            variant={p === currentPage ? "default" : "ghost"}
                            size="sm"
                            onClick={() => handlePageChange(p)}
                            className={`h-8 w-8 font-medium ${p === currentPage ? "bg-primary text-primary-foreground pointer-events-none" : "hover:bg-accent"}`}
                          >
                            {p + 1}
                          </Button>
                        );
                      });
                    })()}
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="h-8 w-8"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(totalPages - 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="h-8 w-8"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedVOD && (
          <ChatDownloadModal
            open={isChatModalOpen}
            onOpenChange={setIsChatModalOpen}
            vod={selectedVOD}
          />
        )}
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchPageContent />
    </Suspense>
  );
}
