# Python 환경 설정 가이드

## 개발 환경 설정

이 프로젝트는 Whisper 음성인식을 위해 Python 환경이 필요합니다.

### 1. Python Embeddable 다운로드

1. [Python 공식 사이트](https://www.python.org/downloads/)에서 **Python 3.10+** embeddable 버전 다운로드
   - Windows: `python-3.10.x-embed-amd64.zip`

### 2. 압축 해제

```bash
# bin/faster-whisper-env/python/ 디렉토리에 압축 해제
# 예시 경로: bin/faster-whisper-env/python/python.exe
```

### 3. pip 설치

```bash
cd bin/faster-whisper-env
python/python.exe get-pip.py
```

### 4. 필요한 패키지 설치

```bash
# Python 경로를 pth 파일에 추가 (필요시)
cd python
echo import site >> python310._pth

# faster-whisper 설치
python.exe -m pip install faster-whisper
```

## 빌드 시 자동 포함

`electron-builder.json` 설정에 의해 빌드 시 `bin` 디렉토리 전체가 자동으로 포함됩니다.

```json
"extraResources": [
    {
        "from": "bin",
        "to": "bin",
        "filter": ["**/*"]
    }
]
```

## Git 관리

Python 환경 파일들은 `.gitignore`에 포함되어 Git 저장소에 업로드되지 않습니다:

```
/bin/faster-whisper-env/python/
```

## CI/CD 환경

CI/CD 파이프라인에서는 빌드 전에 Python 환경을 자동으로 설정하는 스크립트를 실행해야 합니다.

```bash
node scripts/setup-python-env.js
```

## 대안: 사전 빌드된 바이너리 배포

더 간단한 방법으로 사전에 구성된 Python 환경을 별도 저장소나 릴리즈에 업로드하고, 
빌드 시 다운로드하는 방식도 고려할 수 있습니다.

### GitHub Releases 활용 예시

```bash
# 빌드 스크립트에서
curl -L https://github.com/your-repo/python-env/releases/download/v1.0/python-env.zip -o python-env.zip
unzip python-env.zip -d bin/faster-whisper-env/
```
