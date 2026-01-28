"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { HomeContent } from "@/components/home-content";
import { useAppStore } from "@/lib/store";

export default function HomePage() {
  const downloads = useAppStore((state) => state.downloads);
  const appSettings = useAppStore((state) => state.appSettings);
  const router = useRouter();

  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued"
  ).length;

  // Redirect to settings if download path is not set (first-time user)
  useEffect(() => {
    if (!appSettings.downloadPath) {
      router.push("/settings?firstTime=true");
    }
  }, [appSettings.downloadPath, router]);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeDownloads={activeDownloads} />
      <main className="ml-16 flex-1 overflow-auto">
        <HomeContent />
      </main>
    </div>
  );
}
