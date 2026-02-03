import sys
import os
import argparse
import time
import io
import json

# Force UTF-8 encoding for stdout and stderr
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# HuggingFace Hub 경고 숨기기
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
# 인증 없이 사용 (일반 사용자용)
import warnings
warnings.filterwarnings('ignore', category=UserWarning, module='huggingface_hub')

# 의존성 확인
try:
    from faster_whisper import WhisperModel
    import torch
except ImportError as e:
    print(f"Error: Required library not found: {e}", file=sys.stderr)
    print("Please install: pip install faster-whisper torch", file=sys.stderr)
    sys.exit(1)

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"

def log_message(message, level="INFO"):
    """로그 메시지를 구조화된 JSON 형식으로 출력"""
    log_data = {
        "type": "log",
        "level": level,
        "message": message,
        "timestamp": time.time()
    }
    print(json.dumps(log_data, ensure_ascii=False), flush=True)

def log_progress(progress, stage="transcribing"):
    """진행률을 JSON 형식으로 출력 (0-1 범위)"""
    progress_data = {
        "type": "progress",
        "stage": stage,
        "progress": min(max(progress, 0.0), 1.0)  # 0-1 범위로 정규화
    }
    print(json.dumps(progress_data, ensure_ascii=False), flush=True)

def detect_gpu():
    """NVIDIA GPU 감지 - 배포 환경 안전성 우선"""
    import sys
    
    # 상세 디버깅 정보 출력
    sys.stderr.write("=" * 60 + "\n")
    sys.stderr.write("🔍 GPU 감지 디버깅 시작\n")
    sys.stderr.write("=" * 60 + "\n")
    sys.stderr.write(f"PyTorch 버전: {torch.__version__}\n")
    
    # CPU 버전인지 먼저 체크
    is_cpu_only = '+cpu' in torch.__version__
    if is_cpu_only:
        sys.stderr.write("⚠️ ⚠️ ⚠️ PyTorch CPU 버전이 설치되어 있습니다! ⚠️ ⚠️ ⚠️\n")
        sys.stderr.write("GPU를 사용하려면 GPU 버전으로 재설치해야 합니다.\n")
        sys.stderr.write("설정 화면에서 엔진을 삭제 후 GPU 버전으로 다시 설치하세요.\n")
    
    sys.stderr.write(f"CUDA 빌드 포함 여부: {torch.cuda.is_available()}\n")
    
    try:
        if hasattr(torch.version, 'cuda') and torch.version.cuda:
            sys.stderr.write(f"PyTorch CUDA 버전: {torch.version.cuda}\n")
        else:
            sys.stderr.write("⚠️ PyTorch가 CPU 전용 버전으로 설치되었습니다!\n")
    except:
        pass
    
    try:
        cuda_available = torch.cuda.is_available()
        sys.stderr.write(f"CUDA 사용 가능: {cuda_available}\n")
        
        if cuda_available and not is_cpu_only:
            device_count = torch.cuda.device_count()
            sys.stderr.write(f"감지된 GPU 개수: {device_count}\n")
            
            for i in range(device_count):
                device_name = torch.cuda.get_device_name(i)
                sys.stderr.write(f"GPU {i}: {device_name}\n")
            
            sys.stderr.write("=" * 60 + "\n")
            log_message(f"✓ NVIDIA GPU 감지: {torch.cuda.get_device_name(0)}", "INFO")
            return True, torch.cuda.get_device_name(0)
        else:
            if is_cpu_only:
                sys.stderr.write("❌ PyTorch CPU 버전이 설치되어 GPU를 사용할 수 없습니다.\n")
            else:
                sys.stderr.write("⚠️ CUDA가 사용 불가능합니다.\n")
                sys.stderr.write("가능한 원인:\n")
                sys.stderr.write("  1. PyTorch가 CPU 버전으로 설치됨 (가장 흔함)\n")
                sys.stderr.write("  2. NVIDIA 드라이버가 설치되지 않음\n")
                sys.stderr.write("  3. CUDA Toolkit 미설치\n")
            sys.stderr.write("=" * 60 + "\n")
            log_message("⚠️ GPU 없음 - CPU 모드로 실행합니다.", "WARNING")
            return False, None
    except Exception as e:
        sys.stderr.write(f"❌ GPU 체크 중 오류 발생: {e}\n")
        sys.stderr.write("=" * 60 + "\n")
        log_message(f"GPU 체크 실패 ({e}) - CPU로 안전 실행", "WARNING")
        return False, None

