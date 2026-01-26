"use client";

import { useState, useEffect } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NaverLoginButton } from "@/components/naver-login-button";
import { DiskSpaceIndicator } from "@/components/disk-space-indicator";

export function Titlebar() {
    const [isMaximized, setIsMaximized] = useState(false);
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        // Check if running in Electron
        if (typeof window !== "undefined" && window.electron) {
            setIsElectron(true);

            // Get initial maximized state
            window.electron.windowIsMaximized().then(setIsMaximized);

            // Listen for maximize state changes
            const cleanup = window.electron.onMaximizedChange(setIsMaximized);
            return cleanup;
        }
    }, []);

    // Don't render in browser
    if (!isElectron) return null;

    const handleMinimize = () => window.electron?.windowMinimize();
    const handleMaximize = () => window.electron?.windowMaximize();
    const handleClose = () => window.electron?.windowClose();

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[9999] flex h-9 select-none items-center justify-between bg-sidebar/80 backdrop-blur-sm border-b border-sidebar-border"
            style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >


            <div className="flex items-center px-4 gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                <span className="text-xs font-medium bg-primary/10 text-primary/80 px-2 py-0.5 rounded-full border border-primary/10">
                    (｡•̀ᴗ-)✧
                </span>
                <span className="text-xs font-medium text-muted-foreground/70">
                    치지직 스크라이브에 오신걸 환영합니다
                </span>
            </div>

            {/* Center: Empty Drag Region */}
            <div className="flex-1" />


            {/* Right: Window Controls */}
            <div
                className="flex h-full items-center gap-1"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
                {/* Disk Space Indicator */}
                <DiskSpaceIndicator />

                {/* Naver Login Button */}
                <div className="mr-1">
                    <NaverLoginButton />
                </div>

                {/* Divider */}
                <div className="h-4 w-px bg-border/50 mx-1" />
                {/* Minimize */}
                <button
                    onClick={handleMinimize}
                    className={cn(
                        "group flex h-full w-11 items-center justify-center transition-colors duration-150",
                        "hover:bg-muted/50 active:bg-muted/30"
                    )}
                    aria-label="Minimize"
                >
                    <Minus className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                </button>

                {/* Maximize/Restore */}
                <button
                    onClick={handleMaximize}
                    className={cn(
                        "group flex h-full w-11 items-center justify-center transition-colors duration-150",
                        "hover:bg-muted/50 active:bg-muted/30"
                    )}
                    aria-label={isMaximized ? "Restore" : "Maximize"}
                >
                    {isMaximized ? (
                        <div className="relative h-2.5 w-2.5">
                            <div className="absolute bottom-0 left-0 h-2 w-2 border border-muted-foreground/50 group-hover:border-muted-foreground transition-colors" />
                            <div className="absolute top-0 right-0 h-2 w-2 border border-muted-foreground/50 group-hover:border-muted-foreground bg-sidebar transition-colors" />
                        </div>
                    ) : (
                        <Square className="h-2.5 w-2.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    )}
                </button>

                {/* Close */}
                <button
                    onClick={handleClose}
                    className={cn(
                        "group flex h-full w-11 items-center justify-center transition-colors duration-150",
                        "hover:bg-red-500/80 active:bg-red-600"
                    )}
                    aria-label="Close"
                >
                    <X className="h-3 w-3 text-muted-foreground/50 group-hover:text-white transition-colors" />
                </button>
            </div>
        </div>
    );
}
