const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PYTHON_ENV_DIR = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'python');
const GET_PIP_PATH = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'get-pip.py');

function setupPythonEnvironment() {
  console.log('🐍 Python 환경 설정 중...');
  
  // Python 환경이 이미 있는지 확인
  if (fs.existsSync(PYTHON_ENV_DIR)) {
    console.log('✅ Python 환경이 이미 존재합니다.');
    return;
  }

  console.log('⚠️  Python 환경이 없습니다.');
  console.log('📝 수동으로 Python embeddable을 설치해주세요:');
  console.log('   1. https://www.python.org/downloads/ 에서 Python 3.10+ embeddable 버전 다운로드');
  console.log('   2. bin/faster-whisper-env/python/ 디렉토리에 압축 해제');
  console.log('   3. get-pip.py로 pip 설치');
  console.log('   4. faster-whisper 등 필요한 패키지 설치');
  
  throw new Error('Python 환경이 설정되지 않았습니다.');
}

try {
  setupPythonEnvironment();
} catch (error) {
  console.error('❌ 에러:', error.message);
  process.exit(1);
}
