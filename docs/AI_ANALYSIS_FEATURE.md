# AI 분석 기능 구현 문서

## 개요

치지직 스크라이브에 AI 분석 기능이 추가되었습니다. 이 기능은 Whisper를 활용한 음성 인식과 AI 모델을 통한 방송 내용 분석을 제공합니다.

## 아키텍처

### 주요 컴포넌트

```
app/analysis/page.tsx          - 메인 AI 분석 페이지 (4개 탭)
components/
  ├── add-stream-log-dialog.tsx      - 스트림 로그 추가 다이얼로그
  ├── analysis-settings-dialog.tsx   - AI 분석 설정 다이얼로그
  └── app-sidebar.tsx                - AI 분석 메뉴 추가
types/analysis.ts              - AI 분석 관련 타입 정의
```

## 주요 기능

### 1. 스트림 로그 (Stream Log)

**컨셉**: "음성과 채팅이 하나로."

불필요한 정보를 걸러내고 방송의 본질만 담아낸 고순도 전체 방송 스크립트

#### 생성 프로세스

1. **VOD 선택**
   - 저장된 VOD 목록에서 선택
   - 로컬 동영상 파일 추가 (+ VOD 주소 입력)

2. **음성 인식 설정**
   - Whisper 모델 선택 (Tiny, Base, Small, Medium, Large)
   - 엔진 선택 (Faster Whisper, Whisper.cpp, OpenAI Whisper)
   - 미설치 모델은 자동 다운로드

3. **작업 실행**
   - 작업 큐에 추가
   - 백그라운드에서 음성 인식 실행
   - 음성 로그 생성: `다운로드폴더/ai/원본파일이름_보이스로그.srt`
   - 채팅 로그 다운로드 (없는 경우)
   - 두 로그 병합 → 스트림 로그 생성

4. **오류 처리**
   - 상세 로그: `다운로드폴더/ai/log/`

### 2. 작업 큐 (Task Queue)

#### 표시 항목

- 음성 인식 작업
- AI 분석 작업
- 진행 상태 (대기 중, 처리 중, 완료, 실패, 취소됨)
- 진행률 표시
- 오류 메시지

#### 작업 제어

- 일시정지/재개
- 취소
- 재시도 (실패한 작업)

#### 사이드바 알림

- 진행 중인 작업 수를 배지로 표시
- Downloads 메뉴와 동일한 방식

### 3. AI 분석

#### 지원 제공자

**1. Ollama (로컬)**
- 연결 상태 확인
- 모델 목록 조회
- 모델 다운로드
- 컨텍스트 길이 설정 (2048 ~ 32768)
- 온라인 설치 가이드 링크

**2. OpenAI**
- API 키 입력
- 모델 선택 (GPT-4, GPT-4 Turbo, GPT-3.5 Turbo)

**3. Google AI**
- API 키 입력
- 모델 선택 (Gemini Pro, Gemini Pro Vision)

#### 분석 방법

| 방법 | 설명 |
|------|------|
| **요약** | 방송의 핵심 내용을 요약합니다 |
| **하이라이트** | 주요 장면과 재미있는 순간을 추출합니다 |
| **Q&A** | 시청자 질문과 스트리머 답변을 정리합니다 |
| **커스텀** | 직접 프롬프트를 작성합니다 |

#### 전용 용어집

- 방송에서 사용되는 특수 용어나 밈 입력
- 예시:
  ```
  야루 = 야식을 먹으러 가자
  ㄱㄱ = 고고
  ```

### 4. 분석 결과 (Results)

#### 기능

- 분석 완료된 항목 목록
- 카드 형태로 표시 (VOD 제목, 스트리머, 분석 방법, 제공자)
- 상세 보기
- 다운로드
- 삭제

#### 결과 뷰어

- 전체 화면 다이얼로그
- 마크다운/텍스트 형식
- 내보내기 기능

### 5. 설정 (Settings)

#### Whisper 모델 관리

```typescript
모델 목록:
- Tiny    (75MB)
- Base    (142MB)
- Small   (466MB)
- Medium  (1.5GB)
- Large   (2.9GB)
```

