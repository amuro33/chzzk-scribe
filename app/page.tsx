"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { HomeContent } from "@/components/home-content";
import { useAppStore } from "@/lib/store";

export default function HomePage() {
  const downloads = useAppStore((state) => state.downloads);
  const activeDownloads = downloads.filter(
    (d) => d.status === "downloading" || d.status === "queued"
  ).length;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar activeDownloads={activeDownloads} />
      <main className="ml-16 flex-1 overflow-auto">
        <HomeContent />
      </main>
    </div>
  );
}
