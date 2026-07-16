/**
 * 预加载：暴露统一应用能力（查询状态 / 启动房主服务）。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tetrisApp', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  getBootstrap: async () => ipcRenderer.invoke('tetris:getBootstrap'),
  startHost: async () => ipcRenderer.invoke('tetris:startHost'),
  stopHost: async () => ipcRenderer.invoke('tetris:stopHost'),
});
