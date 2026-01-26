import React from "react"
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "치지직 스크라이브",
  description: "Modern VOD and Chat downloader for Chzzk streaming platform",
  generator: 'v0.app'
};

import { DownloadProcessor } from "@/components/download-processor";
import { SecureCookieLoader } from "@/components/secure-cookie-loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Titlebar } from "@/components/titlebar";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Titlebar />
          <div className="pt-9">
            {children}
          </div>
          <DownloadProcessor />
          <SecureCookieLoader />
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}

