"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {

  Search,
  History,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const mainNavItems: NavItem[] = [
  {
    href: "/",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[22px] w-[22px]"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
        <path d="M16 19h6" />
        <path d="M19 16v6" />
        <path d="M6 21v-2a4 4 0 0 1 4 -4h4" />
      </svg>
    ),
    label: "즐겨찾기"
  },
  { href: "/search", icon: <Search className="h-5 w-5" />, label: "Search" },
  {
    href: "/downloads",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859M12 3v8.25m0 0-3-3m3 3 3-3" />
      </svg>
    ),
    label: "Downloads",
    badge: 0,
  },
  {
    href: "/chat",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M12.006 19.98a9.869 9.869 0 0 1 -4.306 -.98l-4.7 1l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c1.993 1.7 2.93 4.041 2.746 6.344" />
        <path d="M19 16v6" />
        <path d="M22 19l-3 3l-3 -3" />
      </svg>
    ),
    label: "Chat",
  },

];



export function AppSidebar() {
  const pathname = usePathname();
  const { lastActiveStreamerId, downloads } = useAppStore();

  const activeVideoCount = downloads.filter(
    (d) => d.type === "video" && (d.status === "downloading" || d.status === "queued" || d.status === "converting")
  ).length;

  const activeChatCount = downloads.filter(
    (d) => d.type === "chat" && (d.status === "downloading" || d.status === "queued" || d.status === "converting")
  ).length;

  const settingsItem: NavItem = { href: "/settings", icon: <Settings className="h-5 w-5" />, label: "Settings" };
  const navItems = mainNavItems.filter(item => item.label !== "Settings");

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="fixed left-0 top-9 z-40 flex h-[calc(100vh-36px)] w-16 flex-col border-r border-sidebar-border bg-sidebar shadow-xl shadow-black/20">
        <div className="flex h-16 items-center justify-center">
          <Link href="/" className="flex items-center justify-center group">
            <svg
              className="h-7 w-7 transition-transform group-hover:scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="zapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="50%" stopColor="#14B8A6" />
                  <stop offset="100%" stopColor="#06B6D4" />
                </linearGradient>
              </defs>
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                fill="url(#zapGradient)"
                stroke="url(#zapGradient)"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col items-center gap-2 py-4">
          {navItems.map((item) => {
            let href = item.href;
            if (item.label === "Search" && lastActiveStreamerId && lastActiveStreamerId !== "all") {
              href = `/search?streamer=${lastActiveStreamerId}`;
            }

            const isActive = pathname === item.href || (item.label === "Search" && pathname.startsWith("/search"));

            let badgeCount = 0;
            if (item.label === "Downloads") badgeCount = activeVideoCount;
            if (item.label === "Chat") badgeCount = activeChatCount;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                      isActive
                        ? "bg-primary/20 text-primary shadow-md shadow-primary/20"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    {badgeCount > 0 && (
                      <Badge className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground font-bold shadow-lg shadow-primary/40">
                        {badgeCount}
                      </Badge>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={settingsItem.href}
                className={cn(
                  "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                  pathname === settingsItem.href
                    ? "bg-primary/20 text-primary shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
              >
                {settingsItem.icon}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {settingsItem.label}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
