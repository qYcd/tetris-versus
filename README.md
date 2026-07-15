# Tetris Versus

双人对战俄罗斯方块（跨平台客户端 + WebSocket 服务端 + **C 语言权威规则引擎**）。

> 仓库地址：https://github.com/qYcd/tetris-versus

## 项目简介

本项目实现 **双人联网积分对战**：

- 两台电脑（Windows / macOS）各自运行客户端
- 一台机器运行对战服务端
- **方块生成、移动旋转、锁定、消行、计分、胜负判定等核心规则全部由 C 引擎实现**
- Node 服务端只负责房间/匹配/网络同步
- Electron 客户端负责界面渲染与输入

### 规则亮点

| 项目 | 说明 |
|------|------|
| 活动方块 | 操控中的当前方块仍作为整体移动/旋转（含简化 SRS 踢墙） |
| 锁定后重力 | 固定格**不再保持方块整体**；列内有空隙则单格继续下落，直到触底或被挡 |
| 连锁 | 消行后再次施加单格重力，可形成连锁计分 |
| 生成器 | **7-bag 洗牌**（每 7 个覆盖 I/O/T/S/Z/J/L 各一次） |
| 胜负 | 一方顶出则另一人胜；或 **10 分钟**到时后比分高者胜 |
| Hold | 支持 Hold（`C`） |
| 预览 | Next 预览队列 |

## 技术架构

```text
┌──────────────────┐     WebSocket      ┌──────────────────────┐
│ Electron Client  │ ◄────────────────► │ Node.js Server       │
│ React + Vite     │   state / input    │ 房间 / 匹配 / 广播    │
└──────────────────┘                    └──────────┬───────────┘
                                                   │ Node-API
                                                   ▼
                                        ┌──────────────────────┐
                                        │ C Engine             │
                                        │ packages/engine-c    │
                                        │ 权威规则 / 对战状态机 │
                                        └──────────────────────┘
```

### Monorepo 结构

```text
packages/
  engine-c/     # C 权威规则引擎 + Node-API 绑定（课设核心）
  server/       # WebSocket 对战服务端（调用 C 引擎）
  client/       # Electron + React 跨平台客户端
  shared/       # 网络协议类型、前端共享常量/工具（TS）
```

| 包名 | 职责 | 关键入口 |
|------|------|----------|
| `@tetris/engine-c` | 纯 C 规则实现；`createMatch/update/input/getState` | `src/tetris_engine.c` |
| `@tetris/server` | 连接管理、房间、Ready、tick 广播 | `src/index.ts` `src/roomManager.ts` |
| `@tetris/client` | 大厅、对战 UI、键盘输入、状态渲染 | `src/App.tsx` |
| `@tetris/shared` | 消息编解码与类型定义 | `src/types.ts` `src/protocol.ts` |

## 核心实现说明

### 1. C 引擎（权威逻辑）

位置：`packages/engine-c/`

主要能力：

1. **7-bag**
   - 袋空时 Fisher–Yates 洗入 7 种方块
   - 维护 next 预览队列
2. **活动方块控制**
   - 左/右移、软降、硬降
   - 顺/逆时针旋转 + 简化踢墙
   - Hold 交换
3. **锁定与级联**
   - 锁定后执行列内单格重力 `te_apply_column_gravity`
   - 再消行，循环直到稳定（连锁）
4. **计分 / 等级**
   - 1/2/3/4 行基础分，连锁加成
   - 每 10 行升一级，等级越高重力越快
5. **对战状态机**
   - `waiting → countdown → playing → finished`
   - 顶死 / 超时 / 认输

Node 侧通过 N-API 调用：

```js
const eng = require('@tetris/engine-c')
const match = eng.createMatch(roomId, durationMs, seed)
match.addPlayer(name)
match.ready(playerId)
match.input(playerId, 'left', true)
match.update(50)
const state = match.getState()
```

### 2. 服务端（网络层）

位置：`packages/server/`

- 默认监听：`ws://0.0.0.0:8787`
- 健康检查：`GET /health`
- 协议消息：
  - 客户端 → 服务端：`join` / `ready` / `input` / `ping` / `leave`
  - 服务端 → 客户端：`welcome` / `state` / `info` / `error` / `pong`
- 逻辑 tick 默认 50ms，权威状态完全来自 C 引擎

### 3. 客户端（GUI）

位置：`packages/client/`

- Electron 桌面窗口（Windows / macOS）
- React 渲染双人棋盘、分数、等级、Hold/Next、倒计时
- 本机只控制“自己的”盘面输入，状态以服务端广播为准

#### 默认键位

| 操作 | 按键 |
|------|------|
| 左移 | `←` / `A` |
| 右移 | `→` / `D` |
| 软降 | `↓` / `S` |
| 硬降 | `Space` |
| 顺时针旋转 | `↑` / `W` / `X` |
| 逆时针旋转 | `Z` |
| Hold | `C` |

## 环境要求

- Node.js **>= 18**（推荐 20/24）
- npm >= 9
- macOS 编译 C 引擎需要 Xcode Command Line Tools
- Windows 编译 C 引擎需要对应构建工具链（VS Build Tools / windows-build-tools）

检查：

```bash
node -v
npm -v
```

## 快速开始（开发）

### 1. 安装依赖

```bash
git clone https://github.com/qYcd/tetris-versus.git
cd tetris-versus
npm install
```

`postinstall` 会构建 `@tetris/shared`。

### 2. 编译 C 引擎

```bash
npm run rebuild:engine
```

成功后应存在：

```text
packages/engine-c/build/Release/tetris_engine.node
```

### 3. 启动服务端

```bash
npm run dev:server
```

看到类似输出：

