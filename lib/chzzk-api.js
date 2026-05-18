const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0';

function sanitizeFileName(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCookieHeader(cookies) {
  if (!cookies) return undefined;
  if (typeof cookies === 'string') return cookies;
  const pairs = [];
  if (cookies.nidAut) pairs.push(`NID_AUT=${cookies.nidAut}`);
  if (cookies.nidSes) pairs.push(`NID_SES=${cookies.nidSes}`);
  return pairs.length ? pairs.join('; ') : undefined;
}

async function readCookieInput(cookiePath) {
  if (!cookiePath) return null;
  const raw = fs.readFileSync(cookiePath, 'utf8').trim();
  if (!raw) return null;
  if (raw.startsWith('{')) return JSON.parse(raw);
  return raw;
}

async function fetchJson(url, options = {}) {
  const headers = { 'User-Agent': USER_AGENT, ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    throw new Error(`CHZZK API failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function searchChannels(keyword, { offset = 0, size = 30 } = {}) {
  const url = `https://api.chzzk.naver.com/service/v1/search/channels?keyword=${encodeURIComponent(keyword)}&offset=${offset}&size=${size}`;
  const data = await fetchJson(url);
  return (data.content?.data || []).map((item) => ({
    id: item.channel.channelId,
    name: item.channel.channelName,
    avatarUrl: item.channel.channelImageUrl || '',
    channelUrl: `https://chzzk.naver.com/${item.channel.channelId}`,
    description: item.channel.channelDescription || '',
    isVerified: Boolean(item.channel.verifiedMark),
  }));
}

async function getChannelVideos(channelId, {
  page = 0,
  size = 18,
  sortType = 'LATEST',
  videoType = '',
  cookies = null,
} = {}) {
  const headers = {};
  const cookieHeader = buildCookieHeader(cookies);
  if (cookieHeader) headers.Cookie = cookieHeader;
  const url = `https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos?sortType=${sortType}&page=${page}&size=${size}&videoType=${videoType}`;
  const data = await fetchJson(url, { headers });
  const content = data.content || {};
  return {
    videos: content.data || [],
    page: content.page || 0,
    size,
    totalCount: content.totalCount || 0,
    totalPages: content.totalPages || 0,
  };
}

async function getVideoMeta(videoNo) {
  const data = await fetchJson(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}`);
  return data.content || null;
}

async function getVodBitrate(videoNo, resolution) {
  const data = await fetchJson(`https://api.chzzk.naver.com/service/v1/videos/${videoNo}/video-playback-json`);
  const playback = JSON.parse(data.content);
  let targetHeight = 1080;
  const match = resolution && String(resolution).match(/(\d+)p/);
  if (match) targetHeight = Number(match[1]);
  const selected = playback.videos?.find((video) => video.encodingOption?.height === targetHeight)
    || playback.videos?.sort((a, b) => (b.encodingOption?.bitrate || 0) - (a.encodingOption?.bitrate || 0))[0];
  return selected?.encodingOption?.bitrate || null;
}

async function getLiveOpenTimestamp(vodId, fallbackTimestamp) {
  try {
    const data = await fetchJson(`https://api.chzzk.naver.com/service/v3/videos/${vodId}`);
    const liveOpenDate = data.content?.liveOpenDate;
    if (liveOpenDate) return new Date(liveOpenDate).getTime();
  } catch (_) {
    // Keep the caller's fallback when CHZZK does not expose v3 metadata.
  }
  return fallbackTimestamp || 0;
}

async function downloadChat(vodId, {
  streamerName = 'Unknown',
  videoTitle = 'Unknown',
  videoTimestamp = Date.now(),
  savePath = process.cwd(),
  requestFileName,
  delayMs = 50,
} = {}) {
  const sanitizedStreamer = sanitizeFileName(streamerName) || 'Unknown';
  let fileNameBase = requestFileName
    ? sanitizeFileName(requestFileName.replace(/\.json$/i, ''))
    : null;

  if (!fileNameBase) {
    const date = new Date(videoTimestamp);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    fileNameBase = `[${yyyy}-${mm}-${dd}][${sanitizedStreamer}] ${sanitizeFileName(videoTitle)}`;
  }

  const folderPath = path.join(savePath, sanitizedStreamer);
  const filePath = path.join(folderPath, `${fileNameBase}.json`);
  fs.mkdirSync(folderPath, { recursive: true });

  let nextMessageTime = 0;
  let prevMessageTime = -1;
  const allChats = [];

  while (true) {
    const data = await fetchJson(`https://api.chzzk.naver.com/service/v1/videos/${vodId}/chats?playerMessageTime=${nextMessageTime}`);
    if (!data.content || !data.content.videoChats) break;
    allChats.push(...data.content.videoChats);
    const next = data.content.nextPlayerMessageTime;
    if (!next || next === nextMessageTime || next === prevMessageTime) break;
    prevMessageTime = nextMessageTime;
    nextMessageTime = next;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (allChats.length === 0) {
    throw new Error('자막은 지난방송만 다운로드 가능합니다. 업로드 영상은 채팅이 존재하지 않습니다.');
  }

  const payload = {
    data: allChats,
    meta: {
      vodId,
      streamerName,
      videoTitle,
      videoTimestamp,
      downloadDate: new Date().toISOString(),
    },
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { success: true, filePath, fileName: `${fileNameBase}.json`, folderPath, chatCount: allChats.length };
}

module.exports = {
  USER_AGENT,
  sanitizeFileName,
  buildCookieHeader,
  readCookieInput,
  searchChannels,
  getChannelVideos,
  getVideoMeta,
  getVodBitrate,
  getLiveOpenTimestamp,
  downloadChat,
};
