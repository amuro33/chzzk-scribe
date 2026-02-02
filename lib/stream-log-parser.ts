/**
 * 스트림 로그 MD 파일 파싱 및 화력 분석
 */

export interface StreamLogEvent {
  timeSec: number;
  type: 'chat' | 'donation' | 'streamer';
  user: string;
  content: string;
}

export interface ChatFirepowerData {
  labels: string[]; // 시간 라벨 (예: "00:00", "00:05")
  data: number[]; // 초당 평균 채팅 개수
  totalChats: number;
  duration: number; // 초 단위
}

/**
 * 시간 문자열을 초로 변환
 * @param timeStr "00:15:30" 형식
 */
function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * 초를 시간 문자열로 변환
 * @param seconds 초
 */
function formatSecondsToTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:00`;
}

/**
 * 채팅 JSON 파일에서 화력 데이터 계산
 * @param jsonContent 채팅 JSON 파일 내용
 */
export function calculateChatFirepowerFromJson(jsonContent: string): ChatFirepowerData {
  try {
    const jsonData = JSON.parse(jsonContent);
    const chats = jsonData.data || [];
    
    if (chats.length === 0) {
      return {
        labels: [],
        data: [],
        totalChats: 0,
        duration: 0,
      };
    }
    
    // messageTime 기준으로 정렬 (밀리초)
    const sortedChats = [...chats].sort((a, b) => {
      const timeA = a.messageTime || 0;
      const timeB = b.messageTime || 0;
      return timeA - timeB;
    });
    
    // 방송 시작 시간을 기준으로 상대 시간 계산
    const startTime = sortedChats[0]?.messageTime || 0;
    const endTime = sortedChats[sortedChats.length - 1]?.messageTime || 0;
    const maxTime = (endTime - startTime) / 1000; // 초 단위
    const durationMinutes = Math.ceil(maxTime / 60);
    
    // N초 단위로 분할: N = 전체 방송 시간(분) / 10
    const bucketSizeSeconds = Math.max(60, Math.floor((durationMinutes / 10) * 60));
    const bucketCount = Math.ceil(maxTime / bucketSizeSeconds);
    
    // 구간별 채팅 개수 집계
    const buckets: number[] = new Array(bucketCount).fill(0);
    
    for (const chat of sortedChats) {
      const relativeTime = ((chat.messageTime || 0) - startTime) / 1000; // 방송 시작 기준 상대 시간
      const bucketIndex = Math.floor(relativeTime / bucketSizeSeconds);
      if (bucketIndex >= 0 && bucketIndex < bucketCount) {
        buckets[bucketIndex]++;
      }
    }
    
    // 초당 평균으로 변환
    const avgPerSecond = buckets.map(count => count / bucketSizeSeconds);
    
    // 간격 결정: 방송 시간에 따라 10분, 20분, 30분 단위
    let intervalMinutes = 10;
    if (durationMinutes > 180) {
      intervalMinutes = 30;
    } else if (durationMinutes > 120) {
      intervalMinutes = 20;
    }
    
    // 라벨 생성 - 간격 단위로 표시
    const labels = buckets.map((_, index) => {
      const startMin = Math.round((index * bucketSizeSeconds) / 60);
      const roundedMin = Math.round(startMin / intervalMinutes) * intervalMinutes;
      return `${roundedMin}분`;
    });
    
    return {
      labels,
      data: avgPerSecond,
      totalChats: chats.length,
      duration: maxTime,
    };
  } catch (error) {
    console.error('[Parser] JSON parsing error:', error);
    return {
      labels: [],
      data: [],
      totalChats: 0,
      duration: 0,
    };
  }
}

/**
 * 채팅 화력 데이터 계산
 * @param mdContent MD 파일 내용
 */
export function calculateChatFirepower(mdContent: string): ChatFirepowerData {
  // MD 파일 대신 사용 안 함 (JSON 사용)
  return {
    labels: [],
    data: [],
    totalChats: 0,
    duration: 0,
  };
}
