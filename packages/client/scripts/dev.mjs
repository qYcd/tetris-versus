/**
 * 客户端开发启动器：同时拉起 Vite 与 Electron。
 * 不依赖 concurrently；直接 spawn Electron 二进制，避免 app 为 undefined。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '../..');

function resolveFile(pkgName, relPath) {
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`, {
      paths: [clientRoot, repoRoot],
    });
    return path.join(path.dirname(pkgJson), relPath);
  } catch (err) {
    console.error(`[dev] 找不到依赖 ${pkgName}，请先在仓库根目录执行: npm install`);
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }
}

const viteBin = resolveFile('vite', 'bin/vite.js');
const waitOnBin = resolveFile('wait-on', 'bin/wait-on');

// 从 Node 侧 require('electron') 得到的是 Electron 可执行文件路径
let electronBinary;
try {
  electronBinary = require('electron');
} catch (err) {
  console.error('[dev] 找不到 electron，请先执行: npm install');
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
}
if (typeof electronBinary !== 'string' || !electronBinary) {
  console.error('[dev] electron 模块解析异常，请重装: npm install electron@35.7.5');
  process.exit(1);
}

const children = [];

/** 清理环境中会破坏 Electron 的变量 */
function electronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}

function runNodeScript(scriptPath, args, name) {
  const child = spawn(process.execPath, [scriptPath, ...args], {
    cwd: clientRoot,
    env: process.env,
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev] ${name} exited by signal ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function runElectron() {
  console.log('[dev] starting Electron ...');
  const child = spawn(electronBinary, ['.'], {
    cwd: clientRoot,
    env: electronEnv(),
    stdio: 'inherit',
  });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[dev] electron exited by signal ${signal}`);
      shutdown(0);
      return;
    }
    if (code && code !== 0) {
      console.error(`[dev] electron exited with code ${code}`);
      shutdown(code);
      return;
    }
    shutdown(0);
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
  setTimeout(() => process.exit(code), 200).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] starting Vite on http://127.0.0.1:5173 ...');
runNodeScript(viteBin, ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], 'vite');

const wait = spawn(process.execPath, [waitOnBin, 'tcp:127.0.0.1:5173'], {
  cwd: clientRoot,
  env: process.env,
  stdio: 'inherit',
});
children.push(wait);

wait.on('exit', (code) => {
  if (code !== 0) {
    console.error('[dev] wait-on failed，Vite 可能未启动成功');
    shutdown(code || 1);
    return;
  }
  runElectron();
});
