import { ChatSettings } from "@/lib/store";
import crypto from "crypto";

// Helper for ASS time format (H:MM:SS.cs)
function parseValToAss(milliseconds: number): string {
    const totalSeconds = milliseconds / 1000.0;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// Security: Escape ASS special characters to prevent tag injection
function escapeAss(text: string): string {
    if (!text) return "";
    return text
        .replace(/\\/g, "＼") // Replace backslash with full-width backslash
        .replace(/\{/g, "｛") // Replace open brace with full-width brace
        .replace(/\}/g, "｝"); // Replace close brace with full-width brace
}

// Color helpers
function getColorHex(nickname: string): [number, number, number] {
    const hash = crypto.createHash("md5").update(nickname).digest("hex");
    let r = parseInt(hash.substring(0, 2), 16);
    let g = parseInt(hash.substring(2, 4), 16);
    let b = parseInt(hash.substring(4, 6), 16);

    if (r + g + b < 200) {
        r = Math.min(255, r + 100);
        g = Math.min(255, g + 100);
        b = Math.min(255, b + 100);
    }
    return [r, g, b];
}

function getAssColor(rgb: [number, number, number]): string {
    // ASS: &HBBGGRR&
    const [r, g, b] = rgb;
    const toHex = (c: number) => c.toString(16).padStart(2, "0").toUpperCase();
    return `&H${toHex(b)}${toHex(g)}${toHex(r)}&`;
}

// Layout logic
interface LayoutParams {
    x: number;
    y: number;
    w: number;
    h: number;
    align: number;
    max_lines: number;
}

function generateLayoutParams(settings: ChatSettings): LayoutParams {
    const screenW = 1920;
    const screenH = 1080;
    const boxW = settings.boxWidth || 400; // Use settings or default

    // Calculate height based on maxLines
    // LineHeight used in Renderer is fontSize + 5
    const fontSize = settings.fontSize || 32;
    const lineHeight = fontSize + 5;
    const maxLines = settings.maxLines || 15;

    // Total content height + padding (approx 20px vertical padding)
    const contentHeight = maxLines * lineHeight;
    const boxH = contentHeight + 40; // Add some extra padding for safety

    const marginSide = 20;
    const marginVertical = 20;

    let x = 0, y = 0;
    // Align always 2 (Bottom Center) for Bottom-Up Stacking!
    const align = 2;

    switch (settings.assPosition) {
        case "bottom-right": // Pos 1
            x = screenW - boxW - marginSide;
            y = screenH - boxH - marginVertical;
            break;
        case "top-right": // Pos 2
            x = screenW - boxW - marginSide;
            y = marginVertical;
            break;
        case "bottom-left": // Pos 3
            x = marginSide;
            y = screenH - boxH - marginVertical;
            break;
        case "top-left": // Pos 4
            x = marginSide;
            y = marginVertical;
            break;
        case "middle-left":
            x = marginSide;
            y = (screenH - boxH) / 2;
            break;
        case "middle-right":
            x = screenW - boxW - marginSide;
            y = (screenH - boxH) / 2;
            break;
    }

    return { x, y, w: boxW, h: boxH, align, max_lines: maxLines };
}

// Text width estimation
function getCharWidth(char: string, fontSize: number): number {
    const code = char.charCodeAt(0);
    const isWide =
        (code >= 0x1100 && code <= 0x11FF) || // Hangul Jamo
        (code >= 0x3130 && code <= 0x318F) || // Hangul Compatibility Jamo
        (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
        (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
        (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
        (code >= 0xFF00 && code <= 0xFFEF);   // Halfwidth and Fullwidth Forms

    const base = isWide ? fontSize : fontSize / 2;
    return base * 0.72; // Tuning factor
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
    const lines: string[] = [];
    let currentLine = "";
    let currentWidth = 0;

    for (const char of text) {
        const charW = getCharWidth(char, fontSize);
        if (currentWidth + charW > maxWidth) {
            lines.push(currentLine);
            currentLine = char;
            currentWidth = charW;
        } else {
            currentLine += char;
            currentWidth += charW;
        }
    }
    if (currentLine) lines.push(currentLine);
    if (lines.length === 0 && text.length > 0) lines.push(text);
    return lines;
}

interface ActiveMessage {
    nickname: string;
    content_lines: string[];
    color: string;
    intro_time: number;
    slot_idx: number; // 0 = Newest (Bottom)
}

class ChatRenderer {
    layout: LayoutParams;
    fontSize: number;
    lineHeight: number;
    maxLines: number;
    maxTextWidth: number;
    activeMessages: ActiveMessage[] = [];
    lastFlushTime = 0;

    events: string[] = [];

    constructor(layout: LayoutParams, fontSize: number) {
        this.layout = layout;
        this.fontSize = fontSize;
        this.lineHeight = fontSize + 5;
        this.maxLines = layout.max_lines;
        this.maxTextWidth = layout.w - 20;
    }

    addMessage(relativeMs: number, nickname: string, content: string, rgb: [number, number, number]) {
        // 1. Flush state
        if (this.activeMessages.length > 0) {
            this.flushState(this.lastFlushTime, relativeMs);
        }

        // 2. Wrap text
        const nickStr = `${nickname}: `;
        let nickWidth = 0;
        for (const char of nickStr) nickWidth += getCharWidth(char, this.fontSize);

        const firstLineAvailable = this.maxTextWidth - nickWidth;
        let wrappedContent: string[] = [];

        if (firstLineAvailable < this.fontSize) {
            wrappedContent = wrapText(content, this.maxTextWidth, this.fontSize);
        } else {
            const lines: string[] = [];
            let currLine = "";
            let currW = 0;
            let limit = firstLineAvailable;

            for (const char of content) {
                const cw = getCharWidth(char, this.fontSize);
                if (currW + cw > limit) {
                    lines.push(currLine);
                    currLine = char;
                    currW = cw;
                    limit = this.maxTextWidth;
                } else {
                    currLine += char;
                    currW += cw;
                }
            }
            if (currLine) lines.push(currLine);

            if (lines.length > 10) {
                const remains = lines.slice(9).join("");
                lines.splice(9, lines.length - 9, remains);
            }
            wrappedContent = lines;
        }

        const numLines = wrappedContent.length;

        // 3. Shift existing messages up
        this.activeMessages.forEach(msg => {
            msg.slot_idx += numLines;
        });

        // 4. Add new message at Slot 0
        this.activeMessages.push({
            nickname,
            content_lines: wrappedContent,
            color: getAssColor(rgb),
            intro_time: relativeMs,
            slot_idx: 0
        });

        // 5. Remove messages out of bounds
        this.activeMessages = this.activeMessages.filter(msg => msg.slot_idx < this.maxLines);

        this.lastFlushTime = relativeMs;
    }

    flushState(startMs: number, endMs: number) {
        if (startMs >= endMs) return;

        const startAss = parseValToAss(startMs);
        const endAss = parseValToAss(endMs);

        this.activeMessages.forEach(msg => {
            if (msg.intro_time > endMs) return;
            this.writeLine(startAss, endAss, msg);
        });
    }

    writeLine(startAss: string, endAss: string, msg: ActiveMessage) {
        // All positions use Bottom-Up stacking logic.
        const offsetY = 10;

        // Round coordinates to reduce file size (remove decimals)
        const baseY = Math.round(this.layout.y + this.layout.h - offsetY);
        const textY = Math.round(baseY - (msg.slot_idx * this.lineHeight));

        const textX = Math.round(this.layout.x + 10);
        const boxX = Math.round(this.layout.x);
        const boxW = Math.round(this.layout.w);

        const totalLines = msg.content_lines.length;
        const boxOrgH = totalLines * this.lineHeight;
        const gap = 2;
        const boxH = Math.round(boxOrgH - gap);

        const boxTopY = Math.round((textY - boxOrgH) + (gap / 2));
        const drawCmd = `m 0 0 l ${boxW} 0 l ${boxW} ${boxH} l 0 ${boxH}`;

        // Optimized Background Event
        // BG style already has alignment 7 and alpha
        const bgEvent = `Dialogue: 1,${startAss},${endAss},BG,,0,0,0,,{\\pos(${boxX},${boxTopY})}{\\p1}${drawCmd}{\\p0}`;
        this.events.push(bgEvent);

        // Text Content
        const nickname = msg.nickname;
        const assColor = msg.color;

        // Use \\r to reset style (default white) instead of explicit \\c&HFFFFFF& to save bytes
        let fullTextAss = `{\\c${assColor}}${nickname}{\\r}: ${msg.content_lines[0]}`;
        if (msg.content_lines.length > 1) {
            for (let i = 1; i < msg.content_lines.length; i++) {
                fullTextAss += `\\N${msg.content_lines[i]}`;
            }
        }

        // Optimized Text Event
        // CT style already has alignment 1
        const textDrawY = Math.round(textY + (totalLines * -2)); // Tiny offset tweak
        const dialogue = `Dialogue: 1,${startAss},${endAss},CT,,0,0,0,,{\\pos(${textX},${textDrawY})}${fullTextAss}`;
        this.events.push(dialogue);
    }

    finish(finalTimeMs: number) {
        this.flushState(this.lastFlushTime, finalTimeMs + 5000);
    }
}

export function generateAssFromChats(chats: any[], settings: ChatSettings, videoStartTimestamp: number): string {
    const layout = generateLayoutParams(settings);
    const renderer = new ChatRenderer(layout, settings.fontSize);

    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 1
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CT,맑은 고딕,${settings.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,1.5,0.5,1,10,10,10,1
Style: BG,Arial,10,&H40000000,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    let lastRelativeMs = 0;

    for (const chat of chats) {
        const messageTime = chat.messageTime;
        // Simple validation
        if (!messageTime) continue;

        // Strip emoji/sticker tokens entirely since we can't display images in ASS
        // Regex: /\{:[^:]+:\}/g
        let content = (chat.content || "").replace(/\{:[^:]+:\}/g, "").trim();

        // If message is empty after stripping (was only emojis), skip it
        if (!content) {
            continue;
        }

        let relativeMs = messageTime - videoStartTimestamp;
        // Quantize time to 100ms intervals to optimize file size (grouping burst messages)
        // This reduces the number of ASS events generated during high-traffic moments
        if (relativeMs < 0) relativeMs = 0;
        relativeMs = Math.floor(relativeMs / 100) * 100;

        lastRelativeMs = relativeMs;


        let nickname = "Unknown";

        if (chat.profile) {
            try {
                const profile = typeof chat.profile === 'string' ? JSON.parse(chat.profile) : chat.profile;
                if (profile.nickname) nickname = profile.nickname;
            } catch (e) {
                // ignore
            }
        }

        // Get RGB
        let currentRgb: [number, number, number] = [255, 255, 255];
        if (chat.userColor) { // Typically Chzzk doesn't send userColor in content directly? 
            // Twitch wrapper does. Checking Chzzk format...
            // It's usually safe to rely on nickname hash if explicit color missing.
            currentRgb = getColorHex(nickname);
        } else {
            currentRgb = getColorHex(nickname);
        }

        // Escape special ASS characters to prevent tag injection
        content = escapeAss(content);
        nickname = escapeAss(nickname);

        renderer.addMessage(relativeMs, nickname, content, currentRgb);
    }

    renderer.finish(lastRelativeMs);

    return header + renderer.events.join("\n");
}
