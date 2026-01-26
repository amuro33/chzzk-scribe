"use server";

import { generateAssFromChats } from "@/lib/ass-converter";
import type { ChatSettings } from "@/lib/store";

export interface SearchResult {
  id: string;
  name: string;
  avatarUrl: string;
  channelUrl: string;
  description?: string;
  isVerified?: boolean;
}

export async function searchChannels(keyword: string): Promise<SearchResult[]> {
  try {
    const url = `https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(
      keyword
    )}&offset=0&size=30&withFirstChannelContent=false`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      // Fallback or just throw
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.content || !data.content.data) {
      return [];
    }

    return data.content.data.map((item: any) => {
      const channel = item.channel;
      return {
        id: channel.channelId,
        name: channel.channelName,
        avatarUrl: channel.channelImageUrl ? channel.channelImageUrl : "",
        channelUrl: `https://chzzk.naver.com/${channel.channelId}`,
        description: channel.channelDescription,
        isVerified: channel.verifiedMark,
      };
    });
  } catch (error) {
    console.error("[Search] Search failed:", error);
    return [];
  }
}

export interface ChannelVideo {
  videoNo: number;
  videoId: string;
  videoTitle: string;
  videoType: string;
  publishDate: string;
  thumbnailImageUrl: string;
  duration: number;
  readCount: number;
  publishDateAt: number;
  videoCategoryValue: string;
  adult: boolean;
  channel: {
    channelId: string;
    channelName: string;
    channelImageUrl: string;
    verifiedMark: boolean;
  }
}

export interface ChannelVideoResponse {
  videos: ChannelVideo[];
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
}

export async function getChannelVideos(
  channelId: string,
  page: number = 0,
  size: number = 18,
  sortType: "LATEST" | "POPULAR" = "LATEST",
  cookies?: { nidAut: string; nidSes: string } | null,
  videoType: string = ""
): Promise<ChannelVideoResponse> {
  try {
    const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=${sortType}&pagingType=PAGE&page=${page}&size=${size}&publishDateAt=&videoType=${videoType}`;

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
    };

    if (cookies) {
      headers["Cookie"] = `NID_AUT=${cookies.nidAut}; NID_SES=${cookies.nidSes}`;
    }

    const response = await fetch(url, {
      headers,
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.content || !data.content.data) {
      return {
        videos: [],
        page: 0,
        size: size,
        totalCount: 0,
        totalPages: 0
      };
    }

    return {
      videos: data.content.data,
      page: data.content.page || page,
      size: data.content.size || size,
      totalCount: data.content.totalCount || 0,
      totalPages: data.content.totalPages || 0
    };
  } catch (error) {
    console.error("[Videos] Fetch failed:", error);
    return {
      videos: [],
      page: 0,
      size: size,
      totalCount: 0,
      totalPages: 0
    };
  }
}

export async function getVideoMeta(videoNo: string): Promise<ChannelVideo | null> {
  try {
    const url = `https://api.chzzk.naver.com/service/v2/videos/${videoNo}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      cache: "no-store"
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (data.code !== 200 || !data.content) {
      return null;
    }

    return data.content;
  } catch (error) {
    console.error("[VideoMeta] Fetch failed:", error);
    return null;
  }
}

