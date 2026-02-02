const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');

const PYTHON_ENV_DIR = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'python');
const GET_PIP_PATH = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'get-pip.py');
const PYTHON_VERSION = '3.10.11';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 리다이렉트 처리
        https.get(response.headers.location, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

function extractZip(zipPath, destDir) {
  // Windows 내장 PowerShell 사용
  const command = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
  execSync(command, { stdio: 'inherit' });
}

async function setupPythonEnvironment() {
  console.log('🐍 Python 환경 설정 중...');
  
  // Python 환경이 이미 있는지 확인
  if (fs.existsSync(PYTHON_ENV_DIR) && fs.existsSync(path.join(PYTHON_ENV_DIR, 'python.exe'))) {
    console.log('✅ Python 환경이 이미 존재합니다.');
    return;
  }

  console.log('⚠️  Python 환경이 없습니다.');
  console.log(`📥 Python ${PYTHON_VERSION} embeddable 다운로드 중...`);
  
  const binDir = path.join(__dirname, '..', 'bin', 'faster-whisper-env');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }
  
  const zipPath = path.join(binDir, 'python-embed.zip');
  
  try {
    // Python embeddable 다운로드
    await downloadFile(PYTHON_URL, zipPath);
    console.log('✅ 다운로드 완료');
    
    // 압축 해제
    console.log('📦 압축 해제 중...');
    if (!fs.existsSync(PYTHON_ENV_DIR)) {
      fs.mkdirSync(PYTHON_ENV_DIR, { recursive: true });
    }
    extractZip(zipPath, PYTHON_ENV_DIR);
    console.log('✅ 압축 해제 완료');
    
    // zip 파일 삭제
    fs.unlinkSync(zipPath);
    
    // Python._pth 파일 수정 (site-packages 활성화)
    const pthFiles = fs.readdirSync(PYTHON_ENV_DIR).filter(f => f.endsWith('._pth'));
    if (pthFiles.length > 0) {
      const pthPath = path.join(PYTHON_ENV_DIR, pthFiles[0]);
      let content = fs.readFileSync(pthPath, 'utf-8');
      content = content.replace('#import site', 'import site');
      if (!content.includes('import site')) {
        content += '\nimport site\n';
      }
      fs.writeFileSync(pthPath, content);
      console.log('✅ Python 경로 설정 완료');
    }
    
    // pip 설치
    console.log('📦 pip 설치 중...');
    const pythonExe = path.join(PYTHON_ENV_DIR, 'python.exe');
    execSync(`"${pythonExe}" "${GET_PIP_PATH}"`, { stdio: 'inherit' });
    console.log('✅ pip 설치 완료');
    
    console.log('');
    console.log('✨ Python 환경 설정 완료!');
    console.log('💡 프로그램을 실행하면 PyTorch와 Faster-Whisper가 자동으로 설치됩니다.');
    
  } catch (error) {
    console.error('❌ Python 환경 설정 실패:', error.message);
    console.log('');
    console.log('📝 수동 설치 방법:');
    console.log(`   1. ${PYTHON_URL} 다운로드`);
    console.log(`   2. bin/faster-whisper-env/python/ 디렉토리에 압축 해제`);
    console.log('   3. get-pip.py로 pip 설치');
    throw error;
  }
}

try {
  setupPythonEnvironment();
} catch (error) {
  console.error('❌ 에러:', error.message);
  process.exit(1);
}
