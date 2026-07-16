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
/** @type {{ close: Function, port: number, engineKind: string, engineVersion: string } | null} */
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
 * 按需启动内嵌服务端（房主模式）。
 * @param {{ durationMs?: number }} [opts]
 */
async function ensureHostServer(opts = {}) {
  if (embedded) return embedded;
  try {
    const startEmbeddedServer = loadStartEmbeddedServer();
    embedded = await startEmbeddedServer({
      port: DEFAULT_PORT,
      host: '0.0.0.0',
      durationMs: opts.durationMs,
    });
    return embedded;
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      embedded = {
        port: DEFAULT_PORT,
        engineKind: 'external',
        engineVersion: 'reused-port',
        close: async () => {},
      };
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
    if (embedded && typeof embedded.close === 'function') {
      await embedded.close();
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
  if (embedded && typeof embedded.close === 'function') {
    embedded.close();
    embedded = null;
  }
});
