"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";

/**
 * SecureCookieLoader
 * Loads encrypted Naver cookies from secure storage on app startup.
 * Uses Electron's safeStorage API for OS-level encryption.
 */
export function SecureCookieLoader() {
    const { naverCookies, setNaverCookies } = useAppStore();
    const loadedRef = useRef(false);

    useEffect(() => {
        // Only load once on mount
        if (loadedRef.current) return;
        loadedRef.current = true;

        const loadCookies = async () => {
            // Skip if already have cookies in memory
            if (naverCookies) {
                console.log("[SecureCookieLoader] Cookies already in memory");
                return;
            }

            // Only works in Electron environment
            if (typeof window === 'undefined' || !(window as any).electron?.loadEncryptedCookies) {
                console.log("[SecureCookieLoader] Not in Electron environment");
                return;
            }

            try {
                const cookies = await (window as any).electron.loadEncryptedCookies();
                if (cookies && cookies.nidAut && cookies.nidSes) {
                    setNaverCookies(cookies);
                    console.log("[SecureCookieLoader] Encrypted cookies loaded successfully");
                } else {
                    console.log("[SecureCookieLoader] No encrypted cookies found");
                }
            } catch (error) {
                console.error("[SecureCookieLoader] Failed to load encrypted cookies:", error);
            }
        };

        loadCookies();
    }, [naverCookies, setNaverCookies]);

    return null;
}