- 모델 다운로드
- 설치된 모델 삭제
- 앱 언인스톨 시 자동 삭제

#### AI 제공자 설정

- **Ollama**: 서버 주소, 연결 테스트
- **OpenAI**: API 키 저장
- **Google AI**: API 키 저장

## 데이터 모델

### StreamLog

```typescript
interface StreamLog {
  id: string;
  vodId: string;
  vodTitle: string;
  streamerName: string;
  thumbnailUrl?: string;
  broadcastDate: string;
  videoPath: string;
  chatLogPath?: string;      // 채팅 로그 경로
  voiceLogPath?: string;     // 음성 인식 결과 (.srt)
  streamLogPath?: string;    // 최종 스트림 로그
  createdAt: string;
  status: TaskStatus;
  error?: string;
}
```

### TranscriptionTask

```typescript
interface TranscriptionTask {
  id: string;
  vodId: string;
  vodTitle: string;
  streamerName: string;
  videoPath: string;
  vodUrl?: string;
  whisperModel: string;      // tiny, base, small, medium, large
  whisperEngine: string;     // faster-whisper, whisper-cpp, openai-whisper
  status: TaskStatus;
  progress: number;          // 0-100
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

### AnalysisTask

```typescript
interface AnalysisTask {
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
```

### AnalysisResult

```typescript
interface AnalysisResult {
  id: string;
  taskId: string;
  vodTitle: string;
  streamerName: string;
  analysisMethod: AnalysisMethod;
  provider: string;
  model: string;
  content: string;           // 분석 결과 텍스트
  createdAt: string;
}
```

## 파일 구조

```
다운로드폴더/
└── ai/
    ├── 원본파일이름_보이스로그.srt     # 음성 인식 결과
    ├── 원본파일이름_스트림로그.txt     # 최종 스트림 로그
    ├── 원본파일이름_분석결과.txt       # AI 분석 결과
    └── log/
        └── 2026-01-30_error.log       # 오류 로그
```

## UI 플로우

### 스트림 로그 생성

```
1. AI 분석 메뉴 클릭
2. 스트림 로그 탭
3. [추가] 버튼 클릭
4. VOD 선택 또는 로컬 파일 추가
5. Whisper 모델/엔진 선택
6. [생성] 버튼 클릭
7. → 작업 큐 탭에서 진행 상황 확인
8. → 완료 후 스트림 로그 탭에 표시
```

### AI 분석 실행

```
1. 스트림 로그 탭에서 로그 선택
2. [AI 분석 시작] 버튼 클릭
3. 제공자 선택 (Ollama/OpenAI/Google)
4. 모델 및 설정 구성
5. 분석 방법 선택
6. (선택) 용어집 입력
7. [분석 시작] 버튼 클릭
8. → 작업 큐 탭에서 진행 상황 확인
9. → 완료 후 분석결과 탭에서 확인
```

## 구현 상태

### ✅ 완료

- [x] 타입 정의 (`types/analysis.ts`)
- [x] AI 분석 페이지 레이아웃 (`app/analysis/page.tsx`)
- [x] 4개 탭 UI (스트림 로그, 작업 큐, 분석결과, 설정)
- [x] 스트림 로그 추가 다이얼로그
- [x] AI 분석 설정 다이얼로그
- [x] 사이드바 메뉴 추가
- [x] 작업 큐 카운트 표시 구조

### 🚧 TODO (백엔드 구현 필요)

#### 1. Whisper 음성 인식
```python
# Python 스크립트 연동
- Whisper 모델 다운로드
- 음성 → 텍스트 변환
- SRT 파일 생성
```

#### 2. 스트림 로그 병합
```python
# 이미 작성된 Python 로직 연결
- 채팅 로그 파싱
- 음성 로그 파싱
- 타임스탬프 기반 병합
- 최종 스트림 로그 생성
```

#### 3. AI 분석 API 연동
```typescript
- Ollama API 연결
- OpenAI API 연결
- Google AI API 연결
- 프롬프트 템플릿 시스템
```

#### 4. 작업 큐 관리
```typescript
- Zustand store 확장
- 백그라운드 작업 처리
- 진행률 업데이트
- 오류 핸들링
```

#### 5. 파일 시스템
```typescript
- Electron dialog API 연동
- 파일 저장/불러오기
- 로그 파일 관리
```

#### 6. 상태 관리
```typescript
// lib/store.ts 확장
- streamLogs: StreamLog[]
- transcriptionTasks: TranscriptionTask[]
- analysisTasks: AnalysisTask[]
- analysisResults: AnalysisResult[]
- aiSettings: AISettings
```

## 통합 체크리스트

### Phase 1: 음성 인식
- [ ] Whisper 모델 다운로드 기능
- [ ] 음성 인식 작업 처리
- [ ] 진행률 업데이트
- [ ] SRT 파일 생성

### Phase 2: 스트림 로그
- [ ] 채팅 로그 다운로드 연동
- [ ] Python 병합 스크립트 연결
- [ ] 스트림 로그 목록 관리
- [ ] 파일 저장/불러오기

### Phase 3: AI 분석
- [ ] Ollama 연동
- [ ] OpenAI API 연동
- [ ] Google AI API 연동
- [ ] 프롬프트 시스템
- [ ] 분석 결과 저장

### Phase 4: 작업 큐
- [ ] 백그라운드 작업 처리
- [ ] 작업 상태 관리
- [ ] 일시정지/재개/취소
- [ ] 오류 처리 및 재시도

### Phase 5: 설정 및 최적화
- [ ] 설정 저장/불러오기
- [ ] 모델 캐시 관리
- [ ] 성능 최적화
- [ ] 오류 로깅

## API 명세 (예정)

### IPC Bridge 확장

```typescript
// lib/ipc-bridge.ts 추가 필요
export const ipcBridge = {
  // 기존 메서드들...
  
  // Whisper
  downloadWhisperModel: (modelId: string) => Promise<void>,
  listWhisperModels: () => Promise<WhisperModel[]>,
  deleteWhisperModel: (modelId: string) => Promise<void>,
  startTranscription: (taskId: string, videoPath: string, model: string, engine: string) => Promise<void>,
  
  // Ollama
  checkOllamaConnection: (url: string) => Promise<boolean>,
  listOllamaModels: (url: string) => Promise<string[]>,
  downloadOllamaModel: (url: string, modelName: string) => Promise<void>,
  
  // AI 분석
  startAnalysis: (taskId: string, streamLogPath: string, config: AnalysisConfig) => Promise<void>,
  
  // 파일 관리
  saveAnalysisResult: (result: AnalysisResult) => Promise<string>,
  loadStreamLog: (path: string) => Promise<string>,
  deleteAnalysisResult: (resultId: string) => Promise<void>,
};
```

## 참고 사항

### Whisper 모델 크기 및 성능

| 모델 | 크기 | VRAM | 상대 속도 | 정확도 |
|------|------|------|----------|--------|
| Tiny | 75MB | ~1GB | ~32x | 낮음 |
| Base | 142MB | ~1GB | ~16x | 보통 |
| Small | 466MB | ~2GB | ~6x | 좋음 |
| Medium | 1.5GB | ~5GB | ~2x | 매우 좋음 |
| Large | 2.9GB | ~10GB | 1x | 최고 |

### 권장 설정

- **빠른 테스트**: Tiny + Faster Whisper
- **균형**: Small + Faster Whisper
- **고품질**: Medium/Large + Faster Whisper

### Ollama 설치

```bash
# Windows
winget install Ollama.Ollama

# 또는 https://ollama.ai 에서 다운로드
```

### 추천 Ollama 모델

- **요약**: `llama2`, `mistral`
- **한국어**: `solar`, `kullm`
- **고성능**: `llama3`, `mixtral`

## 라이선스 및 크레딧

- **Whisper**: OpenAI (MIT License)
- **Ollama**: Ollama (MIT License)
- **Faster Whisper**: Guillaume Klein (MIT License)

---

**작성일**: 2026년 1월 30일
**버전**: v1.1.0 (feature/v1.1.0 브랜치)
**상태**: UI 완료, 백엔드 구현 대기
