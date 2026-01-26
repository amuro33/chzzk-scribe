"use client";

import { useState } from "react";
import { Search, Trash2, FolderOpen, Calendar, Clock } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Loading from "./loading"; // Import the loading component

interface HistoryItem {
  id: string;
  title: string;
  streamerName: string;
  date: string;
  type: "video" | "chat";
  resolution?: string;
  fileSize: string;
  filePath: string;
}

const mockHistory: HistoryItem[] = [
  {
    id: "1",
    title: "오늘의 게임 방송 - 발로란트 랭크 도전기",
    streamerName: "우왁굳",
    date: "2024.01.15 14:32",
    type: "video",
    resolution: "1080p",
    fileSize: "2.7 GB",
    filePath: "C:\\Downloads\\Chzzk",
  },
  {
    id: "2",
    title: "오늘의 게임 방송 - 발로란트 랭크 도전기 (Chat)",
    streamerName: "우왁굳",
    date: "2024.01.15 14:35",
    type: "chat",
    fileSize: "24.5 MB",
    filePath: "C:\\Downloads\\Chzzk",
  },
  {
    id: "3",
    title: "새벽 잡담 방송 - 요즘 근황 토크",
    streamerName: "우왁굳",
    date: "2024.01.14 03:21",
    type: "video",
    resolution: "1080p",
    fileSize: "1.8 GB",
    filePath: "C:\\Downloads\\Chzzk",
  },
  {
    id: "4",
    title: "마인크래프트 서버 탐방",
    streamerName: "징버거",
    date: "2024.01.13 19:45",
    type: "video",
    resolution: "720p",
    fileSize: "3.2 GB",
    filePath: "C:\\Downloads\\Chzzk",
  },
  {
    id: "5",
    title: "저녁 노래방 라이브",
    streamerName: "아이네",
    date: "2024.01.12 21:00",
    type: "video",
    resolution: "1080p",
    fileSize: "4.1 GB",
    filePath: "C:\\Downloads\\Chzzk",
  },
];

export default function HistoryPage() {
  const { downloads } = useAppStore();
  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued"
  ).length;

  const [searchQuery, setSearchQuery] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(mockHistory);

  const filteredHistory = history.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.streamerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setHistory([]);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeDownloads={activeDownloads} />
      <main className="ml-16 flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              다운로드 기록
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              이전 다운로드를 확인하세요
            </p>
          </div>
            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent"
                onClick={handleClearAll}
              >
                <Trash2 className="h-4 w-4" />
                모두 삭제
              </Button>
            )}
          </div>

          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="기록 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-input pl-10"
              />
            </div>
          </div>

          <Suspense fallback={<Loading />}> {/* Wrap the ScrollArea in a Suspense boundary */}
            <ScrollArea className="h-[calc(100vh-220px)]">
              {filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-muted-foreground">기록이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center justify-between rounded-lg border border-border bg-card p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="truncate font-medium text-foreground">
                            {item.title}
                          </h3>
                          <Badge
                            variant="secondary"
                            className={
                              item.type === "video"
                                ? "bg-primary/20 text-primary"
                                : "bg-accent/20 text-accent"
                            }
                          >
                            {item.type === "video" ? "영상" : "채팅"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{item.streamerName}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {item.date}
                          </span>
                          {item.resolution && (
                            <span>{item.resolution}</span>
                          )}
                          <span>{item.fileSize}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => console.log("Open folder:", item.filePath)}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
