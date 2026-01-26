import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Hue: 0-360
  const h = Math.abs(hash) % 360;
  // Saturation: 70-85% for vibrancy
  const s = 75 + (Math.abs(hash) % 10);
  // Lightness: 60-70% for readability/pastel look
  const l = 60 + (Math.abs(hash) % 10);

  return `hsl(${h}, ${s}%, ${l}%)`;
}

export function generateFileName(
  template: string,
  meta: {
    title: string;
    streamer: string;
    date: string; // YYYY-MM-DD
    downloadDate?: string;
  }
): string {
  let name = template || "{title}";

  const replacements: Record<string, string> = {
    "{title}": meta.title,
    "{방송제목}": meta.title,
    "{date}": meta.date,
    "{published_at}": meta.date,
    "{방송날짜}": meta.date,
    "{streamer}": meta.streamer,
    "{channel}": meta.streamer,
    "{스트리머}": meta.streamer,
    "{download_date}": meta.downloadDate || new Date().toISOString().split("T")[0],
    "{다운로드날짜}": meta.downloadDate || new Date().toISOString().split("T")[0],
  };

  Object.entries(replacements).forEach(([key, value]) => {
    name = name.replaceAll(key, value || "");
  });

  // Sanitize
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}
