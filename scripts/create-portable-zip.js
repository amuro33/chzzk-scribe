const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const packageJson = require('../package.json');
const version = packageJson.version;

const source = path.join(__dirname, '..', 'dist_electron', 'win-unpacked');
const output = path.join(__dirname, '..', 'dist_electron', `chzzk-scribe ${version} Portable.zip`);

if (!fs.existsSync(source)) {
    console.error('❌ win-unpacked 폴더를 찾을 수 없습니다.');
    process.exit(1);
}

console.log(`📦 포터블 ZIP 생성 중... (${version})`);

const outputStream = fs.createWriteStream(output);
const archive = archiver('zip', {
    zlib: { level: 9 }
});

outputStream.on('close', () => {
    const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log(`✅ 포터블 ZIP 생성 완료: ${path.basename(output)} (${sizeInMB} MB)`);
});

archive.on('error', (err) => {
    console.error('❌ ZIP 생성 오류:', err);
    process.exit(1);
});

archive.pipe(outputStream);
archive.directory(source, false);
archive.finalize();
