# Whisper 모델 및 엔진 구현 시나리오

**작성일**: 2026년 1월 31일
**상태**: 초안

---

## 1. 개요
Whisper 모델(Small, Medium 등)과 구동 엔진(Whisper.cpp 등)은 **사용자가 [다운로드] 버튼을 직접 눌렀을 때만 설치**됩니다. 분석 시작 시 자동으로 다운로드되지 않으며, 사용자가 명시적으로 관리(다운로드/삭제)해야 합니다.

## 2. 파일 저장소 구조 (Directory Structure)
애플리케이션 내 `bin` 폴더와 사용자 데이터 폴더(`userData`)를 구분하여 사용합니다. 엔진은 앱 업데이트와 함께 관리되거나 1회성 설정이므로 정적 경로에, 모델은 용량이 크고 업데이트가 잦으므로 사용자 데이터 영역에 저장합니다.

```text
%USER_DATA%/ (Electron app.getPath('userData'))
└── whisper/
    ├── engines/
    │   ├── whisper-cpp/
    │   │   └── main.exe (또는 whisper-cli)
    │   └── faster-whisper/
    │       └── (Standalone libs or venv)
    └── models/
        ├── whisper-cpp/       <-- 엔진별로 모델 폴더 분리
        │   ├── ggml-small.bin
        │   └── ggml-medium.bin
        ├── faster-whisper/
        │   ├── small/
        │   └── medium/
        └── openai/
            └── small.pt
```

## 3. 엔진별 구현 전략

### A. Whisper.cpp (권장 - CPU/GPU 겸용, 단일 바이너리)
- **배포 방식**: GitHub Releases에서 OS에 맞는 사전 컴파일된 바이너리(`main.exe` 등)를 다운로드.
- **실행**: `child_process.spawn`으로 실행.
- **장점**: 설치 과정이 가장 간단하며 의존성이 없음.

### B. Faster-Whisper / OpenAI Whisper (Python 기반)
- **배포 방식**:
  1. **내장 Python 활용**: 현재 `bin/streamlink/Python`에 포함된 Portable Python 환경을 활용합니다.
  2. **패키지 설치**: `pip install faster-whisper` 등을 통해 패키지를 설치하는 스크립트를 최초 1회 실행합니다.
- **실행**: 내장 Python으로 래퍼 스크립트(`lib/transcribe_wrapper.py`)를 실행.
- **모델 다운로드**: Hugging Face에서 `config.json`을 먼저 다운로드하여 실제 필요한 파일 목록을 파싱 후, 나머지 파일(`model.bin`, `tokenizer.json`, `vocabulary.txt`)을 순차적으로 다운로드합니다.

## 4. 모델 관리 (Model Management)

엔진마다 요구하는 모델 형식이 다릅니다. UI에서 엔진을 선택하면, 해당 엔진에 맞는 모델 파일의 존재 여부를 확인합니다.

| 모델 (Logical) | 엔진 | 실제 파일/폴더 | 다운로드 소스 |
| :--- | :--- | :--- | :--- |
| **Small** | Whisper.cpp | `ggml-small.bin` | HuggingFace (ggerganov/whisper.cpp) |
| **Small** | Faster-Whisper | `models--systran--faster-whisper-small/` | HuggingFace (Systran/faster-whisper-small) |
| **Small** | OpenAI | `small.pt` | OpenAI Bucket |

## 5. 구현 프로세스 (Step-by-Step)

### Step 1: Backend (Electron Main/IPC)
`lib/whisper-manager.js` 모듈을 사용하여 다음 기능을 담당합니다.

1.  **상태 확인 (`get-whisper-status`)**:
    *   요청: `{ engineId }`
    *   응답: 모델 목록과 각 모델의 다운로드 상태(`exists`, `path`, `size`), 엔진 설치 상태.
2.  **다운로드 (`download-whisper-resource`)**:
    *   인자: `{ type: 'model' | 'engine', engineId, modelId }`
    *   스트리밍 방식으로 다운로드 진행률을 프론트엔드로 전송 (`download-progress` 이벤트).
3.  **해시 검증**: 다운로드 완료 후 파일 무결성 검증.
4.  **리소스 삭제 (`delete-whisper-resource`)**:
    *   인자: `{ type: 'model', engineId, modelId }`
    *   해당 모델 파일을 디스크에서 삭제하여 공간 확보.

### Step 1-1: Hugging Face 모델 다운로드 로직

