# Chzzk Scribe (치지직 스크라이브)

치지직(Chzzk) VOD 및 채팅 데이터를 손쉽게 다운로드하고 관리할 수 있는 강력한 데스크탑 어플리케이션입니다.

<p align="center">
  <img src="public/readme_preview.png" width="600" alt="Preview Image" />
</p>

## ✨ 주요 기능

- **VOD 다운로드**: 치지직의 고화질 VOD를 빠른 속도로 다운로드할 수 있습니다. (Streamlink 및 yt-dlp 지원)
- **채팅 자막 변환**: 채팅 내역을 추출하여 실제 방송 화면의 오버레이처럼 보이는 **ASS 자막**으로 변환합니다.

## 🚀 빠른 시작

### 설치 방법
1. 프로젝트를 클론합니다.
   ```bash
   git clone https://github.com/amuro33/chzzk-scribe.git
   ```
2. 의존성 패키지를 설치합니다.
   ```bash
   npm install
   ```
3. 개발 모드로 실행합니다.
   ```bash
   npm run dev
   ```

## 🛠 기술 스택
- **Framework**: Next.js, Electron
- **UI**: Tailwind CSS, Shadcn UI
- **Engine**: Streamlink, yt-dlp, FFmpeg

## 🔒 보안 및 개인정보 보호

Chzzk Scribe는 사용자의 보안과 개인정보를 최우선으로 생각하며, 다음과 같은 원칙을 준수합니다.

- **데이터 투명성**: 모든 네트워크 통신은 치지직 및 네이버 공식 도메인(`*.naver.com`, `*.pstatic.net` 등)으로만 한정됩니다. 사용자의 데이터를 외부 서버로 전송하지 않습니다.
- **안전한 저장**: 네이버 로그인 세션 정보는 **Electron safeStorage API**를 사용하여 OS 수준에서 암호화되어 로컬에 저장됩니다.
- **프로세스 제어**: `yt-dlp`, `streamlink` 등 영상 다운로드에 필수적인 외부 도구만을 제어하며, 시스템에 무해한 안전한 API(`shell.openPath` 등)를 사용합니다.

상세한 내부 구조 및 동작 원리는 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고해 주세요.

## 📝 라이선스
이 프로젝트는 **MIT License**에 따라 자유롭게 이용, 수정 및 배포가 가능합니다. AI와 함께 만들어진 프로젝트인 만큼 누구나 편하게 사용하고 발전시켜 나갈 수 있습니다.
