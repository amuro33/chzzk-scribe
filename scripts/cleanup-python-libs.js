const fs = require('fs');
const path = require('path');

const libPath = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'python', 'Lib');
const sitePackagesPath = path.join(libPath, 'site-packages');

// 삭제할 대용량 패키지들 (faster-whisper에서 사용 안 함)
const packagesToRemove = [
  'torch',
  'torchvision', 
  'torchaudio',
  'torchgen',
  'torio',
  'sympy',
  'mpmath',
  'networkx',
  'PIL',  // Pillow
  'jupyter',
  'notebook',
  'IPython',
  'matplotlib',
  'pandas',
  'scipy'
];

// 삭제할 표준 라이브러리 폴더
const stdLibToRemove = [
  'test',
  'idlelib',
  'tkinter',
  'turtledemo',
  'unittest'
];

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    const sizeBefore = getDirectorySize(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✓ Removed ${path.basename(dir)} (${(sizeBefore / 1024 / 1024).toFixed(2)} MB)`);
  }
}

function getDirectorySize(dir) {
  let size = 0;
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    });
  } catch (err) {
    // ignore
  }
  return size;
}

console.log('🧹 Cleaning up Python libraries...\n');

// site-packages 정리
console.log('📦 Removing unused packages from site-packages:');
packagesToRemove.forEach(pkg => {
  const pkgPath = path.join(sitePackagesPath, pkg);
  removeDir(pkgPath);
  
  // dist-info도 삭제
  const distInfoPattern = new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  try {
    const items = fs.readdirSync(sitePackagesPath);
    items.forEach(item => {
      if (item.match(distInfoPattern) && item.endsWith('.dist-info')) {
        removeDir(path.join(sitePackagesPath, item));
      }
    });
  } catch (err) {
    // ignore
  }
});

// 표준 라이브러리 정리
console.log('\n📚 Removing unused standard library modules:');
stdLibToRemove.forEach(lib => {
  removeDir(path.join(libPath, lib));
});

// __pycache__ 정리
console.log('\n🗑️  Removing __pycache__ directories...');
function removePycache(dir) {
  try {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      if (stats.isDirectory()) {
        if (item === '__pycache__') {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } else {
          removePycache(itemPath);
        }
      }
    });
  } catch (err) {
    // ignore
  }
}
removePycache(libPath);
console.log('✓ Removed all __pycache__ directories');

console.log('\n✨ Cleanup complete!');

// Python 환경 검증
const pythonExePath = path.join(__dirname, '..', 'bin', 'faster-whisper-env', 'python', 'python.exe');
const fasterWhisperPath = path.join(sitePackagesPath, 'faster_whisper');

console.log('\n🔍 Verifying Python environment:');
if (fs.existsSync(pythonExePath)) {
  console.log('✓ python.exe found');
} else {
  console.error('✗ python.exe NOT found - 빌드 실패 가능!');
  process.exit(1);
}

if (fs.existsSync(fasterWhisperPath)) {
  console.log('✓ faster-whisper package found');
} else {
  console.error('✗ faster-whisper NOT found - 빌드 실패 가능!');
  process.exit(1);
}
