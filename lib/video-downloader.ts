import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import fs from "fs";

interface DownloadJob {
    jobId: string;
    process: ChildProcessWithoutNullStreams;
    status: "queued" | "downloading" | "converting" | "completed" | "failed";
    progress: number;
    downloadedSize: string;
    totalSize: string;
    speed: string;
    eta: string;
    error?: string;
    fileName?: string;
    filePath?: string;
    savePath?: string;
    tempPath?: string;
    durationSeconds?: number;
    estimatedSizeBytes?: number;
}

class VideoDownloader {
    private jobs: Map<string, DownloadJob> = new Map();

    start(jobId: string, url: string, savePath: string, fileName: string, resolution?: string, cookies?: { nidAut: string, nidSes: string }, maxFragments?: number, downloadEngine: "ytdlp-exe" | "streamlink" = "ytdlp-exe", streamlinkPath?: string, durationSeconds?: number, bitrateBps?: number, tempPath?: string, thumbnailUrl?: string): void {
        if (this.jobs.has(jobId)) {
            const existingJob = this.jobs.get(jobId);
            if (existingJob && (existingJob.status === "downloading" || existingJob.status === "converting")) {
                console.log(`Job ${jobId} already running.`);
                return;
            }
            console.log(`Job ${jobId} exists with status ${existingJob?.status}. Restarting...`);
            this.jobs.delete(jobId);
        }

        // Sanitize filename
        fileName = fileName.replace(/[<>:"/\\|?*]/g, "_");

        // Determine working directory (temp path)
        const workDir = tempPath || path.join(savePath, ".downloading");
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }

        // Ensure save directory exists
        if (!fs.existsSync(savePath)) {
            fs.mkdirSync(savePath, { recursive: true });
        }

        console.log(`[VideoDownloader] Starting job ${jobId} for ${url} with engine: ${downloadEngine}`);
        console.log(`[VideoDownloader] Work Dir: ${workDir}`);

        // Handle Cookies (Streamlink uses --http-header, no file needed)
        let cookieHeader = "";

        if (cookies) {
            cookieHeader = `NID_AUT=${cookies.nidAut}; NID_SES=${cookies.nidSes}`;
        }

        // Download Thumbnail if URL provided
        if (thumbnailUrl) {
            (async () => {
                try {
                    console.log(`[VideoDownloader] Downloading thumbnail: ${thumbnailUrl}`);
                    const thumbResponse = await fetch(thumbnailUrl, {
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Cookie": cookieHeader
                        }
                    });

                    if (thumbResponse.ok) {
                        const buffer = await thumbResponse.arrayBuffer();
                        // Determine extension from content-type or default to jpg
                        let ext = ".jpg";
                        const contentType = thumbResponse.headers.get("content-type");
                        if (contentType?.includes("png")) ext = ".png";

                        const thumbName = fileName.replace(/\.[^/.]+$/, "") + ext;
                        const thumbPath = path.join(savePath, thumbName);

                        fs.writeFileSync(thumbPath, Buffer.from(buffer));
                        console.log(`[VideoDownloader] Thumbnail saved to: ${thumbPath}`);
                    } else {
                        console.error(`[VideoDownloader] Thumbnail fetch failed: ${thumbResponse.status}`);
                    }
                } catch (e) {
                    console.error(`[VideoDownloader] Thumbnail download error:`, e);
                }
            })();
        }

        // FFmpeg Path Resolution
        let ffmpegPath = "";
        try {
            ffmpegPath = require('ffmpeg-static');
            if (!ffmpegPath || ffmpegPath.startsWith('\\ROOT') || !fs.existsSync(ffmpegPath)) {
                const ext = process.platform === 'win32' ? '.exe' : '';
                ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', `ffmpeg${ext}`);
            }
        } catch (e) {
            const ext = process.platform === 'win32' ? '.exe' : '';
            ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', `ffmpeg${ext}`);
        }

        let command = "";
        let spawnArgs: string[] = [];
        const isStreamlink = downloadEngine === "streamlink";

        if (isStreamlink) {
            // Priority: 1. Custom path (portable), 2. Known MS Store Python path, 3. PATH
            // Priority: 1. Custom path, 2. Bundled (bin/streamlink), 3. MS Store/PATH
            if (streamlinkPath && fs.existsSync(streamlinkPath)) {
                command = streamlinkPath;
                console.log(`[VideoDownloader] Using custom Streamlink at: ${command}`);
            } else {
                // Check bundled path (Dev and Prod)
                const bundledDev = path.join(process.cwd(), 'bin', 'streamlink', 'bin', 'streamlink.exe');
                const bundledProd = path.join((process as any).resourcesPath || '', 'bin', 'streamlink', 'bin', 'streamlink.exe');

                if (fs.existsSync(bundledDev)) {
                    command = bundledDev;
                    console.log(`[VideoDownloader] Using bundled Streamlink (Dev): ${command}`);
                } else if (fs.existsSync(bundledProd)) {
                    command = bundledProd;
                    console.log(`[VideoDownloader] Using bundled Streamlink (Prod): ${command}`);
                } else {
                    // Fallback to existing logic (MS Store / PATH)
                    const userHome = process.env.USERPROFILE || "";
                    const scriptsPath = path.join(userHome, "AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python313\\Scripts");
                    const streamlinkShim = path.join(scriptsPath, "streamlink.exe");

                    if (fs.existsSync(streamlinkShim)) {
                        command = streamlinkShim;
                        console.log(`[VideoDownloader] Found system Streamlink at: ${command}`);
                    } else {
                        command = "streamlink"; // Fallback to PATH
                        console.log(`[VideoDownloader] Using Streamlink from PATH`);
                    }
                }
            }

            const finalFilePath = path.join(savePath, fileName);

            spawnArgs = [
                "--output", finalFilePath,
                "--force",
                "--progress=force",
                "--stream-segment-threads=3",
                "--http-header", "User-Agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "--ffmpeg-ffmpeg", ffmpegPath
            ];

            if (cookies) {
                spawnArgs.push("--http-header", `Cookie=NID_AUT=${cookies.nidAut}; NID_SES=${cookies.nidSes}`);
            }

            // Positional arguments at the end: URL first, then Stream
            spawnArgs.push(url);
            spawnArgs.push("best");

        } else {
            // yt-dlp logic (exe only)
            command = "yt-dlp"; // Default global
            const localYtDlpPath = path.join(process.cwd(), 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp.exe');
            if (fs.existsSync(localYtDlpPath)) {
                command = localYtDlpPath;
            }

            // Use temp directory for intermediate files
            const tsFileName = fileName.replace(/\.mp4$/, '.ts');
            const outputTemplate = path.join(workDir, `${tsFileName}`);

            // Format Selector
            let formatSelector = "bestvideo+bestaudio/best";
            if (resolution) {
                const heightMatch = resolution.match(/(\d+)p/);
                if (heightMatch) {
                    const height = heightMatch[1];
                    formatSelector = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;
                }
            }

            const activeArgs = [
                "--newline",
                "-f", formatSelector,
                "-N", String(Math.max(1, maxFragments || 3)),
                "--retries", "10",
                "--fragment-retries", "10",
                "--no-mtime",
                "--ffmpeg-location", ffmpegPath,
                "-o", outputTemplate,
            ];


            activeArgs.push(url);

            spawnArgs = activeArgs;
        }

        console.log(`[VideoDownloader] Spawning: ${command} ARGS: ${JSON.stringify(spawnArgs)}`);

        const processInstance = spawn(command, spawnArgs, {
            shell: false
        });

        // Calculate estimated size based on bitrate and duration (for Streamlink progress)
        let estimatedSizeBytes: number | undefined;
        if (durationSeconds && isStreamlink) {
            // Use actual bitrate from API if available, otherwise estimate
            let bitrateToUse = bitrateBps; // in bits per second (VIDEO ONLY from API!)
            if (!bitrateToUse) {
                // Fallback to estimated bitrates (video only)
                let bitrateKbps = 5000; // Default to 1080p
                if (resolution) {
                    if (resolution.includes("1080")) bitrateKbps = 8000;
                    else if (resolution.includes("720")) bitrateKbps = 3000;
                    else if (resolution.includes("480")) bitrateKbps = 1500;
                    else if (resolution.includes("360")) bitrateKbps = 1000;
                }
                bitrateToUse = bitrateKbps * 1000;
                console.log(`[VideoDownloader] Using estimated bitrate: ${bitrateKbps} kbps`);
            } else {
                console.log(`[VideoDownloader] Using actual bitrate from API: ${(bitrateToUse / 1000).toFixed(0)} kbps`);
            }

            // Add estimated audio bitrate (typically 128-320 kbps, use 256 kbps as average)
            const audioBitrateBps = 256 * 1000; // 256 kbps audio
            bitrateToUse += audioBitrateBps;

            // Apply safety multiplier for container overhead, VBR variance, etc.
            // Using 1.08 (8% overhead) to prevent reaching 99% too early
            const overheadMultiplier = 1.08;

            estimatedSizeBytes = ((bitrateToUse / 8) * durationSeconds) * overheadMultiplier;
            const estimatedGB = (estimatedSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
            console.log(`[VideoDownloader] Estimated size: ${estimatedGB} GiB (${durationSeconds}s, with audio + 8% overhead)`);
        }

        const job: DownloadJob = {
            jobId,
            process: processInstance,
            status: "downloading",
            progress: 0,
            downloadedSize: "0",
            totalSize: estimatedSizeBytes ? `${(estimatedSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB` : "-",
            speed: "-",
            eta: "-",
            fileName: fileName,
            savePath: savePath,
            tempPath: workDir,

            durationSeconds: durationSeconds,
            estimatedSizeBytes: estimatedSizeBytes
        };

        this.jobs.set(jobId, job);

        let buffer = "";

        processInstance.stdout.on("data", (data: Buffer) => {
            buffer += data.toString();
            // Streamlink uses \r for progress updates, so split by \r or \n
            const lines = buffer.split(/[\r\n]+/);
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.trim()) {
                    if (isStreamlink) {
                        this.parseStreamlinkProgress(job, line);
                    } else {
                        this.parseProgress(job, line);
                    }
                }
            }
        });

        processInstance.stderr.on("data", (data: Buffer) => {
            console.error(`[VideoDownloader Stderr]: ${data.toString()}`);
        });

        processInstance.stderr.on("data", (data: Buffer) => {
            // Streamlink outputs progress to stderr
            const text = data.toString();
            if (isStreamlink) {
                // Split by \r or \n to handle progress updates
                const lines = text.split(/[\r\n]+/);
                for (const line of lines) {
                    if (line.trim()) {
                        this.parseStreamlinkProgress(job, line);
                    }
                }
            }
        });

        processInstance.on("close", (code) => {
            console.log(`[VideoDownloader] Job ${jobId} closed with code ${code}`);

            if (code === 0) {
                if (downloadEngine === "streamlink") {
                    // Streamlink downloads directly to target usually
                    job.status = "completed";
                    job.progress = 100;
                    job.downloadedSize = job.totalSize !== '-' ? job.totalSize : "Done";
                    job.filePath = path.join(savePath, fileName);


                } else {
                    // yt-dlp needs remux
                    // We need to look for the file in workDir (temp folder)
                    const tsFileName = fileName.replace(/\.mp4$/, '.ts');

                    // Input is in temp folder
                    // Note: We need to access workDir here. 
                    // Since it's local scope in start(), we should store it in job or use closure.
                    // Closure is fine here since this callback is defined within start().
                    const outputTemplate = path.join(workDir, `${tsFileName}`);
                    const finalMp4Path = path.join(savePath, fileName);

                    this.processWithFfmpeg(jobId, outputTemplate, finalMp4Path, ffmpegPath);
                }
            } else {
                job.status = "failed";
                job.error = `Exited with code ${code}`;
            }
        });
    }

