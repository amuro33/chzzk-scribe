# Chzzk Scribe (치지직 스크라이브)

치지직(Chzzk) VOD 및 채팅 데이터를 손쉽게 다운로드하고 관리할 수 있는 강력한 데스크탑 어플리케이션입니다.

<p align="center">
  <img src="public/readme_preview.png" width="600" alt="Preview Image" />
</p>

## ✨ 주요 기능

- **VOD 다운로드**: 치지직의 고화질 VOD를 빠른 속도로 다운로드할 수 있습니다. (Streamlink 및 yt-dlp 지원)
- **채팅 자막 변환**: 채팅 내역을 추출하여 실제 방송 화면의 오버레이처럼 보이는 **ASS 자막**으로 변환합니다.
- **VOD 필터링 및 탐색**: 스트리머별 최신/인기 VOD 필터링, 지난 방송 및 업로드 영상 구분을 지원합니다.
- **파일 최적화**: 자막 파일의 용량을 최적화하여 저용량으로도 고품질의 자막을 감상할 수 있습니다.
- **스트리머 관리**: 자주 찾는 스트리머를 즐겨찾기에 등록하고 활동을 한눈에 파악하세요.
- **섬네일 관리**: 다운로드 시 섬네일 이미지 저장 여부를 직접 선택할 수 있습니다.

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

## 📝 라이선스
이 프로젝트는 개인적인 용도로 제작되었으며, 상업적 이용을 금합니다.
