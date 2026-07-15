/**
 * 预加载脚本：向渲染进程暴露安全的环境信息。
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('tetrisApp', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