    private parseStreamlinkProgress(job: DownloadJob, line: string) {
        // Actual Streamlink output format:
        // [download] Written 20.41 GiB to C:\path\file.mp4 (3m40s @ 105.52 MiB/s)

        if (line.includes("Written")) {
            // Size: "Written 20.41 GiB to" - need to capture number and unit
            const sizeMatch = line.match(/Written\s+([\d\.]+)\s*(\w+)\s+to/);
            if (sizeMatch) {
                const sizeValue = parseFloat(sizeMatch[1]);
                const sizeUnit = sizeMatch[2].toUpperCase();
                job.downloadedSize = `${sizeValue} ${sizeMatch[2]}`;

                // Convert to bytes for progress calculation
                let downloadedBytes = sizeValue;
                if (sizeUnit.includes("GIB") || sizeUnit.includes("GB")) {
                    downloadedBytes = sizeValue * 1024 * 1024 * 1024;
                } else if (sizeUnit.includes("MIB") || sizeUnit.includes("MB")) {
                    downloadedBytes = sizeValue * 1024 * 1024;
                } else if (sizeUnit.includes("KIB") || sizeUnit.includes("KB")) {
                    downloadedBytes = sizeValue * 1024;
                }

                // Calculate progress percentage if we have estimated size
                if (job.estimatedSizeBytes && job.estimatedSizeBytes > 0) {
                    job.progress = Math.min(99, Math.round((downloadedBytes / job.estimatedSizeBytes) * 100));
                }
            }

            // Speed & Progress Parsing
            // Regex to capture: "3m40s @ 105.52 MiB/s"
            // Streamlink format: [download] Written 20.41 GiB to ... (3m40s @ 105.52 MiB/s)

            const metaMatch = line.match(/\((.*?)\s+@\s+([\d\.]+)\s+(\w+\/s)\)/);
            if (metaMatch) {
                // metaMatch[1] = time elapsed (e.g. 3m40s)
                const speedValue = parseFloat(metaMatch[2]);
                const speedUnit = metaMatch[3].toUpperCase();
                job.speed = `${speedValue} ${metaMatch[3]}`;

                // Calculate ETA
                if (job.estimatedSizeBytes && job.progress > 0) {
                    let speedBytesPerSec = speedValue;
                    if (speedUnit.includes("HIB") || speedUnit.includes("GIB") || speedUnit.includes("GB")) { // Streamlink might use bits? No, usually Bytes.
                        speedBytesPerSec = speedValue * 1024 * 1024 * 1024;
                    } else if (speedUnit.includes("MIB") || speedUnit.includes("MB")) {
                        speedBytesPerSec = speedValue * 1024 * 1024;
                    } else if (speedUnit.includes("KIB") || speedUnit.includes("KB")) {
                        speedBytesPerSec = speedValue * 1024;
                    }

                    if (speedBytesPerSec > 0) {
                        const remainingBytes = Math.max(0, job.estimatedSizeBytes - (job.downloadedSize.includes("GB") || job.downloadedSize.includes("GiB") ? parseFloat(job.downloadedSize) * 1024 * 1024 * 1024 : parseFloat(job.downloadedSize) * 1024 * 1024));
                        // Re-calculate remaining bytes more accurately from current size
                        // Actually we calculated downloadedBytes above, let's use that if we can access it.
                        // We can't access local scope 'downloadedBytes' from here easily unless we move logic.
                        // Let's just trust the progress % for now.

                        // Refined: Use (Total - Current) / Speed
                        const currentBytes = parseFloat(job.downloadedSize) * (job.downloadedSize.toUpperCase().includes("G") ? 1024 * 1024 * 1024 : 1024 * 1024);
                        const left = job.estimatedSizeBytes - currentBytes;
                        if (left > 0) {
                            const etaSec = Math.round(left / speedBytesPerSec);
                            if (etaSec < 60) job.eta = `${etaSec}s`;
                            else if (etaSec < 3600) job.eta = `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`;
                            else job.eta = `${Math.floor(etaSec / 3600)}h ${Math.floor((etaSec % 3600) / 60)}m`;
                        }
                    }
                }
            } else {
                // Fallback speed match if parenthesis format differs
                const altSpeedMatch = line.match(/@\s*([\d\.]+)\s*(\w+\/s)/);
                if (altSpeedMatch) {
                    job.speed = `${altSpeedMatch[1]} ${altSpeedMatch[2]}`;
                }
            }
        }
    }

