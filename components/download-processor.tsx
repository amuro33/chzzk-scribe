"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { ipcBridge } from "@/lib/ipc-bridge";
import { toast } from "sonner";

export function DownloadProcessor() {
    const { downloads, updateDownload } = useAppStore();
    const processingRef = useRef<Set<string>>(new Set());
    const mountedRef = useRef(false);

    // Helper to start polling for a specific item
    const startPolling = (itemId: string) => {
        const pollInterval = setInterval(async () => {
            // Check if we should still be polling this item
            const currentItem = useAppStore.getState().downloads.find(d => d.id === itemId);
            if (!currentItem || (currentItem.status !== "downloading" && currentItem.status !== "converting")) {
                // If it's paused, completed, or removed, stop polling
                clearInterval(pollInterval);
                processingRef.current.delete(itemId);
                return;
            }

            const status = await ipcBridge.getVideoDownloadStatus(itemId);
            if (status) {
                if (status.status === "completed") {
                    clearInterval(pollInterval);
                    updateDownload(itemId, {
                        status: "completed",
                        progress: 100,
                        downloadedSize: status.downloadedSize,
                        totalSize: status.totalSize,
                        eta: "-",
                        speed: "-",
                        folderPath: status.folderPath,
                        savePath: status.savePath,
                        fileName: status.fileName
                    });
                    toast.success(`다운로드 완료`);
                    processingRef.current.delete(itemId);
                } else if (status.status === "failed") {
                    clearInterval(pollInterval);
                    updateDownload(itemId, { status: "failed", error: status.error || "Download failed" });
                    toast.error(`다운로드 실패`);
                    processingRef.current.delete(itemId);
                } else if (status.status === "converting") {
                    updateDownload(itemId, {
                        status: "converting",
                        progress: 100,
                        downloadedSize: status.downloadedSize,
                        totalSize: status.totalSize,
                        eta: "마무리 작업 중",
                        folderPath: status.folderPath
                    });
                } else if (status.status === "downloading") {
                    // Update progress
                    updateDownload(itemId, {
                        status: "downloading",
                        progress: status.progress,
                        downloadedSize: status.downloadedSize,
                        totalSize: status.totalSize,
                        speed: status.speed,
                        eta: status.eta,
                        savePath: status.savePath,
                        fileName: status.fileName
                    });
                }
            } else {
                // Status null implies job not found on server (server restarted?)
                // Only treat as error if we expected it to be running.
                // We'll give it a few retries or fail immediately?
                // For now, if we are polling and it's gone, it's failed.
                clearInterval(pollInterval);
                updateDownload(itemId, { status: "failed", error: "Session lost (Server restarted)" });
                processingRef.current.delete(itemId);
            }
        }, 1000);
        return pollInterval;
    };

    // Unified queue processing effect
    useEffect(() => {
        const processQueue = async () => {
            const state = useAppStore.getState();
            const { downloads, updateDownload, appSettings } = state;
            const concurrentLimit = appSettings.concurrentDownloads || 3;

            // 0. Cleanup Helper: Remove stale IDs from processingRef
            // If an item is in processingRef but its status is 'failed', 'paused', or 'completed', it shouldn't be there.
            // (Unless it's in the split-second transition of being processed, but usually we update status immediately)
            for (const id of processingRef.current) {
                const item = downloads.find(d => d.id === id);
                if (!item || (item.status !== "downloading" && item.status !== "converting" && item.status !== "queued")) {
                    // console.log(`[Processor] Cleanup stale ID: ${id} (Status: ${item?.status})`);
                    processingRef.current.delete(id);
                }
            }

            // 1. Identify currently active downloads (server-side process running)
            // "downloading" and "converting" count towards the limit
            const activeItems = downloads.filter(d =>
                (d.status === "downloading" || d.status === "converting")
            );

            // 2. Poll active items to update UI
            for (const item of activeItems) {
                // If not already being polled, start polling (Resume Logic)
                // We use a simplified check: if it's active but we haven't touched it recently/ever in this session.
                // However, since we re-run this loop every few seconds, we need to be careful not to start multiple pollers.
                // "startPolling" creates an interval. We should only call it if we aren't already tracking it.

                if (!processingRef.current.has(item.id)) {
                    console.log(`[Processor] Found active item not being polled: ${item.id}`);
                    processingRef.current.add(item.id);
                    // Verify if job exists on server
                    const status = await ipcBridge.getVideoDownloadStatus(item.id);
                    if (status) {
                        startPolling(item.id);
                    } else {
                        console.warn(`[Processor] Job ${item.id} dead. Marking failed.`);
                        updateDownload(item.id, { status: "failed", error: "Session lost" });
                        processingRef.current.delete(item.id);
                    }
                }
            }

            // 3. Process new queue items if slots available
            const activeCount = activeItems.length;
            const slotsAvailable = concurrentLimit - activeCount;

            if (slotsAvailable > 0) {
                const queuedItems = downloads.filter(d => d.status === "queued");
                const nextItems = queuedItems.slice(0, slotsAvailable);

                for (const item of nextItems) {
                    if (processingRef.current.has(item.id)) continue;
                    processingRef.current.add(item.id); // Mark as claimed immediately

                    console.log(`[Processor] Starting download for ${item.id}`);

                    try {
                        if (item.type === "chat") {
                            updateDownload(item.id, { status: "downloading", progress: 0 });
                            const result = await ipcBridge.downloadChat(
                                item.vodId,
                                item.streamerName || "Unknown",
                                item.title,
                                item.timestamp || 0,
                                item.savePath,
                                item.fileName
                            );
                            if (result.success) {
                                updateDownload(item.id, {
                                    status: "completed",
                                    progress: 100,
                                    downloadedSize: "Done",
                                    fileName: result.fileName || item.fileName,
                                    folderPath: result.folderPath,
                                    chatCount: result.chatCount
                                });
                                toast.success(`다운로드 완료: ${result.fileName}`);
                            } else {
                                if (result.error === "자막은 지난방송만 다운로드 가능합니다. 업로드 영상은 채팅이 존재하지않습니다.") {
                                    state.removeDownload(item.id);
                                } else {
                                    updateDownload(item.id, {
                                        status: "failed",
                                        error: result.error || "자막 다운로드 실패"
                                    });
                                }
                                toast.error(result.error || "자막 다운로드 실패");
                            }
                            processingRef.current.delete(item.id); // Done
                        }
                        else if (item.type === "video") {
                            updateDownload(item.id, { status: "downloading", progress: 0 });
                            const videoUrl = `https://chzzk.naver.com/video/${item.vodId}`;

                            // Naver Cookies for Age-Restricted Videos
                            const cookies = state.naverCookies ? {
                                nidAut: state.naverCookies.nidAut,
                                nidSes: state.naverCookies.nidSes
                            } : undefined;

                            // Fetch actual bitrate for Streamlink progress estimation
                            let bitrateBps = item.bitrateBps;
                            if (!bitrateBps && appSettings.downloadEngine === "streamlink") {
                                try {
                                    bitrateBps = await ipcBridge.getVodBitrate(item.vodId, item.resolution) ?? undefined;
                                    if (bitrateBps) {
                                        console.log(`[Processor] Got bitrate for ${item.vodId}: ${bitrateBps} bps`);
                                    }
                                } catch (e) {
                                    console.warn("[Processor] Failed to get bitrate:", e);
                                }
                            }

                            await ipcBridge.startVideoDownload(
                                item.id,
                                videoUrl,
                                item.savePath || "Downloads",
                                item.fileName,
                                item.streamerName || "Unknown",
                                item.resolution || "best",
                                cookies,
                                appSettings.maxConcurrentFragments || 16,
                                appSettings.downloadEngine,
                                appSettings.streamlinkPortable ? (appSettings.streamlinkPath || "") : "",
                                item.durationSeconds || 0,
                                bitrateBps || 0,
                                appSettings.tempPath || "", // Pass temp path setting
                                appSettings.saveThumbnail ? item.thumbnailUrl : undefined
                            );

                            // Hand off to poller
                            startPolling(item.id);
                        }
                    } catch (error: any) {
                        console.error(`[Processor] Error processing ${item.id}:`, error);

                        if (error.message === "NO_CHAT") {
                            state.removeDownload(item.id);
                            toast.error(`채팅 내역이 없어 삭제되었습니다: ${item.fileName}`);
                        } else {
                            updateDownload(item.id, { status: "failed", error: error.message || "Failed" });
                            toast.error(`다운로드 시작 실패: ${item.fileName}`);
                        }

                        processingRef.current.delete(item.id); // Release lock so it doesn't block
                    }
                }
            }
        };

        const interval = setInterval(processQueue, 2000);
        return () => clearInterval(interval);
    }, []); // Dependency array empty to avoid resets. State accessed via getState()

    return null;
}
