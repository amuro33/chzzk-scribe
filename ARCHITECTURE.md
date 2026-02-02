# Architecture (시스템 아키텍처)

Chzzk Scribe는 **Electron**과 **Next.js**를 결합한 하이브리드 구조로 설계된 데스크탑 어플리케이션입니다.

## 🏗 시스템 구조

프로젝트는 크게 두 가지 핵심 프로세스로 나뉘어 동작합니다.

### 1. Main Process (Electron)
- **역할**: 실제 운영체제(OS)와의 인터페이스 및 보안 관리
- **기술**: Node.js
- **주요 기능**:
  - 창 제어 (최소화, 최대화, 닫기)
  - 파일 시스템 다이얼로그 (저장 폴더 선택)
  - **보안 쿠키 관리**: `safeStorage` API를 사용하여 네이버 로그인 쿠키를 암호화하여 로컬에 저장
  - 자동 업데이트 (`electron-updater`) 관리
  - 디스크 여유 공간 체크

### 2. Renderer Process (Next.js)
- **역할**: 사용자 인터페이스(UI) 표현 및 비즈니스 로직 실행
- **기술**: React, Next.js, Tailwind CSS
- **주요 기능**:
  - 치지직 VOD 목록 조회 및 필터링
  - 다운로드 상태 실시간 모니터링
  - 채팅 데이터 파싱 및 가공

## 📡 통신 메커니즘

앱 내 데이터 흐름은 다음 두 가지 방식을 통해 효율적으로 이루어집니다.

### IPC (Inter-Process Communication)
`preload.js`를 통해 노출된 안전한 브릿지를 사용하여 Renderer와 Main 프로세스가 통신합니다.
- `ipcMain.handle` / `ipcRenderer.invoke`: 비동기 요청 및 응답 처리에 사용(예: 설정 불러오기)
- `ipcMain.on` / `ipcRenderer.send`: 단방향 알림 처리에 사용(예: 창 상태 변경)

### Next.js Server Actions
VOD 다운로드와 같은 무거운 연산이나 로컬 파일 쓰기 작업은 Next.js의 Server Actions를 통해 처리합니다.
- 별도의 API 엔드포인트를 구성하는 대신, 리액트 컴포넌트에서 직접 서버 사이드 함수를 호출하여 로컬 Node.js 환경의 기능을 수행합니다.
- **주요 사용처**: `streamlink`, `yt-dlp` 프로세스 실행 및 `ffmpeg` 변환 작업

## 🛡보안 정책 (Security)

- **Context Isolation**: Renderer 프로세스가 Node.js API에 직접 접근하는 것을 차단하고, `preload` 스크립트를 통해서만 제한적인 접근을 허용합니다.
- **SafeStorage**: 사용자의 로그인 세션(NID_AUT, NID_SES)은 OS 수준의 암호화 기술을 사용하여 보호됩니다.
- **CSP (Content Security Policy)**: 외부 스크립트 실행을 제한하고, 치지직 및 네이버 도메인에 대해서만 이미지 및 연결을 허용합니다.

## 🛠 외부 종속성 (External Tools)

어플리케이션 성능의 핵심을 담당하는 외부 도구들은 Node.js의 `spawn` 기능을 통해 제어됩니다.
- **Streamlink**: 실시간/VOD 스트림 세그먼트 다운로드
- **FFmpeg**: 동영상 remuxing 및 자막 병합 지원
- **Python (Embeddable)**: Faster-Whisper 음성 인식 엔진 구동
  - 버전: Python 3.10.11 (embed-amd64)
  - 위치: `bin/faster-whisper-env/python/`
  - 패키지: pip, setuptools, wheel, faster-whisper

## 🤖 AI 분석 시스템

### Whisper 음성 인식
- **엔진**: Faster-Whisper (CTranslate2 기반)
- **모델**: Tiny, Base, Small, Medium, Large 지원
- **처리 방식**: 
  - Python 래퍼 스크립트(`lib/transcribe_wrapper.py`)를 통한 실행
  - 작업 큐 시스템으로 백그라운드 처리
  - 진행률 실시간 모니터링

### 스트림 로그 생성
- **음성 로그**: Whisper로 생성된 SRT 파일
- **채팅 로그**: 치지직 API에서 다운로드한 채팅 데이터
- **병합**: 타임스탬프 기준으로 음성과 채팅을 하나의 스트림 로그로 결합
- **출력**: `{다운로드폴더}/{스트리머이름}/ai/{파일명}_streamlog.md`
