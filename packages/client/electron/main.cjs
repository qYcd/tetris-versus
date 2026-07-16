/**
 * Electron 主进程：创建跨平台应用窗口，加载 Vite 开发服或打包后的页面。
 */
const electron = require('electron');
const path = require('path');

// 若被 Node 直接执行，require('electron') 会返回二进制路径字符串
if (typeof electron === 'string' || !electron.app) {
  console.error(
    '[electron] 主进程启动异常：请使用 Electron 运行，而不是 node。\n' +
      '正确命令：npm run dev:client  或  npx electron .',
  );
  process.exit(1);
}

const { app, BrowserWindow, shell } = electron;
const isDev = !app.isPackaged;

/**
 * 创建主窗口。
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#070b16',
    title: 'Tetris Versus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 外链用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
