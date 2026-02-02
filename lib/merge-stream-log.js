const fs = require('fs');
const path = require('path');

/**
 * 문자열 유사도 계산 (Jaccard 방식)
 */
function calculateSimilarity(text1, text2) {
    if (!text1 || !text2) return 0.0;
    
    const norm1 = normalizeText(text1);
    const norm2 = normalizeText(text2);
    
    if (!norm1 || !norm2) return 0.0;
    
    const words1 = new Set(norm1.split(/\s+/));
    const words2 = new Set(norm2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0.0;
}

function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/[^가-힣a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * JSON 파서
 */
class JsonParser {
    parse(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return this._processChatData(data);
    }
    
    _processChatData(data) {
        const processed = {
            messages: [],
            metadata: {}
        };
        
        if (typeof data === 'object' && data !== null) {
            const meta = data.meta || {};
            processed.metadata = {
                streamer: meta.streamerName || 'Unknown',
                title: meta.videoTitle || 'Unknown',
                vodId: meta.vodId || 'Unknown',
                timestamp: meta.videoTimestamp || '',
                downloadDate: meta.downloadDate || ''
            };
            
            const messages = data.data || [];
            for (const msg of messages) {
                processed.messages.push(this._parseMessage(msg));
            }
        }
        
        return processed;
    }
    
    _parseMessage(message) {
        let profile = message.profile || {};
        if (typeof profile === 'string') {
            try {
                profile = JSON.parse(profile);
            } catch {
                profile = {};
            }
        }
        if (profile === null) profile = {};
        
        const playerTime = message.playerMessageTime || 0;
        
        return {
            user: (typeof profile === 'object' && profile.nickname) || 'Unknown',
            message: message.content || '',
            player_time_ms: playerTime,
            timestamp: this._formatPlayerTime(playerTime),
            message_time: message.messageTime || 0,
            extras: message.extras || {}
        };
    }
    
    _formatPlayerTime(milliseconds) {
        if (!milliseconds) return "00:00:00";
        
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

/**
 * SRT 파서
 */
class SrtParser {
    constructor() {
        this.ignoreBrackets = true;
        this.minLength = 2;
    }
    
    parse(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return this._parseSrtContent(content);
    }
    
    _parseSrtContent(content) {
        const subtitles = [];
        // Windows(\r\n)와 Unix(\n) 줄바꿈 모두 처리
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const blocks = normalizedContent.trim().split(/\n\n+/);
        
        console.log(`  📄 SRT 블록 ${blocks.length}개 발견`);
        
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const subtitle = this._parseBlock(block, i + 1);
            if (subtitle) {
                subtitles.push(subtitle);
            }
        }
        
        console.log(`  ✅ SRT 자막 ${subtitles.length}개 파싱 완료`);
        return subtitles;
    }
    
    _parseBlock(block, blockNum) {
        const lines = block.trim().split('\n');
        
        // 최소 3줄: 번호, 타임코드, 텍스트
        if (lines.length < 3) {
            console.log(`  ⚠️  블록 ${blockNum}: 줄 수 부족 (${lines.length}줄)`);
            return null;
        }
        
        // 첫 번째 줄은 번호여야 함
        const indexLine = lines[0];
        if (!/^\d+$/.test(indexLine.trim())) {
            console.log(`  ⚠️  블록 ${blockNum}: 번호 형식 오류 (${indexLine})`);
            return null;
        }
        
        // 두 번째 줄은 타임코드
        const timeLine = lines[1];
        const textLines = lines.slice(2);
        
        // 타임코드에서 다른 자막 블록이 섞여있는지 확인
        const validTextLines = [];
        for (const line of textLines) {
            // 숫자만 있는 줄이 나오면 새 블록 시작 (잘못된 파싱)
            if (/^\d+$/.test(line.trim())) {
                console.log(`  ⚠️  블록 ${blockNum}: 텍스트 내 번호 발견 (${line.trim()}) - 블록 분리 오류`);
                break;
            }
            // 타임코드가 나오면 새 블록 시작 (잘못된 파싱)
            if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/.test(line)) {
                console.log(`  ⚠️  블록 ${blockNum}: 텍스트 내 타임코드 발견 - 블록 분리 오류`);
                break;
            }
            validTextLines.push(line);
        }
        
        // 자막 내 줄바꿈은 공백으로 연결
        const text = validTextLines.join(' ').trim();
        
        const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
        if (!timeMatch) {
            console.log(`  ⚠️  블록 ${blockNum}: 타임코드 파싱 실패 (${timeLine})`);
            return null;
        }
        
        const startSec = this._timeToSeconds(
            parseInt(timeMatch[1]),
            parseInt(timeMatch[2]),
            parseInt(timeMatch[3]),
            parseInt(timeMatch[4])
        );
        
        const endSec = this._timeToSeconds(
            parseInt(timeMatch[5]),
            parseInt(timeMatch[6]),
            parseInt(timeMatch[7]),
            parseInt(timeMatch[8])
        );
        
        const filteredText = this._filterText(text);
        
        if (!filteredText || filteredText.length < this.minLength) {
            return null;
        }
        
        return {
            start_sec: startSec,
            end_sec: endSec,
            duration: endSec - startSec,
            text: filteredText,
            original_text: text
        };
    }
    
    _timeToSeconds(hour, minute, second, millisecond) {
        return hour * 3600 + minute * 60 + second + millisecond / 1000.0;
    }
    
    _filterText(text) {
        if (this.ignoreBrackets) {
            text = text.replace(/\[.*?\]/g, '');
        }
        
        text = text.replace(/\s+/g, ' ').trim();
        
        return text;
    }
}

/**
 * 데이터 병합기
 */
class DataMerger {
    constructor(config = {}) {
        this.config = config;
        this.weights = config.weights || {
            streamer: 3.0,
            donation: 1.2,
            chat: 1.0
        };
        this.timeWindow = config.time_window || 600;
        this.similarityThreshold = config.similarity_threshold || 0.5;
    }
    
    merge(chatData, srtData, liveStartMs) {
        const chatEvents = this._normalizeChatMessages(chatData.messages, liveStartMs);
        const srtEvents = this._normalizeSrtSubtitles(srtData);
        
        const [finalEvents, ttsEvents] = this._mergeAndConvertTts(chatEvents, srtEvents);
        
        for (const event of srtEvents) {
            event.type = 'srt_streamer';
            event.user = '스트리머';
            event.weight = this.weights.streamer;
            finalEvents.push(event);
        }
        
        finalEvents.sort((a, b) => a.time_sec - b.time_sec);
        
        return {
            events: finalEvents,
            metadata: chatData.metadata || {},
            statistics: this._calculateStatistics(finalEvents),
            chat_data: chatData,
            srt_data: srtData
        };
    }
    
    _normalizeChatMessages(messages, liveStartMs) {
        const events = [];
        
        for (const msg of messages) {
            let timeSec;
            if (msg.player_time_ms != null && msg.player_time_ms > 0) {
                timeSec = msg.player_time_ms / 1000.0;
            } else {
                const messageTimeMs = msg.message_time || 0;
                const relativeTimeMs = messageTimeMs - liveStartMs;
                timeSec = relativeTimeMs / 1000.0;
            }
            
            if (timeSec < 0) timeSec = 0;
            
            const isDonation = this._isDonation(msg);
            
            events.push({
                type: isDonation ? 'chat_donation' : 'chat',
                time_sec: timeSec,
                timestamp: this._formatTimestamp(timeSec),
                user: msg.user || 'Unknown',
                content: msg.message || '',
                weight: isDonation ? this.weights.donation : this.weights.chat,
                source: 'json'
            });
        }
        
        return events;
    }
    
    _normalizeSrtSubtitles(subtitles) {
        const events = [];
        
        for (const subtitle of subtitles) {
            events.push({
                type: 'srt',
                time_sec: subtitle.start_sec,
                timestamp: this._formatTimestamp(subtitle.start_sec),
                user: 'TTS',
                content: subtitle.text,
                weight: 1.0,
                source: 'srt',
                duration: subtitle.duration
            });
        }
        
        return events;
    }
    
    _mergeAndConvertTts(chatEvents, srtEvents) {
        const finalChatEvents = [];
        const ttsEvents = [];
        const matchedSrtIndices = new Set();
        
        console.log(`  📊 채팅 ${chatEvents.length}개 × 자막 ${srtEvents.length}개 비교 중...`);
        let matchCount = 0;
        
        for (let chatIdx = 0; chatIdx < chatEvents.length; chatIdx++) {
            if (chatIdx % 5000 === 0 && chatIdx > 0) {
                console.log(`    진행: ${chatIdx}/${chatEvents.length} 채팅 처리됨 (매칭: ${matchCount}개)`);
            }
            
            const chatEvent = chatEvents[chatIdx];
            let matched = false;
            const chatTime = chatEvent.time_sec;
            
            for (let i = 0; i < srtEvents.length; i++) {
                if (matchedSrtIndices.has(i)) continue;
                
                const srtEvent = srtEvents[i];
                const srtTime = srtEvent.time_sec;
                const timeDiff = Math.abs(chatTime - srtTime);
                
                if (timeDiff > this.timeWindow) {
                    if (srtTime > chatTime + this.timeWindow) {
                        break;
                    }
                    continue;
                }
                
                const chatLen = chatEvent.content.length;
                const srtLen = srtEvent.content.length;
                const lenDiff = Math.abs(chatLen - srtLen);
                if (lenDiff > Math.max(chatLen, srtLen) * 0.5) {
                    continue;
                }
                
                if (this._isDuplicate(chatEvent, srtEvent)) {
                    chatEvent.type = 'chat_donation';
                    chatEvent.weight = this.weights.donation;
                    
                    ttsEvents.push(chatEvent);
                    matchedSrtIndices.add(i);
                    matched = true;
                    matchCount++;
                    break;
                }
            }
            
            if (!matched) {
                finalChatEvents.push(chatEvent);
            }
        }
        
        const remainingSrt = srtEvents.filter((_, i) => !matchedSrtIndices.has(i));
        srtEvents.length = 0;
        srtEvents.push(...remainingSrt);
        
        return [[...finalChatEvents, ...ttsEvents], ttsEvents];
    }
    
    _isDuplicate(chatEvent, srtEvent) {
        const timeDiff = Math.abs(chatEvent.time_sec - srtEvent.time_sec);
        if (timeDiff > this.timeWindow) return false;
        
        const similarity = calculateSimilarity(chatEvent.content, srtEvent.content);
        
        return similarity >= this.similarityThreshold;
    }
    
    _isDonation(message) {
        const extras = message.extras || {};
        
        if (extras.donation || extras.payAmount) {
            return true;
        }
        
        return false;
    }
    
    _formatTimestamp(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    _calculateStatistics(events) {
        const stats = {
            total: events.length,
            by_type: {},
            by_user: {},
            weight_sum: 0.0
        };
        
        for (const event of events) {
            const eventType = event.type;
            if (!stats.by_type[eventType]) {
                stats.by_type[eventType] = { count: 0, weight_sum: 0.0 };
            }
            
            stats.by_type[eventType].count++;
            stats.by_type[eventType].weight_sum += event.weight;
            
            const user = event.user;
            if (!stats.by_user[user]) {
                stats.by_user[user] = 0;
            }
            stats.by_user[user]++;
            
            stats.weight_sum += event.weight;
        }
        
        return stats;
    }
}

/**
 * 마크다운 작성기
 */
class MarkdownWriter {
    formatMergedData(mergedData) {
        const lines = [];
        
        lines.push("# 치지직 채팅 로그 (채팅 + 음성 통합)\n");
        
        const metadata = mergedData.metadata || {};
        if (Object.keys(metadata).length > 0) {
            lines.push("## 방송 정보\n");
            lines.push(`- **스트리머**: ${metadata.streamer || 'Unknown'}`);
            lines.push(`- **제목**: ${metadata.title || 'Unknown'}`);
            lines.push(`- **VOD ID**: ${metadata.vodId || 'Unknown'}`);
            lines.push("");
        }
        
        const events = mergedData.events || [];
        lines.push(`## 통합 타임라인 (총 ${events.length}개)\n`);
        
        for (const event of events) {
            const time = event.timestamp || '00:00:00';
            const user = event.user || 'Unknown';
            const content = event.content || '';
            const eventType = event.type || 'unknown';
            
            const [icon, label] = this._getEventIconLabel(eventType);
            
            lines.push(`[${time}] ${icon} ${user}: ${content} (${label})`);
        }
        
        const stats = mergedData.statistics || {};
        lines.push("\n---\n## 통계");
        lines.push(`- 총 이벤트 수: ${stats.total || 0}개`);
        
        const byType = stats.by_type || {};
        if (Object.keys(byType).length > 0) {
            lines.push("\n### 타입별 이벤트 수");
            const typeLabels = {
                'srt_streamer': '스트리머 음성',
                'chat_donation': '도네이션',
                'chat': '일반 채팅'
            };
            
            const sortedTypes = Object.entries(byType).sort((a, b) => b[1].weight_sum - a[1].weight_sum);
            for (const [eventType, data] of sortedTypes) {
                const label = typeLabels[eventType] || eventType;
                lines.push(`- **${label}**: ${data.count}개 (가중치 합: ${data.weight_sum.toFixed(1)})`);
            }
        }
        
        const byUser = stats.by_user || {};
        if (Object.keys(byUser).length > 0) {
            lines.push("\n### 참여자별 이벤트 수");
            const sortedUsers = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
            for (const [user, count] of sortedUsers) {
                lines.push(`- **${user}**: ${count}개`);
            }
        }
        
        const now = new Date();
        lines.push(`\n---\n*생성 일시: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}*`);
        
        return lines.join('\n');
    }
    
    _getEventIconLabel(eventType) {
        const typeMapping = {
            'srt_streamer': ['🎙️', '음성'],
            'chat_donation': ['💰', 'TTS'],
            'chat': ['💬', '채팅']
        };
        
        return typeMapping[eventType] || ['📝', '기타'];
    }
}

/**
 * 차트 데이터 생성
 */
function generateChartData(chatData) {
    const messages = chatData.messages || [];
    if (messages.length === 0) {
        return { labels: [], data: [], totalChats: 0, duration: 0 };
    }
    
    const sortedChats = messages.slice().sort((a, b) => (a.message_time || 0) - (b.message_time || 0));
    
    const startTime = sortedChats[0].message_time || 0;
    const endTime = sortedChats[sortedChats.length - 1].message_time || 0;
    const maxTimeSec = (endTime - startTime) / 1000.0;
    const durationMinutes = maxTimeSec / 60.0;
    
    const bucketSizeSec = Math.max(60, Math.floor((durationMinutes / 10) * 60));
    const bucketCount = Math.floor(maxTimeSec / bucketSizeSec) + 1;
    
    const buckets = new Array(bucketCount).fill(0);
    for (const chat of sortedChats) {
        const relativeTimeSec = ((chat.message_time || 0) - startTime) / 1000.0;
        const bucketIndex = Math.floor(relativeTimeSec / bucketSizeSec);
        if (bucketIndex >= 0 && bucketIndex < bucketCount) {
            buckets[bucketIndex]++;
        }
    }
    
    const avgPerSecond = buckets.map(count => count / bucketSizeSec);
    
    let intervalMinutes = 10;
    if (durationMinutes > 180) {
        intervalMinutes = 30;
    } else if (durationMinutes > 120) {
        intervalMinutes = 20;
    }
    
    const labels = [];
    for (let i = 0; i < bucketCount; i++) {
        const startMin = Math.floor((i * bucketSizeSec) / 60);
        const roundedMin = Math.round(startMin / intervalMinutes) * intervalMinutes;
        labels.push(`${roundedMin}분`);
    }
    
    return {
        labels,
        data: avgPerSecond.map(val => Math.round(val * 1000) / 1000),
        totalChats: messages.length,
        duration: maxTimeSec
    };
}

/**
 * 메인 병합 함수
 */
async function mergeStreamLog(chatJsonPath, srtPath, outputMdPath, liveStartMs) {
    console.log(`📄 채팅 JSON 파싱 중: ${chatJsonPath}`);
    const jsonParser = new JsonParser();
    const chatData = jsonParser.parse(chatJsonPath);
    console.log(`  ✓ ${chatData.messages.length}개 메시지 로드됨`);
    
    console.log(`📄 SRT 자막 파싱 중: ${srtPath}`);
    const srtParser = new SrtParser();
    const srtData = srtParser.parse(srtPath);
    console.log(`  ✓ ${srtData.length}개 자막 로드됨`);
    
    console.log(`🔄 데이터 병합 중...`);
    const merger = new DataMerger();
    const merged = merger.merge(chatData, srtData, liveStartMs);
    console.log(`  ✓ ${merged.events.length}개 이벤트 생성됨`);
    
    const stats = merged.statistics || {};
    const byType = stats.by_type || {};
    if (Object.keys(byType).length > 0) {
        console.log(`\n📊 이벤트 타입별 통계:`);
        const typeLabels = {
            'srt_streamer': '🎙️  스트리머 음성',
            'chat_donation': '💰 도네이션 TTS',
            'chat': '💬 일반 채팅'
        };
        for (const [eventType, data] of Object.entries(byType)) {
            const label = typeLabels[eventType] || eventType;
            console.log(`  ${label}: ${data.count}개 (가중치: ${data.weight_sum.toFixed(1)})`);
        }
    }
    
    console.log(`\n📝 마크다운 생성 중...`);
    const writer = new MarkdownWriter();
    const markdownText = writer.formatMergedData(merged);
    
    console.log(`💾 파일 저장 중: ${outputMdPath}`);
    fs.writeFileSync(outputMdPath, markdownText, 'utf-8');
    
    console.log(`📊 차트 데이터 생성 중...`);
    const chartData = generateChartData(chatData);
    
    // .cache 폴더에 차트 데이터 저장
    const outputDir = path.dirname(outputMdPath);
    const cacheDir = path.join(outputDir, '.cache');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const baseName = path.basename(outputMdPath, '.md');
    const chartOutputPath = path.join(cacheDir, baseName + '.chart.json');
    fs.writeFileSync(chartOutputPath, JSON.stringify(chartData, null, 2), 'utf-8');
    console.log(`  ✓ 차트 데이터 저장: ${chartOutputPath}`);
    
    console.log(`\n✅ 완료! 출력 파일: ${outputMdPath}`);
    
    return merged;
}

module.exports = { mergeStreamLog };