`lib/whisper-manager.js`에서 Hugging Face로부터 모델을 다운로드하는 방식:

1.  **config.json 우선 다운로드**:
    *   먼저 `config.json`을 다운로드하여 실제 필요한 파일 목록을 파싱합니다.
    *   `model_file`, `vocabulary_file` 등의 설정값을 읽어옵니다.

2.  **동적 파일 목록 구성**:
    *   기본 파일: `config.json`, `model.bin`, `tokenizer.json`, `vocabulary.txt`
    *   `config.json`에 정의된 파일명이 있으면 해당 값을 사용합니다.

3.  **재시도 로직 (Retry)**:
    *   네트워크 오류 발생 시 최대 3회 재시도합니다.
    *   지수 백오프 적용: 1초 → 2초 → 4초 (최대 5초)
    *   실패 시 불완전한 파일 자동 삭제

4.  **CDN 리다이렉트 처리**:
    *   Hugging Face는 대용량 파일을 CDN(`cas-bridge.xethub.hf.co`)으로 리다이렉트합니다.
    *   HTTP 301/302/307/308 리다이렉트를 자동으로 따라갑니다.
    *   로그에는 파일명만 표시되어 긴 CDN URL이 노출되지 않습니다.

5.  **진행률 계산**:
    *   개별 파일 진행률 + 전체 파일 진행률을 계산하여 표시합니다.
    *   `model.bin` 같은 대용량 파일에 대해 상세 진행률을 표시합니다.

### Step 2: Frontend (UI/UX)
`components/add-stream-log-dialog.tsx` 수정.

1.  **엔진 선택 연동**:
    *   다이얼로그 Step 2 진입 시, 또는 엔진 테이블 렌더링 시 `ipcBridge.invoke("get-whisper-status")`를 호출하여 최신 상태 동기화.
    *   테이블 내 각 엔진의 `available` 상태와 모델의 `downloaded` 상태를 갱신.
2.  **다운로드 및 관리 UI (수동 관리)**:
    *   **엔진/모델 테이블** 내에서 각 항목의 상태(설치됨/미설치)를 직관적으로 표시합니다.
    *   미설치 항목: 테이블 행 우측에 **[다운로드]** 버튼(아이콘 포함)을 표시합니다.
    *   설치된 항목: 기본적으로 **[준비됨]** 배지를 표시하되, 마우스 오버 시 또는 별도의 관리 모드에서 **[제거]** 버튼(휴지통 아이콘)으로 전환되어 삭제할 수 있게 합니다.
    *   [생성하기] 버튼은 선택된 엔진과 모델이 모두 설치된 상태여야만 활성화됩니다.
3.  **프로그레스 바**:
    *   다운로드 중 다이얼로그 내에 진행률 표시줄(Progress bar) 표시.

### Step 3: 실행 (Execution)
`lib/download-processor.tsx` (또는 신규 `lib/transcription-service.ts`)에서 수행합니다.

1.  **작업 큐 등록 (Background)**:
    *   사용자가 [생성하기]를 클릭하면 `downloads` 큐(또는 별도 AI 작업 큐)에 작업을 등록하고 모달을 닫습니다.
    *   작업은 백그라운드에서 비동기로 실행됩니다.
2.  **출력 경로 및 실행**:
    *   **출력 경로**: `{설정의다운로드path}\{스트리머이름}\ai\` 폴더를 자동 생성합니다.
    *   **파일명**: `{원본동영상파일명}.srt`
    *   `child_process`를 통해 Whisper 엔진을 실행하여 SRT 파일을 지정된 경로에 출력합니다.
        *   Ex: `whisper-cpp.exe ... -osrt -of "{출력경로}/{파일명}"`
3.  **완료 처리**:
    *   SRT 파일 생성이 완료되면 해당 작업을 "완료됨"으로 표시합니다.
    *   이 시점에서 **스트림 로그 생성이 완료**된 것으로 간주하며, 이후 채팅 로그와의 병합 등 추가 분석 작업이 가능해집니다.

## 6. 데이터 구조 예시 (Types)

```typescript
// types/whisper.ts

export type WhisperEngineId = 'whisper-cpp' | 'faster-whisper' | 'openai-whisper';
export type WhisperModelId = 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';

export interface WhisperResourceStatus {
  engineId: WhisperEngineId;
  isEngineReady: boolean;
  models: Record<WhisperModelId, {
    downloaded: boolean;
    localPath?: string;
    size?: string;
  }>;
}
```
