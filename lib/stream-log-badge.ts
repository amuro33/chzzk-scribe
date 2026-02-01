/**
 * 스트림 로그 화력 뱃지 계산
 */

export interface FirepowerBadge {
  emoji: string;
  label: string;
  avgChatsPerHour: number;
}

/**
 * 채팅 화력 뱃지 계산
 * @param chatCount 전체 채팅 개수
 * @param durationMinutes 전체 방송 시간 (분)
 * @returns 화력 뱃지 정보 또는 null (1만 미만)
 */
export function calculateFirepowerBadge(
  chatCount?: number,
  durationMinutes?: number
): FirepowerBadge | null {
  if (!chatCount || !durationMinutes || durationMinutes <= 0) {
    return null;
  }

  // (전체채팅 / 전체 방송시간(분)) * 60 = 1시간 평균채팅
  const avgChatsPerHour = (chatCount / durationMinutes) * 60;

  // 1만 미만은 표시 안 함
  if (avgChatsPerHour < 10000) {
    return null;
  }

  // 3만 이상 = 🏆
  if (avgChatsPerHour >= 30000) {
    return {
      emoji: "🏆",
      label: "레전드",
      avgChatsPerHour: Math.round(avgChatsPerHour),
    };
  }

  // 2만 이상 = 💎
  if (avgChatsPerHour >= 20000) {
    return {
      emoji: "💎",
      label: "다이아",
      avgChatsPerHour: Math.round(avgChatsPerHour),
    };
  }

  // 1만 이상 = 🔥
  return {
    emoji: "🔥",
    label: "핫",
    avgChatsPerHour: Math.round(avgChatsPerHour),
  };
}
