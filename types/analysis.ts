// AI 분석 관련 타입 정의

export type TaskStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type AnalysisMethod = "summary" | "highlights" | "qa" | "custom";

export interface WhisperModel {
  id: string;
  name: string;
  size: string;
  downloaded: boolean;
  path?: string;
}

export interface WhisperEngine {
  id: string;
  name: string;
  available: boolean;
}

export interface StreamLog {
  id: string;
  vodId: string;
  vodTitle: string;
  streamerName: string;
  thumbnailUrl?: string;
  broadcastDate: string;
  videoPath: string;
  chatLogPath?: string;
  voiceLogPath?: string;
  streamLogPath?: string;
  createdAt: string;
  status: TaskStatus;
  error?: string;
  statistics?: {
    totalEvents?: number;
    chatCount?: number;
    srtCount?: number;
    durationMinutes?: number;
    byType?: {
      [key: string]: {
        count: number;
        weight_sum: number;
      };
    };
  };
}

export interface TranscriptionTask {
  id: string;
  vodId: string;
  vodTitle: string;
  streamerName: string;
  thumbnailUrl?: string;
  videoPath: string;
  vodUrl?: string;
  whisperModel: string;
  whisperEngine: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  logs?: TaskLog[];
}

export interface TaskLog {
  message: string;
  type: 'info' | 'error' | 'success' | 'warning';
  timestamp: string;
}

export interface AnalysisTask {
  id: string;
  streamLogId: string;
  vodTitle: string;
  streamerName: string;
  provider: "ollama" | "openai" | "google";
  model: string;
  analysisMethod: AnalysisMethod;
  customPrompt?: string;
  glossary?: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  resultPath?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AnalysisResult {
  id: string;
  taskId: string;
  vodTitle: string;
  streamerName: string;
  analysisMethod: AnalysisMethod;
  provider: string;
  model: string;
  content: string;
  createdAt: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified: string;
}

export interface OllamaSettings {
  connected: boolean;
  baseUrl: string;
  selectedModel?: string;
  contextLength: number;
  temperature: number;
}

export interface AISettings {
  // Ollama 설정
  ollama: OllamaSettings;
  
  // OpenAI 설정
  openai: {
    apiKey?: string;
    model: string;
    temperature: number;
  };
  
  // Google AI 설정
  google: {
    apiKey?: string;
    model: string;
    temperature: number;
  };
  
  // Whisper 설정
  whisper: {
    defaultModel: string;
    defaultEngine: string;
    modelsPath: string;
  };
  
  // 분석 설정
  analysis: {
    defaultProvider: "ollama" | "openai" | "google";
    defaultMethod: AnalysisMethod;
    globalGlossary: string;
  };
}
