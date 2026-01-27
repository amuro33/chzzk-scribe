import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SocialLink {
  type: string;
  url: string;
}

export interface Streamer {
  id: string;
  name: string;
  avatarUrl: string;
  channelUrl: string;
  description?: string;
  isVerified?: boolean;
  socialLinks?: SocialLink[];
}

export interface VOD {
  id: string;
  videoNo: number;
  title: string;
  streamerName: string;
  streamerId: string;
  thumbnailUrl: string; // Can be empty string or null from API
  channelImageUrl?: string; // Fallback for missing thumbnail
  duration: string;
  durationSeconds: number;
  date: string;
  timestamp: number;
  resolutions: string[];
  isDownloaded: boolean;
  isNew: boolean;
  adult?: boolean;
}

export interface DownloadItem {
  id: string;
  vodId: string;
  title: string;
  fileName: string;
  type: "video" | "chat";
  status: "queued" | "downloading" | "converting" | "paused" | "completed" | "failed";
  progress: number;
  downloadedSize: string;
  totalSize: string;
  speed: string;
  eta: string;
  error?: string;
  resolution?: string;
  savePath: string;
  streamerName?: string;
  timestamp?: number;
  folderPath?: string;
  thumbnailUrl?: string;
  duration?: string;
  durationSeconds?: number;
  bitrateBps?: number; // Actual bitrate from VOD API (bits per second)
  chatCount?: number;
  fileExists?: boolean; // New field to track if file exists
}

export interface ChatSettings {
  formats: {
    json: boolean;
    ass: boolean;
    log: boolean;
  };
  assPosition: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "middle-left" | "middle-right";
  fadeOutDuration: number;
  fontSize: number;
  maxLines: number;
  boxWidth: number;
}

export interface AppSettings {
  downloadPath: string;
  defaultQuality: string;
  concurrentDownloads: number;
  notifyOnComplete: boolean;
  playSoundOnComplete: boolean;
  autoStart?: boolean;
  theme: "light" | "dark" | "system";
  language: string;
  maxConcurrentFragments?: number;
  downloadSortOption?: string;
  downloadGroupOption?: string;
  streamlinkPortable?: boolean;
  streamlinkPath?: string;
  tempPath?: string;
  filenameTemplate?: string;
  saveThumbnail?: boolean;
  downloadEngine: "ffmpeg" | "streamlink";
}

interface AppState {
  favoriteStreamers: Streamer[];
  downloads: DownloadItem[];
  downloadHistory: DownloadItem[];
  searchResults: VOD[];
  chatSettings: ChatSettings;
  appSettings: AppSettings;
  lastActiveStreamerId: string | null;

  addFavoriteStreamer: (streamer: Streamer) => void;
  removeFavoriteStreamer: (id: string) => void;
  setFavoriteStreamers: (streamers: Streamer[]) => void;
  addDownload: (download: DownloadItem) => void;
  updateDownload: (id: string, updates: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  clearCompletedDownloads: () => void;
  setSearchResults: (results: VOD[]) => void;
  setChatSettings: (settings: Partial<ChatSettings>) => void;
  setAppSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  setLastActiveStreamerId: (id: string | null) => void;

  naverCookies: { nidAut: string; nidSes: string } | null;
  setNaverCookies: (cookies: { nidAut: string; nidSes: string } | null) => void;
}

// Default Settings Constants
const defaultChatSettings: ChatSettings = {
  formats: {
    json: true,
    ass: true,
    log: false,
  },
  assPosition: "top-right",
  fadeOutDuration: 5,
  fontSize: 32,
  maxLines: 15,
  boxWidth: 400,
};

const defaultAppSettings: AppSettings = {
  downloadPath: "C:\\Downloads\\Chzzk",
  defaultQuality: "1080p",
  concurrentDownloads: 3,
  notifyOnComplete: true,
  playSoundOnComplete: true,
  autoStart: true,
  theme: "dark",
  language: "ko",
  maxConcurrentFragments: 16,
  downloadSortOption: "download",
  downloadGroupOption: "none",
  streamlinkPortable: true,
  tempPath: "",
  filenameTemplate: "{title}",
  saveThumbnail: false,
  downloadEngine: "ffmpeg",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      favoriteStreamers: [],
      downloads: [],
      downloadHistory: [],
      searchResults: [],
      chatSettings: defaultChatSettings,
      appSettings: defaultAppSettings,
      lastActiveStreamerId: null,

      addFavoriteStreamer: (streamer) =>
        set((state) => ({
          favoriteStreamers: [...state.favoriteStreamers, streamer],
        })),

      removeFavoriteStreamer: (id) =>
        set((state) => ({
          favoriteStreamers: state.favoriteStreamers.filter((s) => s.id !== id),
        })),

      setFavoriteStreamers: (streamers: Streamer[]) =>
        set({ favoriteStreamers: streamers }),

      addDownload: (download) =>
        set((state) => ({
          downloads: [...state.downloads, download],
        })),

      updateDownload: (id, updates) =>
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      removeDownload: (id) =>
        set((state) => ({
          downloads: state.downloads.filter((d) => d.id !== id),
        })),

      pauseDownload: (id) =>
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, status: "paused" } : d
          ),
        })),

      resumeDownload: (id) =>
        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id ? { ...d, status: "downloading" } : d
          ),
        })),

      clearCompletedDownloads: () =>
        set((state) => ({
          downloads: state.downloads.filter((d) => d.status !== "completed"),
          downloadHistory: [
            ...state.downloadHistory,
            ...state.downloads.filter((d) => d.status === "completed"),
          ],
        })),

      setSearchResults: (results) => set({ searchResults: results }),

      setChatSettings: (settings) =>
        set((state) => ({
          chatSettings: { ...state.chatSettings, ...settings },
        })),

      setAppSettings: (settings) =>
        set((state) => ({
          appSettings: { ...state.appSettings, ...settings },
        })),

      resetSettings: () =>
        set({
          chatSettings: defaultChatSettings,
          appSettings: defaultAppSettings,
        }),

      setLastActiveStreamerId: (id) => set({ lastActiveStreamerId: id }),

      naverCookies: null,
      setNaverCookies: (cookies) => set({ naverCookies: cookies }),
    }),
    {
      name: "chzzk-storage",
      // Exclude naverCookies from localStorage - it's stored in encrypted file instead
      partialize: (state) => ({
        ...state,
        naverCookies: undefined, // Don't persist cookies to localStorage
      }),
    }
  )
);
