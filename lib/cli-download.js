const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sanitizeFileName, buildCookieHeader } = require('./chzzk-api');

function findFfmpeg(explicitPath) {
  if (explicitPath) return explicitPath;
  try {
    const ffmpeg = require('@ffmpeg-installer/ffmpeg');
    if (ffmpeg.path && fs.existsSync(ffmpeg.path)) return ffmpeg.path;
  } catch (_) {
    // Fall back to PATH.
  }
  return 'ffmpeg';
}

function findStreamlink(explicitPath) {
  if (explicitPath) return explicitPath;
  const bundled = path.join(__dirname, '..', 'bin', 'streamlink', 'bin', process.platform === 'win32' ? 'streamlink.exe' : 'streamlink');
  if (fs.existsSync(bundled)) return bundled;
  return 'streamlink';
}

function runProcess(command, args, { cwd, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => onLine?.(data.toString()));
    child.stderr.on('data', (data) => onLine?.(data.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function downloadVod({
  vodId,
  vodUrl,
  title = 'vod',
  streamerName = 'Unknown',
  outDir = process.cwd(),
  quality = 'best',
  cookies = null,
  streamlinkPath,
  ffmpegPath,
  dryRun = false,
  onProgress,
} = {}) {
  const finalUrl = vodUrl || `https://chzzk.naver.com/video/${vodId}`;
  const streamerDir = path.join(outDir, sanitizeFileName(streamerName) || 'Unknown');
  fs.mkdirSync(streamerDir, { recursive: true });
  const baseName = sanitizeFileName(`[${vodId || 'vod'}] ${title}`) || String(vodId || 'vod');
  const outputPath = path.join(streamerDir, `${baseName}.mp4`);
  const tempPath = path.join(streamerDir, `${baseName}.download.mp4`);

  const streamlink = findStreamlink(streamlinkPath);
  const ffmpeg = findFfmpeg(ffmpegPath);
  const args = ['--output', tempPath, '--force', '--progress', 'force', '--ffmpeg-ffmpeg', ffmpeg];
  const cookieHeader = buildCookieHeader(cookies);
  if (cookieHeader) args.push('--http-header', `Cookie=${cookieHeader}`);
  args.push(finalUrl, quality);

  if (dryRun) {
    return { success: true, dryRun: true, command: streamlink, args, outputPath };
  }

  await runProcess(streamlink, args, {
    onLine: (line) => {
      const match = line.match(/(\d+(?:\.\d+)?)%/);
      if (match) onProgress?.(Number(match[1]), line.trim());
      else if (line.trim()) onProgress?.(null, line.trim());
    },
  });

  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  fs.renameSync(tempPath, outputPath);
  return { success: true, filePath: outputPath };
}

module.exports = {
  downloadVod,
  findStreamlink,
  findFfmpeg,
};