// Get actual bitrate from VOD playback info for accurate progress estimation
export async function getVodBitrate(videoNo: string, resolution?: string): Promise<number | null> {
  try {
    const url = `https://api.chzzk.naver.com/service/v1/videos/${videoNo}/video-playback-json`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      cache: "no-store"
    });

    if (!response.ok) {
      console.error(`[VodBitrate] API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Parse the playback JSON which contains video quality info
    // Structure: { videos: [{ encodingOption: { width, height, bitrate } }] }
    if (data.content && typeof data.content === "string") {
      const playbackData = JSON.parse(data.content);

      if (playbackData.videos && Array.isArray(playbackData.videos)) {
        // Find matching resolution or get highest
        let targetHeight = 1080; // Default
        if (resolution) {
          const match = resolution.match(/(\d+)p/);
          if (match) targetHeight = parseInt(match[1]);
        }

        // Find video matching target resolution
        const matchingVideo = playbackData.videos.find((v: any) =>
          v.encodingOption?.height === targetHeight
        );

        if (matchingVideo?.encodingOption?.bitrate) {
          const bitrate = matchingVideo.encodingOption.bitrate;
          console.log(`[VodBitrate] Found bitrate for ${targetHeight}p: ${bitrate} bps`);
          return bitrate; // in bits per second
        }

        // Fallback: get highest quality
        const sorted = playbackData.videos.sort((a: any, b: any) =>
          (b.encodingOption?.bitrate || 0) - (a.encodingOption?.bitrate || 0)
        );

        if (sorted[0]?.encodingOption?.bitrate) {
          const bitrate = sorted[0].encodingOption.bitrate;
          console.log(`[VodBitrate] Using highest bitrate: ${bitrate} bps`);
          return bitrate;
        }
      }
    }

    console.log("[VodBitrate] Could not parse playback data");
    return null;
  } catch (error) {
    console.error("[VodBitrate] Fetch failed:", error);
    return null;
  }
}

export async function getChannelSocials(channelId: string): Promise<{ type: string; url: string }[]> {
  try {
    const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/data?fields=socialLinks,donationRankingsExposure,channelHistory,achievementBadgeExposure,logPowerRankingExposure,logPowerActive`;
    console.log(`[Socials] Fetching URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!response.ok) {
      console.log(`[Socials] Response not OK: ${response.status}`);
      return [];
    }

    const data = await response.json();
    console.log(`[Socials] Raw Data:`, JSON.stringify(data, null, 2));

    if (data.code !== 200 || !data.content) {
      console.log(`[Socials] Invalid content or code: ${data.code}`);
      return [];
    }

    // Check if socialLinks exists
    if (!data.content.socialLinks) {
      return [];
    }

    const links = data.content.socialLinks.map((link: any) => {
      const url = link.landingUrl || link.url || "";
      let type = "OTHER";

      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        type = "YOUTUBE";
      } else if (url.includes("cafe.naver.com")) {
        type = "CAFE";
      } else if (url.includes("instagram.com")) {
        type = "INSTAGRAM";
      } else if (url.includes("twitter.com") || url.includes("x.com")) {
        type = "TWITTER";
      } else if (url.includes("facebook.com")) {
        type = "FACEBOOK";
      } else if (url.includes("discord.gg") || url.includes("discord.com")) {
        type = "DISCORD";
      }

      return { type, url };
    });

    return links;

  } catch (error) {
    console.error("[Socials] Fetch failed:", error);
    return [];
  }
}

const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

// Security note: We now prefer calling window.electron.openPath from the client.
// This action remains as a fallback and as a path resolver for the client.
export async function openDownloadFolder(
  folderPath: string,
  streamerName?: string,
  returnPathOnly: boolean = false
): Promise<boolean | string> {
  try {
    if (!folderPath) return false;
    let targetPath = folderPath;

    // Smart path resolution: If streamerName is provided and path doesn't end with it, try looking in subdirectory
    if (streamerName) {
      const sanitized = streamerName.replace(/[<>:"/\\|?*]/g, "");
      const subPath = path.join(folderPath, sanitized);
      if (!folderPath.endsWith(sanitized) && fs.existsSync(subPath)) {
        targetPath = subPath;
      }
    }

    if (!fs.existsSync(targetPath)) {
      console.warn(`Folder not found: ${targetPath}`);
      return false;
    }

    if (returnPathOnly) {
      return targetPath;
    }

    // Attempt to use electron shell if available in this context (Node)
    try {
      const { shell } = require('electron');
      if (shell?.openPath) {
        await shell.openPath(targetPath);
        return true;
      }
    } catch (e) {
      // Not in electron main/renderer thread context or module not found
    }

    // Fallback: Use sanitized start command (Legacy/Dev)
    // We wrap targetPath in double quotes and ensure no extra command injection characters
    const sanitizedPath = targetPath.replace(/"/g, ' ');
    exec(`start "" "${sanitizedPath}"`);
    return true;
  } catch (error) {
    console.error("Failed to open folder:", error);
    return false;
  }
}

export async function downloadChat(
  vodId: string,
  streamerName: string,
  videoTitle: string,
  videoTimestamp: number,
  savePath: string,
  requestFileName?: string
): Promise<{ success: boolean; filePath?: string; fileName?: string; folderPath?: string; chatCount?: number; error?: string }> {
  try {
    const sanitizedStreamer = streamerName.replace(/[<>:"/\\|?*]/g, "");

    let fileNameBase;
    if (requestFileName) {
      // Remove extension if present to get base
      const p = requestFileName.replace(/\.json$/i, "");
      fileNameBase = p.replace(/[<>:"/\\|?*]/g, "");
    } else {
      const sanitizedTitle = videoTitle.replace(/[<>:"/\\|?*]/g, "");
      const date = new Date(videoTimestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const timestampStr = `${year}-${month}-${day}`;
      fileNameBase = `[${timestampStr}][${sanitizedStreamer}] ${sanitizedTitle}`;
    }

    const folderPath = path.join(savePath, sanitizedStreamer);
    // Always save JSON initially
    const fullPathJson = path.join(folderPath, `${fileNameBase}.json`);
    const fullPathAss = path.join(folderPath, `${fileNameBase}.ass`);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    let nextMessageTime = 0;
    let allChats: any[] = [];
    let isFinished = false;

    let requestCount = 0;
    while (!isFinished) {
      const url = `https://api.chzzk.naver.com/service/v1/videos/${vodId}/chats?playerMessageTime=${nextMessageTime}`;

      requestCount++;
      console.log(`[ChatDownload] Fetching batch #${requestCount} (Time: ${nextMessageTime})`);

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        },
        cache: "no-store",
        method: "GET"
      });

      if (!response.ok) {
        if (response.status === 400) {
          throw new Error("NO_CHAT");
        }
        throw new Error(`Fetch failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.code !== 200 || !data.content) {
        break;
      }

      const chats = data.content.videoChats;
      if (chats && chats.length > 0) {
        allChats = [...allChats, ...chats];
      }

      nextMessageTime = data.content.nextPlayerMessageTime;
      if (!nextMessageTime) {
        isFinished = true;
      }

      // Safety delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const outputData = {
      data: allChats,
      meta: {
        vodId,
        streamerName,
        videoTitle,
        videoTimestamp,
        downloadDate: new Date().toISOString()
      }
    };

    fs.writeFileSync(fullPathJson, JSON.stringify(outputData, null, 2), "utf-8");

    // Only return JSON path
    return {
      success: true,
      filePath: fullPathJson,
      fileName: `${fileNameBase}.json`,
      folderPath: folderPath,
      chatCount: allChats.length
    };

  } catch (e: any) {
    console.error("Chat Download Error", e);
    return { success: false, error: e.message };
  }
}

export async function convertLocalJsonToAss(
  folderPath: string,
  fileName: string,
  settings: ChatSettings
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    let jsonFilePath = path.join(folderPath, fileName);

    if (!fs.existsSync(jsonFilePath)) {
      // Fuzzy search for file mismatch
      if (fs.existsSync(folderPath)) {
        const dirFiles = fs.readdirSync(folderPath);
        // Try to extract a core identifier from the provided fileName
        let coreName = fileName.replace(/_chat\.json$/i, "").replace(/\.json$/i, "");
        coreName = coreName.replace(/[<>:"/\\|?*]/g, "");

        console.log(`[Convert] Text match searching for "${coreName}" in ${folderPath}`);

        const match = dirFiles.find((f: string) => f.endsWith(".json") && f.includes(coreName));
        if (match) {
          console.log(`[Convert] Found fuzzy match: ${match}`);
          jsonFilePath = path.join(folderPath, match);
        } else {
          return { success: false, error: "JSON file not found (Fuzzy search failed)" };
        }
      } else {
        return { success: false, error: "Folder not found" };
      }
    }

    const fileContent = fs.readFileSync(jsonFilePath, "utf-8");
    const json = JSON.parse(fileContent);

    // Support both formats: raw chzzk response or our wrapped format
    const chats = Array.isArray(json) ? json : (json.data || json.content?.videoChats || []);

    let videoTimestamp = json.meta?.videoTimestamp;

    // Fallback to filename parsing
    if (!videoTimestamp) {
      const basename = path.basename(fileName);
      const match = basename.match(/^\[(\d{14})\]/);
      if (match) {
        const tsStr = match[1];
        // Format: YYYYMMDDHHMMSS (Local Time)
        const y = parseInt(tsStr.slice(0, 4));
        const m = parseInt(tsStr.slice(4, 6)) - 1;
        const d = parseInt(tsStr.slice(6, 8));
        const H = parseInt(tsStr.slice(8, 10));
        const M = parseInt(tsStr.slice(10, 12));
        const S = parseInt(tsStr.slice(12, 14));
        videoTimestamp = new Date(y, m, d, H, M, S).getTime();
      }
    }

    if (!videoTimestamp && chats.length > 0) {
      videoTimestamp = chats[0].messageTime - 1000;
    } else if (chats.length > 0 && videoTimestamp > chats[0].messageTime) {
      console.log(`[Convert] Adjusted videoTimestamp (${videoTimestamp}) to first message time (${chats[0].messageTime}) to prevent data loss.`);
      videoTimestamp = chats[0].messageTime;
    }

    // Final safety
    if (!videoTimestamp) {
      videoTimestamp = 0;
    }

    const assContent = generateAssFromChats(chats, settings, videoTimestamp);

    const assFilePath = jsonFilePath.replace(/\.json$/i, ".ass");
    // Write with BOM for Windows compatibility
    fs.writeFileSync(assFilePath, "\uFEFF" + assContent, "utf-8");

    return { success: true, filePath: assFilePath };

  } catch (e: any) {
    console.error("Conversion failed:", e);
    return { success: false, error: e.message };
  }
}

// --- Video Download Actions ---
import { videoDownloader } from "@/lib/video-downloader";

export async function startVideoDownload(
  jobId: string,
  url: string,
  basePath: string,
  fileName: string,
  streamerName?: string,
  resolution?: string,
  cookies?: { nidAut: string, nidSes: string },
  maxFragments?: number,
  downloadEngine?: "ytdlp-exe" | "streamlink",
  streamlinkPath?: string,
  durationSeconds?: number,
  bitrateBps?: number,
  tempPath?: string,
  thumbnailUrl?: string
) {
  try {
    const logPath = path.resolve("debug_actions.log");
    const fs = require('fs');
    fs.appendFileSync(logPath, `[startVideoDownload] Called with resolution: ${resolution}, fileName: ${fileName}, hasCookies: ${!!cookies}, maxFragments: ${maxFragments}\n`);
  } catch (e) {
    console.error("Failed to log action:", e);
  }

  let savePath = basePath;
  if (streamerName) {
    const sanitized = streamerName.replace(/[<>:"/\\|?*]/g, "");
    savePath = path.join(basePath, sanitized);
  }

  // Ensure temp path is relative to BASE path, not streamer subfolder, if not explicitly set
  const effectiveTempPath = tempPath || path.join(basePath, ".downloading");

  videoDownloader.start(jobId, url, savePath, fileName, resolution, cookies, maxFragments, downloadEngine, streamlinkPath, durationSeconds, bitrateBps, effectiveTempPath, thumbnailUrl);
  return { success: true };
}

export async function getVideoDownloadStatus(jobId: string) {
  const status = videoDownloader.getStatus(jobId);
  if (!status) return null;

  // Return a serializeable object (omit process)
  return {
    jobId: status.jobId,
    status: status.status,
    progress: status.progress,
    downloadedSize: status.downloadedSize,
    totalSize: status.totalSize,
    speed: status.speed,
    eta: status.eta,
    error: status.error,
    fileName: status.fileName,
    filePath: status.filePath,
    folderPath: status.filePath ? path.dirname(status.filePath) : undefined
  };
}

export async function cancelVideoDownload(jobId: string) {
  videoDownloader.cancel(jobId);
  return { success: true };
}

export async function deleteVideoFiles(jobId: string) {
  videoDownloader.deleteFiles(jobId);
  return { success: true };
}

export async function checkDownloadedFiles(
  vods: { videoNo: number, title: string, timestamp: number, streamerName: string }[],
  basePath: string
): Promise<number[]> {
  try {
    const existingIds: number[] = [];

    for (const vod of vods) {
      const sanitizedStreamer = vod.streamerName.replace(/[<>:"/\\|?*]/g, "");
      const sanitizedTitle = vod.title.replace(/[<>:"/\\|?*]/g, "");

      const date = new Date(vod.timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const timestampStr = `${year}-${month}-${day}`;

      const fileName = `[${timestampStr}][${sanitizedStreamer}] ${sanitizedTitle}.mp4`;

      // Check in streamer subdir (default)
      const path1 = path.join(basePath, sanitizedStreamer, fileName);
      // Check in root (fallback)
      const path2 = path.join(basePath, fileName);

      if (fs.existsSync(path1) || fs.existsSync(path2)) {
        existingIds.push(vod.videoNo);
      }
    }

    return existingIds;
    return existingIds;
  } catch (error) {
    console.error("Failed to check downloaded files:", error);
    return [];
  }
}

export async function checkFilesExistence(paths: string[]): Promise<Record<string, boolean>> {
  try {
    const results: Record<string, boolean> = {};
    for (const p of paths) {
      if (!p) {
        results[p] = false;
        continue;
      }
      try {
        results[p] = fs.existsSync(p);
      } catch (e) {
        results[p] = false;
      }
    }
    return results;
  } catch (error) {
    console.error("Failed to check files existence:", error);
    return {};
  }
}

