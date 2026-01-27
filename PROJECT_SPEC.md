# PROJECT_SPEC.md - Chzzk Scribe (치지직 스크라이브)

이 문서는 **치지직 스크라이브** 프로젝트의 PM(Product Manager) 및 메인 아키텍트로서 정의한 프로젝트 사양서입니다. 프로젝트의 핵심 가치, 기능적 요구사항, 기술적 제약 사항 및 아키텍처를 상세히 기록하여 개발의 일관성을 유지합니다.

---

### 1. Project Identity (프로젝트 개요)
- **프로젝트명:** Chzzk Scribe (치지직 스크라이브)
- **한 줄 요약:** 치지직(Chzzk)의 다시보기(VOD) 및 라이브 방송을 다운로드하는 윈도우용 데스크탑 앱.
- **핵심 가치:** 복잡한 CLI 명령 없이, 직관적인 UI를 통해 버튼 클릭만으로 고화질 영상과 채팅 자막을 손쉽게 소장한다.

---

### 2. Functional Requirements (핵심 기능 명세)

#### 2.1 URL 입력 및 파싱
- **유효성 검사:** 치지직 VOD(`https://chzzk.naver.com/video/...`) 및 라이브 URL 입력 시 형식 유효성을 검사합니다.
- **메타데이터 추출:** 
    - 영상 번호, 제목, 스트리머 정보, 썸네일 URL을 추출합니다.
    - 치지직 내부 API를 호출하여 해상도 목록(1080p, 720p 등) 및 비트레이트 정보를 획득합니다.
    - **채팅 데이터:** VOD의 경우 방송 시작 시간(`publishDateAt`)과 각 채팅의 `playerMessageTime`(오프셋)을 가져옵니다.

#### 2.2 다운로드 옵션
- **해상도 선택:** 사용자가 원하는 최고 화질부터 저화질까지 선택 가능한 UI를 제공합니다.
- **포맷:** 기본적으로 `mp4` 컨테이너로 저장하며, 필요한 경우 `ts` 포맷을 지원합니다.
- **채팅 자막:** `JSON` (raw data) 및 `ASS` (영상 플레이어용 자막) 포맷 선택 기능을 제공합니다.

#### 2.3 다운로드 프로세스
- **엔진 분기:** 
    - **VOD:** `ffmpeg`를 직접 사용하여 HLS 스트림을 다운로드하거나, 필요한 경우 `yt-dlp` 연동을 고려합니다.
    - **라이브:** `streamlink`를 통해 실시간 스트림을 캡처합니다.
- **FFmpeg 연동:** 영상과 오디오 세그먼트를 무손실로 병합(`copy` 코덱)하여 최종 `mp4` 파일을 생성합니다.
- **진행률(Progress) 표시:** 
    - `ffmpeg` 또는 `streamlink`의 표준 출력(stdout)을 실시간으로 파싱합니다.
    - `(현재 다운로드량 / 전체 예상 용량)` 또는 시간 기반으로 퍼센트를 계산하여 UI의 프로그레스 바에 반영합니다.

#### 2.4 채팅 자막 동기화 (Sync logic)
- **기준점:** 영상의 시작점을 0ms로 잡습니다.
- **계산식:** 각 채팅의 `playerMessageTime` 값을 절대적인 타임코드로 사용하여 자막을 배치합니다.
- **필터링:** 싱크 정확도를 위해 `playerMessageTime`이 없는 채팅 데이터는 제외합니다.

#### 2.5 파일 관리
- **저장 경로:** 사용자가 설정한 기본 다운로드 폴더(`C:\Downloads\Chzzk` 등)에 저장합니다.
- **자동 명명:** `{영상제목}_{날짜}.mp4` 형식으로 파일 이름을 자동 생성(치환자 지원)합니다.
- **편의 기능:** 다운로드 완료 후 '폴더 열기' 및 '파일 재생' 기능을 제공합니다.

---

### 3. Technical Constraints & Architecture (기술적 제약 사항)

#### 3.1 Core Stack
- **Framework:** Electron (Main process) + Next.js (Renderer process)
- **Language:** TypeScript
- **State Management:** Zustand (클라이언트 사이드 상태 및 설정 영속화)
- **UI:** React, Tailwind CSS, Lucide Icons, Shadcn UI

#### 3.2 Routing & Environment
- **Routing:** 배포 환경의 `file://` 프로토콜 호환성을 위해 **HashRouter** 스타일(Next.js의 경우 정적 익스포트 및 경로 처리)을 준수합니다.
- **Build Tool:** `electron-builder`를 사용하여 `NSIS Installer`와 `Portable` 버전을 동시 생성합니다.

#### 3.3 External Binaries (외부 프로그램)
- **Bundling:** `ffmpeg.exe`는 `ffmpeg-static`을 통해 앱 데이터 폴더가 아닌 **앱 패키지 내부에 내장(Bundled)**하여 배포합니다.
- **Path Resolution:** 
    - `app.isPackaged` 여부에 따라 바이너리 실행 경로를 동적으로 결정합니다.
    - 개발 시: `node_modules` 내부 경로 사용.
    - 배포 시: `process.resourcesPath` (또는 `extraResources`) 경로 사용.

#### 3.4 IPC Communication
- **Main:** 시스템 리소스 접근, 프로세스 실행(`spawn`), 파일 시스템 조작, 네이버 쿠키 관리.
- **Renderer:** 사용자 인터랙션 처리, Zustand 저장소 인터페이스, 실시간 진행 상황 감시.

---

### 4. Known Issues & Solutions (해결된 문제들)

- **자막 싱크 밀림 (27초 이슈):** 첫 채팅 시간을 기준으로 `startTs`를 보정하던 로직을 제거하고, `playerMessageTime`을 절대 오프셋으로 사용하여 해결했습니다.
- **배포판 FFmpeg 누락:** 동적 다운로드 방식의 불안정성을 제거하기 위해 다시 패키지 내에 직접 포함(Re-bundling)하도록 변경했습니다.
- **파일 이름 특수문자:** Windows 시스템에서 금지된 문자(`<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*`)를 언더바(`_`) 또는 공백으로 치환하는 샌니타이징 로직을 적용했습니다.
- **이미지 로딩:** 외부 URL 썸네일 로딩 시 보안 정책(CSP) 이슈를 방지하기 위해 Electron의 `session` 설정을 조정하거나 로컬 프록시를 사용합니다.

---

**Last Updated:** 2026-01-27
**Status:** Active Development (v1.0.16)
