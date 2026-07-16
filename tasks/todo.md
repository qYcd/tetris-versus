# 双人对战俄罗斯方块 - 开发计划

## 硬约束
- 俄罗斯方块**实现逻辑用 C 语言**（课设要求）
- 网络双机联网保留
- Electron/WebSocket 客户端与网络层可保留

## 架构
- `packages/engine-c`：纯 C 权威规则引擎 + Node-API 绑定
- `packages/server`：WebSocket 网络层（开发/独立调试）
- `packages/client`：统一 Electron 应用（房主 / 加入 / 单人）
- `packages/shared`：TS 协议类型与 JS 回退引擎

## 任务
- [x] C 引擎核心（7-bag / 旋转 / 单格重力级联 / 计分 / 对战状态机）
- [x] Node-API 绑定并编译出 `tetris_engine.node`
- [x] 服务端改为调用 C 引擎
- [x] C 引擎冒烟测试
- [x] 本机启动 server + 双连接联调
- [x] 客户端 Vite 构建验证
- [x] git 仓库初始化并首次提交
- [x] 推送到 GitHub
- [x] 统一应用：一个安装包内 房主/加入/单人
- [x] 打包 macOS + Windows 统一安装包
- [x] 更新 README（单包用法）

## Review
- 统一安装包输出：`packages/client/release/unified/`
  - mac: dmg / zip (arm64)
  - win: nsis / portable (x64)
- 房主模式内嵌 `electron/server-host.cjs`，优先 C 引擎，失败回退 JS