def main():
    parser = argparse.ArgumentParser(description="Faster-Whisper Transcription Wrapper")
    parser.add_argument("--input", required=True, help="Input media file path")
    parser.add_argument("--model", required=True, help="Model path (e.g., /path/to/small-ct2)")
    parser.add_argument("--device", default="auto", help="Device to use (cuda, cpu, auto)")
    parser.add_argument("--output_dir", required=True, help="Directory to save the SRT file")
    parser.add_argument("--language", default="auto", help="Language code (auto, ko, en, ja, etc.)")
    
    args = parser.parse_args()

    # 즉시 시작 신호 전송
    log_progress(0.0, "starting")
    
    input_file = args.input
    model_path = args.model
    output_dir = args.output_dir
    language = args.language if args.language != "auto" else None

    log_message(f"작업 시작: {os.path.basename(input_file)}")
    log_message(f"모델 경로: {model_path}")
    log_progress(0.02, "initializing")

    # 1. Device Selection Logic (배포 환경 안전성 우선)
    gpu_available, gpu_name = detect_gpu()
    
    if args.device == "auto":
        # 자동 감지 모드 (권장)
        if gpu_available:
            device = "cuda"
            compute_type = "float16"  # NVIDIA GPU 최적화
            log_message(f"🚀 GPU 가속 활성화: {gpu_name}")
        else:
            device = "cpu"
            compute_type = "int8"  # CPU 부하 최소화 (필수)
            log_message("💻 CPU 모드 (안정성 우선)")
    elif args.device == "cuda":
        if gpu_available:
            device = "cuda"
            compute_type = "float16"
            log_message(f"사용자 지정: GPU 모드 ({gpu_name})")
        else:
            log_message("⚠️ GPU가 없어 CPU로 대체합니다.", "WARNING")
            device = "cpu"
            compute_type = "int8"
    else:
        device = "cpu"
        compute_type = "int8"
        log_message("사용자 지정: CPU 모드")

    # 2. Load Model
    log_message("🔄 모델 로딩 중...")
    log_progress(0.05, "loading_model")  # 5% - 모델 로딩 시작
    
    try:
        model = WhisperModel(model_path, device=device, compute_type=compute_type)
        log_message("✅ 모델 로딩 완료")
        log_progress(0.1, "model_loaded")  # 10% - 모델 로딩 완료
    except Exception as e:
        log_message(f"❌ 모델 로딩 실패 ({device}): {e}", "ERROR")
        
        # CUDA 실패 시 CPU로 폴백
        if device == "cuda":
            log_message("⚠️ CPU 모드로 재시도...", "WARNING")
            device = "cpu"
            compute_type = "int8"
            try:
                model = WhisperModel(model_path, device=device, compute_type=compute_type)
                log_message("✅ CPU 모드로 모델 로딩 성공")
                log_progress(0.1, "model_loaded")
            except Exception as e2:
                log_message(f"❌ CPU 모드에서도 실패: {e2}", "ERROR")
                sys.exit(1)
        else:
            sys.exit(1)

    # 3. Transcribe
    log_message(f"🎙️ 음성 인식 시작...")
    log_progress(0.15, "preparing")  # 15% - 준비 중
    
    # 언어 감지
    if not language:
        log_message("언어 자동 감지 중...")
    
    # 치지직 스트리밍 방송 최적화 설정
    initial_prompt = "이 영상은 한국어 게임 방송 및 스트리밍 콘텐츠입니다."
    
    log_message("🔍 영상 분석 중... (첫 세그먼트가 나올 때까지 시간이 걸릴 수 있습니다)")
    log_progress(0.2, "analyzing")  # 20% - 분석 중
    
    # GPU 사용 시 cuDNN 에러 발생하면 CPU로 재시도
    transcribe_success = False
    segments = None
    info = None
    
    try:
        segments, info = model.transcribe(
            input_file,
            beam_size=5,
            language=language,
            vad_filter=True,  # 필수: 게임 소리/배경음악 구간 제거
            vad_parameters=dict(
                min_silence_duration_ms=500,  # 0.5초 이상 무음만 제거
                threshold=0.5  # VAD 민감도
            ),
            word_timestamps=True,  # 단어 단위 타임스탬프로 정확한 시작/종료 시점 감지
            initial_prompt=initial_prompt,  # 한국어 인식률 향상 (콜드 스타트 방지)
            condition_on_previous_text=True  # 문맥 유지
        )
        transcribe_success = True
    except Exception as transcribe_error:
        error_msg = str(transcribe_error)
        log_message(f"❌ 음성 인식 실패 ({device}): {error_msg}", "ERROR")
        
        # cuDNN 에러 또는 CUDA 에러 시 CPU로 재시도
        if device == "cuda" and ("cudnn" in error_msg.lower() or "cuda" in error_msg.lower()):
            log_message("⚠️ GPU 실행 실패 - CPU 모드로 재시도 중...", "WARNING")
            log_progress(0.05, "loading_model")
            
            try:
                # CPU 모드로 모델 재로딩
                device = "cpu"
                compute_type = "int8"
                model = WhisperModel(model_path, device=device, compute_type=compute_type)
                log_message("✅ CPU 모드로 모델 재로딩 완료")
                log_progress(0.15, "preparing")
                
                # CPU로 다시 시도
                log_message("🔍 CPU로 영상 분석 중...")
                log_progress(0.2, "analyzing")
                
                segments, info = model.transcribe(
                    input_file,
                    beam_size=5,
                    language=language,
                    vad_filter=True,
                    vad_parameters=dict(
                        min_silence_duration_ms=500,
                        threshold=0.5
                    ),
                    word_timestamps=True,
                    initial_prompt=initial_prompt,
                    condition_on_previous_text=True
                )
                transcribe_success = True
                log_message("✅ CPU 모드로 음성 인식 성공")
            except Exception as cpu_error:
                log_message(f"❌ CPU 모드에서도 실패: {cpu_error}", "ERROR")
                error_result = {
                    "type": "result",
                    "success": False,
                    "error": f"CPU/GPU 모두 실패: {cpu_error}"
                }
                print(json.dumps(error_result, ensure_ascii=False), flush=True)
                sys.exit(1)
        else:
            # 다른 에러는 즉시 실패
            error_result = {
                "type": "result",
                "success": False,
                "error": str(transcribe_error)
            }
            print(json.dumps(error_result, ensure_ascii=False), flush=True)
            sys.exit(1)
    
    if not transcribe_success or segments is None or info is None:
        log_message("❌ 음성 인식 실패", "ERROR")
        sys.exit(1)
    
    try:
        
        log_progress(0.22, "analyzing")  # 22% - 모델 준비 완료
        log_message(f"✅ 언어 감지: {info.language} (확률: {info.language_probability:.2f})")
        
        total_duration = info.duration
        log_message(f"📊 전체 길이: {total_duration:.1f}초")
        log_progress(0.25, "transcribing")  # 25% - 변환 시작
        log_message("📝 자막 파일 생성 중... (첫 번째 세그먼트 처리 중)")
        
        # 출력 파일 경로
        base_name = os.path.splitext(os.path.basename(input_file))[0]
        srt_path = os.path.join(output_dir, f"{base_name}.srt")
        
        # SRT 파일 생성
        segment_count = 0
        last_reported_percent = 25  # 25%부터 시작
        first_segment = True
        
        with open(srt_path, "w", encoding="utf-8") as srt_file:
            for i, segment in enumerate(segments, start=1):
                # 첫 번째 세그먼트를 받았을 때 알림
                if first_segment:
                    log_message("✅ 첫 번째 세그먼트 처리 완료, 나머지 처리 중...")
                    log_progress(0.28, "transcribing")
                    first_segment = False
                # word_timestamps를 활용해 실제 첫/마지막 단어 시점 사용
                if hasattr(segment, 'words') and segment.words and len(segment.words) > 0:
                    start_time = format_timestamp(segment.words[0].start)
                    end_time = format_timestamp(segment.words[-1].end)
                else:
                    start_time = format_timestamp(segment.start)
                    end_time = format_timestamp(segment.end)
                
                text = segment.text.strip()
                
                srt_file.write(f"{i}\n{start_time} --> {end_time}\n{text}\n\n")
                
                segment_count += 1
                
                # 진행률 업데이트 (25%~95% 범위 사용)
                if total_duration > 0:
                    # 25%부터 95%까지 매핑
                    raw_progress = segment.end / total_duration
                    current_progress = 0.25 + (raw_progress * 0.70)  # 25% + (0~100% * 70%) = 25~95%
                    current_percent = int(current_progress * 100)
                    
                    # 2% 이상 변화했거나 매 3개 세그먼트마다 업데이트 (더 자주)
                    if (current_percent >= last_reported_percent + 2) or (segment_count % 3 == 0):
                        log_progress(current_progress, "transcribing")
                        last_reported_percent = current_percent

        log_message(f"✅ 자막 파일 생성 완료: {srt_path}")
        log_message(f"📊 총 {segment_count}개 세그먼트 처리됨")
        log_progress(1.0, "completed")  # 100% 완료
        
        # 성공 결과 출력
        result = {
            "type": "result",
            "success": True,
            "output_path": srt_path,
            "duration": total_duration,
            "language": info.language
        }
        print(json.dumps(result, ensure_ascii=False), flush=True)

    except Exception as e:
        log_message(f"음성 인식 실패: {e}", "ERROR")
        error_result = {
            "type": "result",
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False), flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
