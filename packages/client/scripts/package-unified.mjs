/**
 * 打包统一版 Tetris Versus（mac / win）
 * 一个安装包：房主 / 加入 / 单人练习
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '../..');
const platform = (process.argv[2] || '').toLowerCase();
if (!['mac', 'win'].includes(platform)) {
  console.error('用法: node scripts/package-unified.mjs <mac|win>');
  process.exit(1);
}

function run(cmd, args, cwd = repoRoot) {
  console.log(`[package] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('npm', ['run', 'build', '-w', '@tetris/shared']);
const eng = spawnSync('npm', ['run', 'rebuild', '-w', '@tetris/engine-c'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (eng.status !== 0) {
  console.warn('[package] C engine rebuild failed, runtime may fallback to JS engine');
}
run('npm', ['run', 'build', '-w', '@tetris/client']);

const electronBuilder = path.join(repoRoot, 'node_modules', '.bin', 'electron-builder');
const args =
  platform === 'mac'
    ? ['--mac', 'zip']
    : ['--win', 'portable', '--x64'];

const env = {
  ...process.env,
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
};

console.log(`[package] building unified Tetris Versus for ${platform} ...`);
const r = spawnSync(electronBuilder, args, {
  cwd: clientRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status || 1);
console.log(`[package] done => ${path.join(clientRoot, 'release', 'unified')}`);
