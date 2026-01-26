"use client";

import { useState, useEffect } from "react";
import { Plus, Search, User, X, BadgeCheck, MessageSquare, Zap, Heart, Pencil, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useAppStore, type Streamer } from "@/lib/store";
import { ipcBridge } from "@/lib/ipc-bridge";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableStreamerCard({
  streamer,
  isEditMode,
  removeFavoriteStreamer,
  handleExternalLink
}: {
  streamer: Streamer;
  isEditMode: boolean;
  removeFavoriteStreamer: (id: string) => void;
  handleExternalLink: (e: React.MouseEvent<HTMLAnchorElement>, url: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: streamer.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col items-center gap-1",
        isDragging ? "opacity-50" : "opacity-100"
      )}
      {...(isEditMode ? attributes : {})}
      {...(isEditMode ? listeners : {})}
    >
      <div
        className={cn(
          "relative flex flex-col items-center gap-3 transition-all duration-200",
          !isEditMode && "cursor-pointer"
        )}
      >
        {/* Link wrapper only active when NOT in edit mode */}
        {!isEditMode ? (
          <Link href={`/search?streamer=${streamer.id}`}>
            <div className="relative">
              <img
                src={streamer.avatarUrl || "/placeholder.svg"}
                alt={streamer.name}
                className="h-28 w-28 rounded-full object-cover shadow-lg transition-transform group-hover:scale-105"
                style={{
                  boxShadow: '0 0 0 8px #10B981, 0 0 0 8.5px #14B8A6, 0 0 12px rgba(16, 185, 129, 0.4)'
                }}
              />
            </div>
          </Link>
        ) : (
          <div className="relative cursor-grab active:cursor-grabbing">
            <img
              src={streamer.avatarUrl || "/placeholder.svg"}
              alt={streamer.name}
              className={cn(
                "h-28 w-28 rounded-full object-cover shadow-lg transition-transform",
                isEditMode && "animate-pulse ring-4 ring-warning/50"
              )}
              style={{
                boxShadow: isDragging ? 'none' : '0 0 0 8px #10B981, 0 0 0 8.5px #14B8A6, 0 0 12px rgba(16, 185, 129, 0.4)'
              }}
            />
            {/* Overlay for drag handle visual cue */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-8 w-8 text-white drop-shadow-md" />
            </div>
          </div>
        )}

        <span className="text-sm font-semibold text-foreground text-center line-clamp-1">
          {streamer.name}
        </span>
      </div>

      {/* Social Icons - Hidden in Edit Mode to reduce clutter/misclicks */}
      <div className={cn("flex items-center justify-center gap-2 mt-0.5", isEditMode && "invisible")}>
        {streamer.socialLinks?.map((link) => {
          if (link.type === "YOUTUBE") {
            return (
              <a
                key={link.url}
                href={link.url}
                className="text-muted-foreground hover:text-[#FF0000] transition-colors"
                onClick={(e) => handleExternalLink(e, link.url)}
                title="YouTube"
              >
                <svg role="img" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            );
          }
          if (link.type === "CAFE") {
            return (
              <a
                key={link.url}
                href={link.url}
                className="text-muted-foreground hover:opacity-80 transition-opacity"
                onClick={(e) => handleExternalLink(e, link.url)}
                title="Naver Cafe"
              >
                <img src="/naver-cafe.png" alt="Naver Cafe" className="h-4 w-4 object-contain" />
              </a>
            );
          }
          return null;
        })}
        {/* Placeholder for alignment if no socials */}
        {(!streamer.socialLinks || streamer.socialLinks.length === 0) && <div className="h-4 w-4" />}
      </div>

      {/* Remove Button - Only visible in Edit Mode OR Hover in Normal Mode (original behavior, but prioritized for Edit Mode) */}
      <button
        onClick={() => removeFavoriteStreamer(streamer.id)}
        className={cn(
          "absolute left-1/2 -ml-3 -top-4 translate-x-[70px] flex h-6 w-6 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border/50 shadow-sm transition-all hover:bg-destructive hover:text-white",
          isEditMode
            ? "opacity-100 scale-110 bg-destructive/10 text-destructive border-destructive/20"
            : "opacity-0 group-hover:opacity-100"
        )}
        title="삭제"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function HomeContent() {
  const { favoriteStreamers, addFavoriteStreamer, removeFavoriteStreamer, setFavoriteStreamers } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await ipcBridge.searchChannels(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddStreamer = async (streamer: any) => {
    const socials = await ipcBridge.getChannelSocials(streamer.id);

    addFavoriteStreamer({
      id: streamer.id,
      name: streamer.name,
      avatarUrl: streamer.avatarUrl,
      channelUrl: streamer.channelUrl,
      description: streamer.description,
      isVerified: streamer.isVerified ?? false,
      socialLinks: socials,
    });
    setIsAddDialogOpen(false); // Close dialog on add
    setSearchQuery(""); // Optional: clear search query
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = favoriteStreamers.findIndex((s) => s.id === active.id);
      const newIndex = favoriteStreamers.findIndex((s) => s.id === over.id);

      const newOrder = arrayMove(favoriteStreamers, oldIndex, newIndex);
      setFavoriteStreamers(newOrder);
    }
  };

  // Clear search when dialog closes
  const onOpenChange = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleExternalLink = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (typeof window !== 'undefined' && (window as any).electron) {
      (window as any).electron.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };


  if (favoriteStreamers.length === 0) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-background via-background to-primary/5 overflow-hidden">
        <Heart
          className="absolute left-[calc(27%)] top-[calc(40%)] -translate-x-1/4 -translate-y-1/2 h-[350px] w-[350px] text-primary/[0.07] -rotate-45 pointer-events-none"
          strokeWidth={0.5}
          fill="currentColor"
        />
        <div className="relative max-w-2xl w-full z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <Zap className="h-4 w-4" />
              치지직 VOD 다운로더
            </div>

            <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight mb-4">
              스트리머의 모든 순간을
              <br />
              <span className="bg-gradient-to-r from-primary to-cyan-500 bg-clip-text text-transparent">
                놓치지 마세요
              </span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
              좋아하는 스트리머를 추가하고 VOD와 채팅을 손쉽게 다운로드하세요
            </p>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>
              <div className="flex justify-center mb-16">
                <Button
                  size="lg"
                  className="gap-3 bg-gradient-to-r from-primary to-cyan-500 text-white hover:opacity-90 shadow-xl shadow-primary/25 font-semibold px-8 h-14 text-base transition-all hover:scale-105"
                >
                  <Plus className="h-5 w-5" />
                  스트리머 추가하기
                </Button>
              </div>
            </DialogTrigger>
            <DialogContent className="bg-card border-border shadow-2xl">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">스트리머 추가</DialogTitle>
                <DialogDescription>
                  즐겨찾기에 추가할 스트리머를 검색하세요.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="스트리머 이름 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-input pl-10 border-border focus:border-primary"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    </div>
                  )}
                </div>
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {searchResults.map((streamer) => {
                    const isAdded = favoriteStreamers.some(s => s.id === streamer.id);
                    return (
                      <button
                        key={streamer.id}
                        onClick={() => !isAdded && handleAddStreamer(streamer)}
                        disabled={isAdded}
                        className="w-full text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="rounded-xl p-4 bg-card hover:bg-secondary border border-border transition-colors">
                          <div className="flex items-start gap-3">
                            <img
                              src={streamer.avatarUrl || "/placeholder.svg"}
                              alt={streamer.name}
                              className="h-16 w-16 rounded-lg object-cover ring-2 ring-border"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground truncate">
                                  {streamer.name}
                                </span>
                                {streamer.isVerified && (
                                  <BadgeCheck className="h-5 w-5 text-primary shrink-0" />
                                )}
                                {isAdded && <Badge variant="secondary" className="ml-auto text-xs">추가됨</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                채널 ID: {streamer.id}
                              </p>
                              {streamer.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {streamer.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {searchResults.length === 0 && searchQuery && !isSearching && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      검색 결과가 없습니다 (엔터를 눌러 검색하세요)
                    </p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-6 w-6 text-primary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
                </svg>
              </div>
              <h3 className="font-semibold text-foreground mb-2">VOD 다운로드</h3>
              <p className="text-sm text-muted-foreground">최고 화질의 VOD를 빠르게 저장하세요</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">채팅 저장</h3>
              <p className="text-sm text-muted-foreground">실시간 채팅을 JSON, ASS 등으로 저장</p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">간편한 관리</h3>
              <p className="text-sm text-muted-foreground">다운로드 기록과 설정을 한 곳에서</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen p-8 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden dark:hidden">
        <div
          className="absolute -top-1/2 -left-1/2 w-[150%] h-[150%] rounded-full opacity-20 blur-3xl animate-gradient-1"
          style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.4) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-1/2 -right-1/2 w-[120%] h-[120%] rounded-full opacity-15 blur-3xl animate-gradient-2"
          style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/4 right-1/4 w-[80%] h-[80%] rounded-full opacity-10 blur-3xl animate-gradient-1"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)', animationDelay: '-5s' }}
        />
      </div>

      <div className="relative z-10 mb-8 flex items-center justify-end">
        <Button
          variant={isEditMode ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setIsEditMode(!isEditMode)}
          className={cn(
            "gap-2 transition-all",
            isEditMode && "bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          {isEditMode ? (
            <>
              <BadgeCheck className="h-4 w-4" />
              편집 완료
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4" />
              순서 편집
            </>
          )}
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={favoriteStreamers.map(s => s.id)}
          strategy={rectSortingStrategy}
        >
          <div className="relative z-10 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {favoriteStreamers.map((streamer) => (
              <SortableStreamerCard
                key={streamer.id}
                streamer={streamer}
                isEditMode={isEditMode}
                removeFavoriteStreamer={removeFavoriteStreamer}
                handleExternalLink={handleExternalLink}
              />
            ))}

            {!isEditMode && (
              <Dialog open={isAddDialogOpen} onOpenChange={onOpenChange}>
                <DialogTrigger asChild>
                  <button className="group relative flex flex-col items-center gap-3 transition-all duration-200">
                    <div className="h-28 w-28 rounded-full bg-secondary/20 border-3 border-dashed border-muted-foreground/30 flex items-center justify-center transition-all group-hover:border-primary/50 group-hover:bg-primary/5 group-hover:shadow-[0_0_0_8px_rgba(16,185,129,0.1)]">
                      <Plus className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                      추가하기
                    </span>
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-card">
                  <DialogHeader>
                    <DialogTitle>스트리머 추가</DialogTitle>
                    <DialogDescription>
                      즐겨찾기에 추가할 스트리머를 검색하세요.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="스트리머 이름 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-input pl-10"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                        </div>
                      )}
                    </div>
                    <div className="max-h-96 space-y-3 overflow-y-auto">
                      {searchResults.map((streamer) => {
                        const isAdded = favoriteStreamers.some(s => s.id === streamer.id);
                        return (
                          <button
                            key={streamer.id}
                            onClick={() => !isAdded && handleAddStreamer(streamer)}
                            disabled={isAdded}
                            className="w-full text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="rounded-lg p-3 bg-card hover:bg-secondary border border-border transition-colors">
                              <div className="flex items-start gap-3">
                                <img
                                  src={streamer.avatarUrl || "/placeholder.svg"}
                                  alt={streamer.name}
                                  className="h-14 w-14 rounded-lg object-cover ring-2 ring-border"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground truncate">
                                      {streamer.name}
                                    </span>
                                    {streamer.isVerified && (
                                      <BadgeCheck className="h-5 w-5 text-primary shrink-0" />
                                    )}
                                    {isAdded && <Badge variant="secondary" className="ml-auto text-xs">추가됨</Badge>}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {streamer.id}
                                  </p>
                                  {streamer.description && (
                                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                      {streamer.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })}
                      {searchResults.length === 0 && searchQuery && !isSearching && (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          검색 결과가 없습니다 (엔터를 눌러 검색하세요)
                        </p>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
