#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  readCookieInput,
  searchChannels,
  getChannelVideos,
  getVideoMeta,
  getVodBitrate,
  getLiveOpenTimestamp,
  downloadChat,
} = require('../lib/chzzk-api');
const { downloadVod } = require('../lib/cli-download');
const { mergeStreamLog } = require('../lib/merge-stream-log');
const { extractPersona } = require('../lib/persona-extractor');
const { startOAuthLogin, loadToken, clearToken, DEFAULT_TOKEN_PATH } = require('../lib/openai-oauth');

function usage() {
  console.log(`치지직 스크라이브 CLI

Usage:
  chzzk-scribe search <keyword> [--json] [--size 10]
  chzzk-scribe vods <channelId> [--json] [--page 0] [--size 10] [--sort LATEST] [--type]
  chzzk-scribe download <vodId|url> [--out ./downloads] [--quality best] [--cookies cookies.json] [--dry-run]
  chzzk-scribe chat <vodId> [--out ./downloads] [--name file.json]
  chzzk-scribe stream-log --chat chat.json --srt transcript.srt --out stream-log.md [--live-start-ms 0]
  chzzk-scribe persona <stream-log.md...> [--provider heuristic|openai|ollama] [--model MODEL] [--out persona.md] [--json-out persona.json]
  chzzk-scribe openai login --client-id ID --auth-url URL --token-url URL [--scope SCOPE]
  chzzk-scribe openai status
  chzzk-scribe openai logout
`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i += 1;
    }
  }
  return { positional, flags };
}

function print(data, json) {
  if (json) console.log(JSON.stringify(data, null, 2));
  else if (Array.isArray(data)) {
    for (const item of data) console.log(item);
  } else {
    console.log(data);
  }
}

function videoIdFromInput(input) {
  const match = String(input).match(/(?:video\/)?(\d+)/);
  return match ? match[1] : input;
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'search') {
    const { positional, flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    const keyword = positional.join(' ');
    if (!keyword) throw new Error('검색어가 필요합니다.');
    const channels = await searchChannels(keyword, { size: Number(flags.size || 30) });
    if (flags.json) print(channels, true);
    else {
      channels.forEach((channel) => console.log(`${channel.name}\t${channel.id}\t${channel.channelUrl}`));
    }
    return;
  }

  if (command === 'vods') {
    const { positional, flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    const channelId = positional[0];
    if (!channelId) throw new Error('channelId가 필요합니다.');
    const cookies = await readCookieInput(flags.cookies);
    const result = await getChannelVideos(channelId, {
      page: Number(flags.page || 0),
      size: Number(flags.size || 18),
      sortType: flags.sort || 'LATEST',
      videoType: flags.type || '',
      cookies,
    });
    if (flags.json) print(result, true);
    else {
      result.videos.forEach((vod) => {
        console.log(`${vod.videoNo}\t${vod.videoTitle || vod.title}\t${vod.publishDate || vod.createdDate || ''}`);
      });
    }
    return;
  }

  if (command === 'download') {
    const { positional, flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    const input = positional[0];
    if (!input) throw new Error('vodId 또는 CHZZK VOD URL이 필요합니다.');
    const vodId = videoIdFromInput(input);
    const meta = await getVideoMeta(vodId);
    const cookies = await readCookieInput(flags.cookies);
    const bitrate = await getVodBitrate(vodId, flags.quality).catch(() => null);
    const result = await downloadVod({
      vodId,
      vodUrl: input.startsWith('http') ? input : undefined,
      title: meta?.videoTitle || meta?.title || vodId,
      streamerName: meta?.channel?.channelName || meta?.channelName || 'Unknown',
      outDir: flags.out || process.cwd(),
      quality: flags.quality || 'best',
      cookies,
      streamlinkPath: flags.streamlink,
      ffmpegPath: flags.ffmpeg,
      dryRun: Boolean(flags['dry-run']),
      onProgress: (progress, line) => {
        if (progress !== null) process.stderr.write(`\r다운로드 ${progress}%`);
        else process.stderr.write(`\n${line}`);
      },
    });
    if (bitrate) result.bitrateBps = bitrate;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'chat') {
    const { positional, flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    const vodId = positional[0];
    if (!vodId) throw new Error('vodId가 필요합니다.');
    const meta = await getVideoMeta(vodId);
    const videoTimestamp = await getLiveOpenTimestamp(vodId, meta?.publishDateAt || meta?.createdDate || Date.now());
    const result = await downloadChat(vodId, {
      streamerName: meta?.channel?.channelName || meta?.channelName || 'Unknown',
      videoTitle: meta?.videoTitle || meta?.title || vodId,
      videoTimestamp,
      savePath: flags.out || process.cwd(),
      requestFileName: flags.name,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'stream-log') {
    const { flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    if (!flags.chat || !flags.srt || !flags.out) throw new Error('--chat, --srt, --out 이 필요합니다.');
    const merged = await mergeStreamLog(flags.chat, flags.srt, flags.out, Number(flags['live-start-ms'] || 0));
    const jsonOut = flags['json-out'] || flags.out.replace(/\.md$/i, '.stream-log.json');
    fs.writeFileSync(jsonOut, JSON.stringify(merged, null, 2), 'utf8');
    console.log(JSON.stringify({ success: true, filePath: path.resolve(flags.out), jsonPath: path.resolve(jsonOut), events: merged.events.length }, null, 2));
    return;
  }

  if (command === 'persona') {
    const { positional, flags } = parseArgs([subcommand, ...rest].filter(Boolean));
    if (!positional.length) throw new Error('stream-log 파일 경로가 필요합니다.');
    const result = await extractPersona(positional, {
      provider: flags.provider || 'heuristic',
      model: flags.model,
      out: flags.out,
      jsonOut: flags['json-out'],
      apiKey: flags['api-key'] || process.env.OPENAI_API_KEY,
      tokenPath: flags['token-path'] || DEFAULT_TOKEN_PATH,
      baseUrl: flags['base-url'],
      glossary: flags.glossary,
      maxChars: flags['max-chars'] ? Number(flags['max-chars']) : undefined,
    });
    if (!flags.out) console.log(result.content);
    else console.log(JSON.stringify({ success: true, filePath: path.resolve(flags.out), provider: result.provider, model: result.model }, null, 2));
    return;
  }

  if (command === 'openai') {
    const { flags } = parseArgs(rest);
    if (subcommand === 'login') {
      const scopes = flags.scope
        ? String(flags.scope).split(/[ ,]+/).filter(Boolean)
        : ['openid', 'profile', 'email'];
      const result = await startOAuthLogin({
        clientId: flags['client-id'],
        authorizationUrl: flags['auth-url'],
        tokenUrl: flags['token-url'],
        scopes,
        redirectUri: flags['redirect-uri'],
        tokenPath: flags['token-path'] || DEFAULT_TOKEN_PATH,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (subcommand === 'status') {
      const token = loadToken(flags['token-path'] || DEFAULT_TOKEN_PATH);
      console.log(JSON.stringify({ authenticated: Boolean(token), tokenPath: flags['token-path'] || DEFAULT_TOKEN_PATH, savedAt: token?.savedAt || null }, null, 2));
      return;
    }
    if (subcommand === 'logout') {
      clearToken(flags['token-path'] || DEFAULT_TOKEN_PATH);
      console.log(JSON.stringify({ success: true }, null, 2));
      return;
    }
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
