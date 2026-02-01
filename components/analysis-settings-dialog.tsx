"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import type { StreamLog, AnalysisMethod } from "@/types/analysis";

interface AnalysisSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  streamLog: StreamLog | null;
  onConfirm: (data: {
    provider: "ollama" | "openai" | "google";
    model: string;
    analysisMethod: AnalysisMethod;
    customPrompt?: string;
    glossary?: string;
  }) => void;
}

export function AnalysisSettingsDialog({
  open,
  onOpenChange,
  streamLog,
  onConfirm,
}: AnalysisSettingsDialogProps) {
  const [provider, setProvider] = useState<"ollama" | "openai" | "google">("ollama");
  const [analysisMethod, setAnalysisMethod] = useState<AnalysisMethod>("summary");
  const [customPrompt, setCustomPrompt] = useState("");
  const [glossary, setGlossary] = useState("");

  // Ollama 설정
  const [ollamaConnected, setOllamaConnected] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [contextLength, setContextLength] = useState(4096);

  // OpenAI 설정
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4");

  // Google 설정
  const [googleApiKey, setGoogleApiKey] = useState("");
  const [googleModel, setGoogleModel] = useState("gemini-pro");

  const analysisMethodOptions = [
    { value: "summary", label: "요약", description: "방송의 핵심 내용을 요약합니다" },
    { value: "highlights", label: "하이라이트", description: "주요 장면과 재미있는 순간을 추출합니다" },
    { value: "qa", label: "Q&A", description: "시청자 질문과 스트리머 답변을 정리합니다" },
    { value: "custom", label: "커스텀", description: "직접 프롬프트를 작성합니다" },
  ];

  const canConfirm = () => {
    if (provider === "ollama") {
      return ollamaConnected && selectedOllamaModel;
    } else if (provider === "openai") {
      return openaiApiKey && openaiModel;
    } else if (provider === "google") {
      return googleApiKey && googleModel;
    }
    return false;
  };

  const handleConfirm = () => {
    if (!canConfirm()) return;

    let model = "";
    if (provider === "ollama") model = selectedOllamaModel;
    else if (provider === "openai") model = openaiModel;
    else if (provider === "google") model = googleModel;

    onConfirm({
      provider,
      model,
      analysisMethod,
      customPrompt: analysisMethod === "custom" ? customPrompt : undefined,
      glossary,
    });

    onOpenChange(false);
  };

  return (
    <div className="space-y-4">
      <Tabs value={provider} onValueChange={(v) => setProvider(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ollama">Ollama (로컬)</TabsTrigger>
          <TabsTrigger value="openai">OpenAI</TabsTrigger>
          <TabsTrigger value="google">Google AI</TabsTrigger>
        </TabsList>

        <TabsContent value="ollama" className="space-y-4">
          <div className="space-y-4">
            {/* Ollama 연결 상태 */}
            <Alert>
              {ollamaConnected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription>Ollama에 연결되었습니다</AlertDescription>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="space-y-2">
                    <p>Ollama가 설치되어 있지 않거나 실행 중이 아닙니다.</p>
                    <a
                      href="https://ollama.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Ollama 다운로드 <ExternalLink className="h-3 w-3" />
                    </a>
                  </AlertDescription>
                </>
              )}
            </Alert>

            <div className="space-y-2">
              <Label>모델</Label>
              <Select
                value={selectedOllamaModel}
                onValueChange={setSelectedOllamaModel}
                disabled={!ollamaConnected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="모델을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {ollamaModels.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      사용 가능한 모델이 없습니다
                    </div>
                  ) : (
                    ollamaModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!ollamaConnected}
              >
                모델 다운로드
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>컨텍스트 길이</Label>
                <span className="text-sm text-muted-foreground">{contextLength}</span>
              </div>
              <Slider
                value={[contextLength]}
                onValueChange={(v) => setContextLength(v[0])}
                min={2048}
                max={32768}
                step={1024}
                disabled={!ollamaConnected}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="openai" className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="space-y-2">
            <Label>모델</Label>
            <Select value={openaiModel} onValueChange={setOpenaiModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4">GPT-4</SelectItem>
                <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        <TabsContent value="google" className="space-y-4">
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={googleApiKey}
              onChange={(e) => setGoogleApiKey(e.target.value)}
              placeholder="AIza..."
            />
          </div>

          <div className="space-y-2">
            <Label>모델</Label>
            <Select value={googleModel} onValueChange={setGoogleModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                <SelectItem value="gemini-pro-vision">Gemini Pro Vision</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>

      {/* 분석 방법 */}
      <div className="space-y-2 pt-4 border-t">
        <Label>분석 방법</Label>
        <Select value={analysisMethod} onValueChange={(v) => setAnalysisMethod(v as AnalysisMethod)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {analysisMethodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 커스텀 프롬프트 */}
      {analysisMethod === "custom" && (
        <div className="space-y-2">
          <Label>커스텀 프롬프트</Label>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="분석에 사용할 프롬프트를 입력하세요..."
            rows={4}
          />
        </div>
      )}

      {/* 전용 용어집 */}
      <div className="space-y-2">
        <Label>전용 용어집 (선택사항)</Label>
        <Textarea
          value={glossary}
          onChange={(e) => setGlossary(e.target.value)}
          placeholder="방송에서 사용되는 특수 용어나 밈을 입력하세요. 한 줄에 하나씩..."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          예: 야루 = 야식을 먹으러 가자, ㄱㄱ = 고고
        </p>
      </div>

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          취소
        </Button>
        <Button onClick={handleConfirm} disabled={!canConfirm()}>
          분석 시작
        </Button>
      </div>
    </div>
  );
}