```text
[server] C engine: tetris-engine-c/0.1.0
[server] Tetris Versus listening on ws://0.0.0.0:8787
[server] authoritative rules engine = C (packages/engine-c)
```

### 4. 启动客户端

另开终端：

```bash
npm run dev:client
```

或仅网页预览：

```bash
npm run dev:client:web
# 浏览器打开 http://127.0.0.1:5173
```

### 5. 本机双开测试

1. 启动一个服务端
2. 打开两个客户端
3. 服务器地址填 `ws://127.0.0.1:8787`
4. 同房间号（或快速匹配）→ 双方 Ready

## 双机联网对战（Windows / macOS）

### 推荐部署

| 角色 | 机器 | 操作 |
|------|------|------|
| 服务端 | 有 Node 的电脑（常用 Mac 开发机） | `npm run dev:server` |
| 客户端 A | Windows 或 Mac | 运行客户端，连接服务端 IP |
| 客户端 B | Windows 或 Mac | 同上 |

### 步骤

1. **服务端开机并启动**

```bash
cd tetris-versus
npm install
npm run rebuild:engine
npm run dev:server
```

2. **查询服务端局域网 IP**

macOS:

```bash
ipconfig getifaddr en0
```

Windows:

```bat
ipconfig
```

假设得到 `192.168.1.8`。

3. **客户端连接**

大厅里服务器地址填写：

```text
ws://192.168.1.8:8787
```

注意：

- 两台电脑需同一局域网
- 不要给另一台机器填 `127.0.0.1`（那是对方自己）
- 如连不上，检查防火墙是否放行 **8787** 端口

4. **开局**

- 输入昵称
- 共用房间号，或一方快速匹配
- 双方点击 **Ready**
- 3 秒倒计时后开始，最长 10 分钟

## 打包发布

### 打 Windows 便携包（推荐发给同学）

在 macOS / 开发机执行：

```bash
npm run release:win:portable
```

产物：

```text
packages/client/release/Tetris Versus-0.1.0-portable.exe
```

特点：

- 约 70MB 级单文件
- 免安装，双击运行
- 适合 U 盘 / 网盘分发

也支持安装包目标：

```bash
npm run release:win
```

### 打 macOS 包

```bash
npm run release:mac
```

### 重要说明

1. **客户端 exe ≠ 完整对战**  
   仍需要单独运行服务端（C 引擎在服务端）。
2. 首次打包可能下载 Electron 二进制；项目脚本已配置国内镜像，降低失败概率。
3. `packages/client/release/` 默认被 `.gitignore` 忽略，不会自动进 Git。

### 分发建议

把下面两类内容分别提供：

1. **客户端安装包**  
   `Tetris Versus-0.1.0-portable.exe`（每台对战电脑一份）
2. **服务端运行方式**  
   - 源码 + Node：`npm run dev:server`  
   - 或由你的电脑现场开服，两台 Win 只连 IP

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm install` | 安装依赖并构建 shared |
| `npm run rebuild:engine` | 重新编译 C 引擎 |
| `npm run dev:server` | 启动对战服务端 |
| `npm run dev:client` | 启动 Electron 客户端 |
| `npm run dev:client:web` | 仅 Vite 网页调试 |
| `npm run typecheck` | 全包 TypeScript 检查 |
| `npm run build` | 构建 shared + engine + server + client |
| `npm run release:win:portable` | 打 Windows 便携 exe |
| `npm run release:win` | 打 Windows 安装包/便携包 |
| `npm run release:mac` | 打 macOS 包 |

## 协议与数据流（简版）

### 加入房间

```json
{ "type": "join", "name": "Alice", "roomId": "AB12CD" }
```

### 就绪

```json
{ "type": "ready" }
```

### 输入

```json
{ "type": "input", "action": "hardDrop", "pressed": true }
```

`action` 可选：

`left` `right` `softDrop` `softDropEnd` `hardDrop` `rotateCW` `rotateCCW` `hold`

### 状态广播

服务端周期性/事件后推送：

```json
{
  "type": "state",
  "state": {
    "roomId": "AB12CD",
    "phase": "playing",
    "remainingMs": 580000,
    "players": [/* P1, P2 */],
    "winnerId": null
  }
}
```

## 开发说明

### 为什么核心逻辑用 C

- 课设要求以 C 完成规则主体
- 权威逻辑集中在服务端 C 引擎，两端客户端表现一致
- Node/Electron 只承担网络与 GUI，不替代规则实现

### 本地验证建议

```bash
# 编译 C 引擎
npm run rebuild:engine

# 类型检查
npm run typecheck

# 服务端 + 两个客户端联调
npm run dev:server
npm run dev:client
```

## 常见问题

### 1. `tsx: command not found` / 模块找不到

先在仓库根目录安装依赖：

```bash
npm install
```

### 2. 加载 C 引擎失败

```bash
npm run rebuild:engine
```

确认生成 `packages/engine-c/build/Release/tetris_engine.node`。

### 3. 另一台电脑连不上

- 地址写成 `ws://服务器局域网IP:8787`
- 同一 Wi-Fi
- 服务端机器防火墙放行 8787
- 服务端日志确认已 listening

### 4. Windows 打包下载 Electron 很慢/失败

使用项目提供脚本（已带镜像）：

```bash
npm run release:win:portable
```

或手动导出镜像环境变量后再打包。

### 5. Windows 运行 portable 被 SmartScreen 拦截

未签名应用常见提示，选择“仍要运行”即可（分发前可自行签名）。

## 版本

当前版本：`0.1.0`

## License

本仓库默认仅用于学习与课程实践。若需开源许可证，可后续补充 `LICENSE`。
