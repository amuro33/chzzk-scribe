const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

class VideoDownloader {
    constructor() {
        this.jobs = new Map();
    }

    start(jobId, url, savePath, fileName, resolution, cookies, maxFragments, streamlinkPath, durationSeconds, bitrateBps, tempPath, thumbnailUrl) {
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

        console.log(`[VideoDownloader] Starting job ${jobId} for ${url} (Streamlink)`);
        console.log(`[VideoDownloader] Work Dir: ${workDir}`);

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
        if (streamlinkPath && fs.existsSync(streamlinkPath)) {
            command = streamlinkPath;
        } else {
            const bundledDev = path.join(process.cwd(), 'bin', 'streamlink', 'bin', 'streamlink.exe');
            const bundledProd = path.join(process.resourcesPath || '', 'bin', 'streamlink', 'bin', 'streamlink.exe');

            if (fs.existsSync(bundledDev)) {
                command = bundledDev;
            } else if (fs.existsSync(bundledProd)) {
                command = bundledProd;
            } else {
                const userHome = process.env.USERPROFILE || "";
                const scriptsPath = path.join(userHome, "AppData\\Local\\Packages\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\LocalCache\\local-packages\\Python313\\Scripts");
                const streamlinkShim = path.join(scriptsPath, "streamlink.exe");

                if (fs.existsSync(streamlinkShim)) {
                    command = streamlinkShim;
                } else {
                    command = "streamlink";
                }
            }
        }

        const finalFilePath = path.join(savePath, fileName);
        const spawnArgs = [
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

        spawnArgs.push(url);
        spawnArgs.push("best");

        let estimatedSizeBytes;
        if (durationSeconds) {
            let bitrateToUse = bitrateBps;
            if (!bitrateToUse) {
                let bitrateKbps = 5000;
                if (resolution) {
                    if (resolution.includes("1080")) bitrateKbps = 8000;
                    else if (resolution.includes("720")) bitrateKbps = 3000;
                    else if (resolution.includes("480")) bitrateKbps = 1500;
                    else if (resolution.includes("360")) bitrateKbps = 1000;
                }
                bitrateToUse = bitrateKbps * 1000;
            }
            const audioBitrateBps = 256 * 1000;
            bitrateToUse += audioBitrateBps;
            const overheadMultiplier = 1.08;
            estimatedSizeBytes = ((bitrateToUse / 8) * durationSeconds) * overheadMultiplier;
        }

        const processInstance = spawn(command, spawnArgs, { shell: false });

        processInstance.on('error', (err) => {
            console.error(`[VideoDownloader] Failed to spawn ${command}:`, err);
            const currentJob = this.jobs.get(jobId);
            if (currentJob) {
                currentJob.status = "failed";
                currentJob.error = `Spawn error: ${err.message}`;
            }
        });

        const job = {
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
        processInstance.stdout.on("data", (data) => {
            buffer += data.toString();
            const lines = buffer.split(/[\r\n]+/);
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (line.trim()) {
                    this.parseStreamlinkProgress(job, line);
                }
            }
        });

        processInstance.stderr.on("data", (data) => {
            const text = data.toString();
            const lines = text.split(/[\r\n]+/);
            for (const line of lines) {
                if (line.trim()) this.parseStreamlinkProgress(job, line);
            }
        });

        processInstance.on("close", (code) => {
            if (code === 0) {
                job.status = "completed";
                job.progress = 100;
                job.downloadedSize = job.totalSize !== '-' ? job.totalSize : "Done";
                job.filePath = path.join(savePath, fileName);
            } else {
                job.status = "failed";
                job.error = `Exited with code ${code}`;
            }
        });
    }

    parseStreamlinkProgress(job, line) {
        if (line.includes("Written")) {
            const sizeMatch = line.match(/Written\s+([\d\.]+)\s*(\w+)\s+to/);
            if (sizeMatch) {
                const sizeValue = parseFloat(sizeMatch[1]);
                const sizeUnit = sizeMatch[2].toUpperCase();
                job.downloadedSize = `${sizeValue} ${sizeMatch[2]}`;
                let downloadedBytes = sizeValue;
                if (sizeUnit.includes("GIB") || sizeUnit.includes("GB")) downloadedBytes = sizeValue * 1024 * 1024 * 1024;
                else if (sizeUnit.includes("MIB") || sizeUnit.includes("MB")) downloadedBytes = sizeValue * 1024 * 1024;
                else if (sizeUnit.includes("KIB") || sizeUnit.includes("KB")) downloadedBytes = sizeValue * 1024;

                if (job.estimatedSizeBytes && job.estimatedSizeBytes > 0) {
                    job.progress = Math.min(99, Math.round((downloadedBytes / job.estimatedSizeBytes) * 100));
                }
            }

            const metaMatch = line.match(/\((.*?)\s+@\s+([\d\.]+)\s+(\w+\/s)\)/);
            if (metaMatch) {
                const speedValue = parseFloat(metaMatch[2]);
                const speedUnit = metaMatch[3].toUpperCase();
                job.speed = `${speedValue} ${metaMatch[3]}`;

                if (job.estimatedSizeBytes && job.progress > 0) {
                    let speedBytesPerSec = speedValue;
                    if (speedUnit.includes("GIB") || speedUnit.includes("GB")) speedBytesPerSec = speedValue * 1024 * 1024 * 1024;
                    else if (speedUnit.includes("MIB") || speedUnit.includes("MB")) speedBytesPerSec = speedValue * 1024 * 1024;
                    else if (speedUnit.includes("KIB") || speedUnit.includes("KB")) speedBytesPerSec = speedValue * 1024;

                    if (speedBytesPerSec > 0) {
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
                const altSpeedMatch = line.match(/@\s*([\d\.]+)\s*(\w+\/s)/);
                if (altSpeedMatch) job.speed = `${altSpeedMatch[1]} ${altSpeedMatch[2]}`;
            }
        }
    }

    getStatus(jobId) { return this.jobs.get(jobId); }
    cancel(jobId) {
        const job = this.jobs.get(jobId);
        if (job && job.process) {
            job.process.kill();
            job.status = "failed";
            job.error = "Cancelled by user";
        }
    }

    async deleteFiles(jobId) {
        const job = this.jobs.get(jobId);
        if (job && job.process && (job.status === "downloading" || job.status === "converting")) {
            try { process.kill(job.process.pid); job.process.kill(); } catch (e) { }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (!job || !job.savePath || !job.fileName) return;
        const baseName = job.fileName.replace(/\.mp4$/, '');

        const getCleanupPaths = (dir) => [
            path.join(dir, job.fileName),
            path.join(dir, `${baseName}.ts`),
            path.join(dir, `${baseName}.mp4.part`),
            path.join(dir, `${baseName}.ts.part`),
        ];

        let filesToDelete = getCleanupPaths(job.savePath);
        if (job.tempPath && job.tempPath !== job.savePath) {
            filesToDelete = [...filesToDelete, ...getCleanupPaths(job.tempPath)];
        }

        for (const file of filesToDelete) {
            for (let i = 0; i < 5; i++) {
                try {
                    if (fs.existsSync(file)) fs.unlinkSync(file);
                    break;
                } catch (e) {
                    if (e.code === 'EBUSY' && i < 4) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    }
                    break;
                }
            }
        }
        this.jobs.delete(jobId);
    }
}

const videoDownloader = new VideoDownloader();
module.exports = { videoDownloader };
