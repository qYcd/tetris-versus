/**
 * Electron 主进程：单一应用
 * 支持按需启动内嵌服务端（当房主），也可仅作为加入端/单人练习。
 */
const electron = require('electron');
const path = require('path');
const os = require('os');

if (typeof electron === 'string' || !electron.app) {
  console.error('[electron] 请使用 Electron 运行本应用（npm run dev:client / 安装包启动）');
  process.exit(1);
}

const { app, BrowserWindow, shell, ipcMain } = electron;

const isDev = !app.isPackaged;
const DEFAULT_PORT = Number(process.env.PORT || 8787);

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {{ close: Function, port: number, engineKind: string, engineVersion: string, owned?: boolean } | null} */
let embedded = null;
/** IPC 是否已注册 */
let ipcRegistered = false;

/**
 * 获取局域网 IPv4。
 */
function getLanIPv4() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      const family = net.family;
      if ((family === 'IPv4' || family === 4) && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

/**
 * 延迟加载内嵌服务，避免主进程因 server-host 异常而无法注册 IPC。
 */
function loadStartEmbeddedServer() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const mod = require('./server-host.cjs');
  if (!mod || typeof mod.startEmbeddedServer !== 'function') {
    throw new Error('server-host.cjs 未导出 startEmbeddedServer');
  }
  return mod.startEmbeddedServer;
}

/**
 * 创建主窗口。
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#070b16',
    title: 'Tetris Versus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * 探测本机端口上是否已有可复用的对战服务。
 * @param {number} port
 * @returns {Promise<{ ok: boolean, engine?: string, version?: string }>}
 */
function probeLocalHostService(port) {
  return new Promise((resolve) => {
    const http = require('http');
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/health',
        timeout: 800,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (data && data.ok) {
              resolve({
                ok: true,
                engine: data.engine || data.service || 'external',
                version: data.version || 'reused-port',
              });
              return;
            }
          } catch {
            // ignore parse error
          }
          // 非 JSON 健康检查也视为可复用（独立 server 的 /health 也返回 ok）
          if (res.statusCode === 200) {
            resolve({ ok: true, engine: 'external', version: 'reused-port' });
            return;
          }
          resolve({ ok: false });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.on('error', () => resolve({ ok: false }));
  });
}

/**
 * 构造“复用已有端口服务”的 embedded 句柄（不负责关闭外部进程）。
 * @param {number} port
 * @param {{ engine?: string, version?: string }} [info]
 */
function makeReusedEmbedded(port, info = {}) {
  return {
    port,
    engineKind: info.engine || 'external',
    engineVersion: info.version || 'reused-port',
    // 复用外部进程时不可关闭对方服务
    owned: false,
    close: async () => {},
  };
}

/**
 * 按需启动内嵌服务端（房主模式）。
 * @param {{ durationMs?: number }} [opts]
 */
async function ensureHostServer(opts = {}) {
  if (embedded) return embedded;

  // 端口已有健康服务时直接复用，避免 listen 冲突弹窗
  const probed = await probeLocalHostService(DEFAULT_PORT);
  if (probed.ok) {
    embedded = makeReusedEmbedded(DEFAULT_PORT, probed);
    console.warn('[app] 检测到已有服务，复用端口', DEFAULT_PORT, probed);
    return embedded;
  }

  try {
    const startEmbeddedServer = loadStartEmbeddedServer();
    embedded = await startEmbeddedServer({
      port: DEFAULT_PORT,
      host: '0.0.0.0',
      durationMs: opts.durationMs,
    });
    // 本进程真正 listen 成功，离开房间时可关闭并释放端口
    embedded.owned = true;
    return embedded;
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      // 二次兜底：竞态下端口刚被占用，仍按复用处理
      const again = await probeLocalHostService(DEFAULT_PORT);
      embedded = makeReusedEmbedded(DEFAULT_PORT, again.ok ? again : {});
      console.warn('[app] 端口占用，复用已有服务', DEFAULT_PORT);
      return embedded;
    }
    console.error('[app] 启动内嵌服务失败:', err);
    throw err;
  }
}

/**
 * 组装前端 bootstrap 信息。
 */
function buildBootstrap() {
  const lanIp = getLanIPv4();
  const port = embedded?.port || DEFAULT_PORT;
  return {
    mode: 'unified',
    isDev,
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    host: {
      running: Boolean(embedded),
      owned: Boolean(embedded?.owned),
      port,
      lanIp,
      localWs: `ws://127.0.0.1:${port}`,
      lanWs: `ws://${lanIp}:${port}`,
      engineKind: embedded?.engineKind || null,
      engineVersion: embedded?.engineVersion || null,
    },
  };
}

/**
 * 注册 IPC（可重复调用，先 remove 再 handle，避免热重载/重复 ready）。
 */
function registerIpcHandlers() {
  const channels = ['tetris:getBootstrap', 'tetris:startHost', 'tetris:stopHost'];
  for (const ch of channels) {
    try {
      ipcMain.removeHandler(ch);
    } catch {
      // ignore
    }
  }

  ipcMain.handle('tetris:getBootstrap', async () => buildBootstrap());

  ipcMain.handle('tetris:startHost', async (_evt, opts = {}) => {
    await ensureHostServer({ durationMs: opts && opts.durationMs });
    return buildBootstrap();
  });

  ipcMain.handle('tetris:stopHost', async () => {
    // 仅关闭本进程自建的内嵌服务；复用外部 8787 时不杀对方进程
    if (embedded && embedded.owned && typeof embedded.close === 'function') {
      try {
        await embedded.close();
      } catch (err) {
        console.error('[app] 关闭内嵌服务失败:', err);
      }
    } else if (embedded && !embedded.owned) {
      console.warn('[app] 当前端口服务非本进程创建，stopHost 跳过关闭');
    }
    embedded = null;
    return buildBootstrap();
  });

  ipcRegistered = true;
  console.log('[app] IPC handlers registered:', channels.join(', '));
}

// 尽早注册，防止渲染进程 ready 后立刻 invoke 时无 handler
registerIpcHandlers();

app.whenReady().then(() => {
  // 再注册一次，确保 whenReady 后仍可用
  if (!ipcRegistered) registerIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // 退出应用时释放自建端口，避免 8787 残留
  if (embedded && embedded.owned && typeof embedded.close === 'function') {
    try {
      embedded.close();
    } catch {
      // ignore
    }
  }
  embedded = null;
});
