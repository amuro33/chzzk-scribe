"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export function DiskSpaceIndicator() {
    const { appSettings } = useAppStore();
    const [usage, setUsage] = useState<{ free: number; size: number; label: string } | null>(null);

    const updateDiskUsage = async () => {
        if (typeof window !== "undefined" && (window as any).electron?.getDiskUsage) {
            const data = await (window as any).electron.getDiskUsage(appSettings.downloadPath);
            if (data) {
                setUsage(data);
            }
        }
    };

    useEffect(() => {
        updateDiskUsage();
        const interval = setInterval(updateDiskUsage, 30000); // Update every 30 seconds
        return () => clearInterval(interval);
    }, [appSettings.downloadPath]);

    if (!usage) return null;

    const used = usage.size - usage.free;
    const usedPercent = Math.round((used / usage.size) * 100);
    const freePercent = 100 - usedPercent;

    // Human readable sizes
    const formatSize = (bytes: number) => {
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
        return `${gb.toFixed(1)} GB`;
    };

    // Color logic based on free space
    // If free < 10% or < 20GB, red/warning
    const isCritical = freePercent < 5 || (usage.free / (1024 * 1024 * 1024)) < 10;
    const isWarning = freePercent < 15 || (usage.free / (1024 * 1024 * 1024)) < 30;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-help">
                        <div className="relative flex items-center h-4 w-8 border border-muted-foreground/40 rounded-[2px] p-[1.5px] bg-background">
                            {/* Battery "Tip" (Disk style) */}
                            <div className="absolute -right-[2.5px] top-1/2 -translate-y-1/2 w-[1.5px] h-2 bg-muted-foreground/40 rounded-r-[1px]" />

                            {/* Progress Fill */}
                            <div
                                className={cn(
                                    "h-full rounded-[1px] transition-all duration-500",
                                    isCritical ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-green-500"
                                )}
                                style={{ width: `${freePercent}%` }}
                            />

                            {/* Percentage Text Overlay */}
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-foreground drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]">
                                {freePercent}%
                            </span>
                        </div>
                        <div className="flex items-center">
                            <span className="text-[10px] font-bold text-foreground whitespace-nowrap tabular-nums">
                                {formatSize(usage.free)}
                            </span>
                        </div>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs p-2">
                    <div className="space-y-1">
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">드라이브:</span>
                            <span className="font-semibold">{usage.label}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">전체 용량:</span>
                            <span className="font-semibold">{formatSize(usage.size)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">사용 중:</span>
                            <span className="font-semibold">{formatSize(used)} ({usedPercent}%)</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">사용 가능:</span>
                            <span className="font-semibold">{formatSize(usage.free)} ({freePercent}%)</span>
                        </div>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
