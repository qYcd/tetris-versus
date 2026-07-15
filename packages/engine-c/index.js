/**
 * C 语言对战引擎的 Node 绑定入口。
 * 课设核心逻辑在 native C 中，服务端仅做网络与调度。
 */
'use strict';

const path = require('path');
const bindingPath = path.join(__dirname, 'build', 'Release', 'tetris_engine.node');
let binding;
try {
  binding = require(bindingPath);
} catch (err) {
  // 兼容 Debug 产物
  try {
    binding = require(path.join(__dirname, 'build', 'Debug', 'tetris_engine.node'));
  } catch (err2) {
    const e = new Error(
      '无法加载 C 引擎原生模块，请先在 packages/engine-c 执行: npm run rebuild\n' +
        String(err2 && err2.message ? err2.message : err2),
    );
    e.cause = err2;
    throw e;
  }
}

module.exports = binding;
