/**
 * Electron 主进程：单一应用
 * 支持按需启动内嵌服务端（当房主），也可仅作为加入端/单人练习。
 */
const electron = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

if (typeof electron === 'string' || !electron.app) {
  console.error('[electron] 请使用 Electron 运行本应用（npm run dev:client / 安装包启动）');
  process.exit(1);
}

const { app, BrowserWindow, shell, ipcMain } = electron;
const { startEmbeddedServer } = require('./server-host.cjs');

const isDev = !app.isPackaged;
const DEFAULT_PORT = Number(process.env.PORT || 8787);

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null;
/** @type {{ close: Function, port: number, engineKind: string, engineVersion: string } | null} */
let embedded = null;

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
    // 开发时可选打开调试
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
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
 */
async function ensureHostServer() {
  if (embedded) return embedded;
  try {
    embedded = await startEmbeddedServer({ port: DEFAULT_PORT, host: '0.0.0.0' });
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
    throw err;
  }
}

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

ipcMain.handle('tetris:getBootstrap', async () => buildBootstrap());

ipcMain.handle('tetris:startHost', async () => {
  await ensureHostServer();
  return buildBootstrap();
});

ipcMain.handle('tetris:stopHost', async () => {
  if (embedded && typeof embedded.close === 'function') {
    await embedded.close();
  }
  embedded = null;
  return buildBootstrap();
});

app.whenReady().then(() => {
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