    private processWithFfmpeg(jobId: string, inputPath: string, outputPath: string, ffmpegPath: string) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        job.status = "converting";
        // Reset process to allow cancellation of FFmpeg
        // We can't easily swap the process reference in a strongly typed way if types differ slightly
        // but spawn returns ChildProcess which matches.

        console.log(`[VideoDownloader] Spawning FFmpeg: ${ffmpegPath} -i ${inputPath} -> ${outputPath}`);

        const ffmpegArgs = [
            '-y', // Overwrite
            '-i', inputPath,
            '-c', 'copy', // Copy streams (fast)
            '-movflags', '+faststart', // Optimize for web playback
            '-bsf:a', 'aac_adtstoasc', // Fix AAC bitstream if coming from TS
            '-ignore_unknown',
            '-avoid_negative_ts', 'make_zero', // Fix start time
            outputPath
        ];

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);
        job.process = ffmpegProcess; // Update job control reference

        ffmpegProcess.stderr.on('data', (data) => {
            // FFmpeg logs to stderr
            console.log(`[FFmpeg ${jobId}]: ${data.toString()}`);
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`[VideoDownloader] Conversion successful for ${jobId}`);
                job.status = "completed";
                job.progress = 100;
                job.downloadedSize = job.totalSize !== '-' ? job.totalSize : "Done";
                job.eta = "-";
                job.filePath = outputPath;

                // Cleanup intermediate file
                try {
                    if (fs.existsSync(inputPath)) {
                        fs.unlinkSync(inputPath);
                        console.log(`[VideoDownloader] Deleted intermediate file: ${inputPath}`);
                    }


                } catch (e) {
                    console.error(`[VideoDownloader] Failed to delete temp file:`, e);
                }
            } else {
                console.error(`[VideoDownloader] FFmpeg failed with code ${code}`);
                job.status = "failed";
                job.error = `Conversion failed with code ${code}`;
            }
        });

        ffmpegProcess.on('error', (err) => {
            console.error(`[VideoDownloader] FFmpeg spawn error:`, err);
            job.status = "failed";
            job.error = `Conversion spawn error: ${err.message}`;
        });
    }

    getStatus(jobId: string) {
        return this.jobs.get(jobId);
    }

    cancel(jobId: string) {
        const job = this.jobs.get(jobId);
        if (job && job.process) {
            job.process.kill();
            job.status = "failed";
            job.error = "Cancelled by user";
        }
    }

    async deleteFiles(jobId: string) {
        const job = this.jobs.get(jobId);

        // Ensure process is killed before deleting files
        if (job && job.process && (job.status === "downloading" || job.status === "converting")) {
            try {
                process.kill(job.process.pid as number); // Force kill using PID to be sure
                job.process.kill();
            } catch (e) { }
            // Give a small moment for OS to release locks
            await new Promise(resolve => setTimeout(resolve, 500));
        }



        if (!job || !job.savePath || !job.fileName) return;

        const baseName = job.fileName.replace(/\.mp4$/, '');

        // Define cleanup patterns for a directory
        const getCleanupPaths = (dir: string) => [
            path.join(dir, job.fileName!), // The mp4 (if exists / incomplete)
            path.join(dir, `${baseName}.ts`), // The ts temp
            path.join(dir, `${baseName}.mp4.part`), // yt-dlp part
            path.join(dir, `${baseName}.mp4.ytdl`), // yt-dlp temp
            path.join(dir, `${baseName}.ts.part`),
            path.join(dir, `${baseName}.ts.ytdl`)
        ];

        let filesToDelete = getCleanupPaths(job.savePath);

        // Also clean up from temp path if it exists and is different
        if (job.tempPath && job.tempPath !== job.savePath) {
            filesToDelete = [...filesToDelete, ...getCleanupPaths(job.tempPath)];
        }



        console.log(`[VideoDownloader] Deleting files for ${jobId}: ${filesToDelete.join(', ')}`);

        const tryDelete = async (filePath: string, retries = 5) => {
            for (let i = 0; i < retries; i++) {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`[VideoDownloader] Deleted: ${filePath}`);
                    }
                    return;
                } catch (e: any) {
                    if (e.code === 'EBUSY' && i < retries - 1) {
                        console.log(`[VideoDownloader] File locked, retrying deletion... (${i + 1}/${retries})`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }
                    console.error(`[VideoDownloader] Failed to delete ${filePath}:`, e);
                    break;
                }
            }
        };

        // Execute deletions sequentially to avoid overwhelming disk I/O or race conditions
        for (const file of filesToDelete) {
            await tryDelete(file);
        }

        this.jobs.delete(jobId);
    }

    private parseProgress(job: DownloadJob, text: string) {
        // line example: [download]  25.0% of 100.00MiB at  5.00MiB/s ETA 00:15
        const lines = text.split("\n");
        for (const line of lines) {
            if (!line.includes("[download]")) continue;

            // Extract Percent
            const percentMatch = line.match(/(\d+\.?\d*)%/);
            if (percentMatch) {
                job.progress = parseFloat(percentMatch[1]);
            }

            // Extract Size (of ...)
            // Handle spaces in size: "of ~  1.23GiB at" or "of 1.86GiB in"
            const sizeMatch = line.match(/of\s+(.*?)\s+(?:at|in)/);
            if (sizeMatch) {
                job.totalSize = sizeMatch[1].trim();
            }

            // Speed
            const speedMatch = line.match(/at\s+([\d\.]+\w+\/s)/);
            if (speedMatch) {
                job.speed = speedMatch[1];
            }

            // ETA
            const etaMatch = line.match(/ETA\s+([\d:]+)/);
            if (etaMatch) {
                job.eta = etaMatch[1];
            }

            // Update downloaded size roughly
            if (job.totalSize !== "-") {
                job.downloadedSize = `${job.progress.toFixed(1)}%`;
            }
        }
    }
}

// Global singleton
// In Next.js dev mode, this might get recreated on recompile.
// In Next.js dev mode, this might get recreated on recompile.
const globalForDownloader = global as unknown as { videoDownloaderV3: VideoDownloader };

export const videoDownloader = globalForDownloader.videoDownloaderV3 || new VideoDownloader();

if (process.env.NODE_ENV !== "production") globalForDownloader.videoDownloaderV3 = videoDownloader;
