/**
 * 打包 Host / Client 两个应用（mac / win）。
 * 用法: node scripts/package-app.mjs <host|client> <mac|win>
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '../..');

const mode = (process.argv[2] || '').toLowerCase();
const platform = (process.argv[3] || '').toLowerCase();
if (!['host', 'client'].includes(mode) || !['mac', 'win'].includes(platform)) {
  console.error('用法: node scripts/package-app.mjs <host|client> <mac|win>');
  process.exit(1);
}

const productName = mode === 'host' ? 'Tetris Versus Host' : 'Tetris Versus Client';
const appId = mode === 'host' ? 'com.qycd.tetrisversus.host' : 'com.qycd.tetrisversus.client';
const outDir = path.join(clientRoot, 'release', mode);

// 写入模式文件，供主进程在打包后读取
const modeFile = path.join(clientRoot, 'electron', 'app-mode.json');
fs.writeFileSync(modeFile, JSON.stringify({ mode }, null, 2));

// 确保 shared 与前端已构建
function run(cmd, args, cwd = repoRoot, env = process.env) {
  console.log(`[package] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('npm', ['run', 'build', '-w', '@tetris/shared']);
// 引擎编译失败不阻断（Windows 交叉可用 JS fallback）
const eng = spawnSync('npm', ['run', 'rebuild', '-w', '@tetris/engine-c'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (eng.status !== 0) {
  console.warn('[package] C engine rebuild failed, host will use JS fallback if needed');
}
run('npm', ['run', 'build', '-w', '@tetris/client']);

const electronBuilder = path.join(repoRoot, 'node_modules', '.bin', 'electron-builder');
const args = [
  platform === 'mac' ? '--mac' : '--win',
  ...(platform === 'win' ? ['portable', 'nsis', '--x64'] : ['dmg', 'zip']),
  `--config.productName=${productName}`,
  `--config.appId=${appId}`,
  `--config.directories.output=${outDir}`,
  `--config.extraMetadata.productName=${productName}`,
];

const env = {
  ...process.env,
  TETRIS_APP_MODE: mode,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

console.log(`[package] building ${productName} for ${platform} ...`);
const r = spawnSync(electronBuilder, args, {
  cwd: clientRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status || 1);

console.log(`[package] done => ${outDir}`);
