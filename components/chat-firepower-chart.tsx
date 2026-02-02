"use client";

import React, { useEffect, useState } from "react";
import { Area, ReferenceDot } from "recharts";
import { AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { ChatFirepowerData } from "@/lib/stream-log-parser";

interface ChatFirepowerChartProps {
  streamLogPath: string;
  videoPath: string;
}

export function ChatFirepowerChart({ streamLogPath, videoPath }: ChatFirepowerChartProps) {
  const [chartData, setChartData] = useState<{ time: string; chats: number; hotChats: number | null }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadChartData();
  }, [streamLogPath, videoPath]);

  const loadChartData = async () => {
    if (!streamLogPath || !videoPath) {
      return;
    }

    setIsLoading(true);
    try {
      // videoPath에서 실제 파일명 추출 (.mp4 제거)
      const videoBaseName = videoPath.replace(/\.[^.]+$/, ''); // 확장자 제거
      
      // 1. 먼저 경량 차트 데이터 파일 찾기 (.cache 폴더에서)
      const parts = videoBaseName.split('\\');
      const fileName = parts.pop(); // 파일명
      const aiCachePath = [...parts, 'AI', '.cache', fileName + '_로그.chart.json'].join('\\');
      
      let firepowerData = null;
      const chartContent = await window.electron?.readFile(aiCachePath);
      
      if (chartContent) {
        // 경량 차트 파일이 있으면 바로 사용 (빠름)
        try {
          firepowerData = JSON.parse(chartContent);
        } catch (e) {
          console.warn('[Chart] Failed to parse chart.json, falling back to full JSON');
        }
      }
      
      // 2. 차트 파일이 없으면 원본 JSON에서 계산 (호환성)
      if (!firepowerData) {
        let jsonPath = videoBaseName + '.json';
        let content = await window.electron?.readFile(jsonPath);
        
        // AI 폴더에서 찾기
        if (!content) {
          const aiJsonPath = [...parts, 'AI', fileName + '.json'].join('\\');
          content = await window.electron?.readFile(aiJsonPath);
        }
        
        if (!content) {
          setChartData([]);
          return;
        }

        // JSON 파서로 화력 계산
        const { calculateChatFirepowerFromJson } = await import("@/lib/stream-log-parser");
        firepowerData = calculateChatFirepowerFromJson(content);
      }

      // Recharts 형식으로 변환
      const formatted = firepowerData.labels.map((label: string, index: number) => ({
        time: label,
        chats: Number(firepowerData.data[index].toFixed(3)),
      }));

      // 평균 계산 (상위 구간 강조용)
      const avgChats = formatted.reduce((sum: number, d: { time: string; chats: number }) => sum + d.chats, 0) / formatted.length;
      const threshold = avgChats * 1.2; // 평균의 120% 이상을 핫 구간으로

      // 핫 구간 데이터 생성
      const formattedWithHot = formatted.map((item: { time: string; chats: number }) => ({
        ...item,
        hotChats: item.chats > threshold ? item.chats : null,
      }));

      setChartData(formattedWithHot);
    } catch (error) {
      console.error("[Chart] Failed to load chart data:", error);
      setChartData([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full pt-2 flex items-center justify-center text-xs text-muted-foreground">
        차트 로딩 중...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="w-full h-full pt-2 flex items-center justify-center text-xs text-muted-foreground">
        채팅 데이터 없음
      </div>
    );
  }

  return (
    <div className="w-full h-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 15, bottom: 0 }}>
          <defs>
            <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.15} vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 9, fill: "currentColor" }}
            stroke="hsl(var(--border))"
            strokeOpacity={0.3}
            tickLine={false}
            height={20}
            ticks={(() => {
              const allTicks = chartData.map(d => d.time);
              const firstTick = allTicks[0];
              const lastTick = allTicks[allTicks.length - 1];
              const filtered = allTicks.filter(tick => {
                const minutes = parseInt(tick);
                return minutes % 30 === 0;
              });
              // 첫/마지막 추가 (중복 제거)
              const result = [firstTick, ...filtered, lastTick];
              return [...new Set(result)];
            })()}
          />
          <YAxis
            tick={false}
            stroke="none"
            tickLine={false}
            width={0}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "11px",
              padding: "6px 10px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: "10px", marginBottom: "2px" }}
            formatter={(value: any) => [<span style={{ color: '#3b82f6', fontWeight: '600' }}>{Number(value).toFixed(2)}</span>, '채팅화력']}
            cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeOpacity: 0.3, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotoneX"
            dataKey="chats"
            stroke="#3b82f6"
            strokeWidth={0.5}
            strokeDasharray="5 3"
            fill="url(#colorChats)"
            activeDot={{ r: 4, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
            animationDuration={800}
            animationEasing="ease-out"
          />
          {/* 불타는 구간에 🔥 아이콘 표시 */}
          {chartData.filter(d => d.hotChats !== null).map((point, index) => (
            <ReferenceDot
              key={`hot-${index}`}
              x={point.time}
              y={point.chats}
              r={0}
              label={{
                value: '🔥',
                position: 'top',
                fontSize: 16,
                offset: 5,
              }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
