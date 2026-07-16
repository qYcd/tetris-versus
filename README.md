# Tetris Versus

双人对战俄罗斯方块：**一个安装包**实现当房主、加入房间或单人练习。  
核心规则引擎用 **C 语言**实现，界面与联网为 Electron + WebSocket。

仓库：https://github.com/qYcd/tetris-versus  
当前版本：**0.1.1**

---

## 功能

- 应用内选择：**当房主开房 / 加入房间 / 单人练习**
- 双人联网积分对战（同一局域网）
- **7-bag** 洗牌生成方块
- 活动方块整体移动 / 旋转 / Hold / **Next 三预览**
- **锁定后仅当发生消行**时，消行上方固定格才按列下落触底（可连锁）
- 活动块重力采用 **log₂ 等级曲线**（60fps 语义）
- **暂停**（`P` / `Esc`，无次数上限，暂停不计时）
- **自定义对局时长**（大厅 1–60 分钟，默认 10）
- 胜负：一方顶出即负，或限时结束比分高者胜

---

## 下载与安装

本地构建产物目录：

```text
packages/client/release/unified/
```

| 平台 | 文件 | 用法 |
|------|------|------|
| macOS (Apple Silicon) | `Tetris Versus-0.1.1-arm64-mac.zip` | 解压后运行 `.app` |
| Windows (免安装) | `Tetris Versus-0.1.1-portable.exe` | 双击即玩 |

> 未签名：macOS 可能提示“无法验证开发者”，在「系统设置 → 隐私与安全性」允许；Windows 可能出现 SmartScreen，选择“仍要运行”。

---

## 怎么玩

1. **A** 打开应用 → 填昵称与时长 → **当房主开房**  
2. 把界面显示的局域网地址（如 `ws://192.168.x.x:8787`）发给 **B**  
3. **B** 选择 **加入房间**，填写该地址  
4. 双方 **Ready** 开始  
5. 单机练习选 **单人练习**

注意：

- 两台电脑须在同一局域网  
- 加入方不要填 `127.0.0.1`  
- 防火墙放行 **8787**  
- 房主端会在应用内自动启动服务，无需另开终端  

### 操作

| 操作 | 键位 |
|------|------|
| 左 / 右 | `←` `→` 或 `A` `D` |
| 软降 | `↓` / `S` |
| 硬降 | `Space` |
| 顺时针旋转 | `↑` / `W` / `X` |
| 逆时针旋转 | `Z` |
| Hold | `C` |
| 暂停 / 继续 | `P` / `Esc` |

---

## 总体架构

```text
┌─────────────────────────────────────────────┐
│              Electron 统一客户端              │
│  React UI  ·  单人本地引擎  ·  键盘输入       │
│                     │                       │
│        房主模式：内嵌 server-host.cjs        │
│                     │ WebSocket             │
│                     ▼                       │
│              权威对局 Match                  │
│         ┌───────────┴───────────┐           │
│         ▼                       ▼           │
│   C 引擎 tetris_engine.node   JS 回退引擎    │
│   (packages/engine-c)        (@tetris/shared)│
└─────────────────────────────────────────────┘
加入房间模式：不启服务，仅连接房主的 ws://IP:8787
```

| 包 | 路径 | 职责 |
|----|------|------|
| C 规则引擎 | `packages/engine-c` | 生成、旋转、锁定/消行重力、计分、对战状态机（权威） |
| 共享层 | `packages/shared` | 协议类型、JS 回退引擎、与 C 对齐的规则 |
| 独立服务端 | `packages/server` | 开发调试用 WebSocket 服务 |
| 客户端 | `packages/client` | Electron + React 统一应用 |

---

## C 引擎如何实现俄罗斯方块逻辑

权威实现文件：

- 头文件：`packages/engine-c/include/tetris_engine.h`
- 源文件：`packages/engine-c/src/tetris_engine.c`
- Node 绑定：`packages/engine-c/binding/binding_napi.c` → 编译为 `tetris_engine.node`

### 1. 数据与几何

- 棋盘：`10 × 20` 可见区 + `2` 行顶部缓冲（`TE_BOARD_W/H/BUFFER`）
- 七种方块：`I O T S Z J L`，旋转状态 `0..3`
- 每名玩家维护：固定盘面、活动块、Next 队列、Hold、分数 / 行数 / 等级

### 2. 生成：7-bag

- 袋空时把 7 种方块洗入（Fisher–Yates）
- 每次 `spawn` 取一块，并保持预览队列（`TE_PREVIEW_COUNT`，UI 显示前 3 个）
- 双方使用同一对局种子 + 座位派生，保证可复现

### 3. 活动块操作

| 动作 | 逻辑 |
|------|------|
| 左右 / 软降 | `te_try_move` 碰撞检测后平移 |
| 旋转 | 简化踢墙测试后 `te_try_rotate` |
| 硬降 | 连续下移到底并立即 `te_lock_active` |
| Hold | 与 hold 槽交换，本回合限一次 |

### 4. 活动块重力（等级曲线）

按 60fps 语义定义重力 \(G\)（格/帧）：

\[
G(l)=\frac{1}{\max\!\left(1,\ 16\big(5-\lfloor\log_2 l\rfloor\big)-\dfrac{l}{2^{\lfloor\log_2 l\rfloor}}\right)}
\]

实现要点（`te_gravity_g` + `te_player_tick`）：

- 逻辑帧约 **50ms**（≈ 3 个 60fps 帧）
- 每 tick：`gravity_acc += G(level) * 3`
- `acc >= 1` 时整数下落 1 格并扣减；可一帧多格
- 软降：本 tick 至少尝试下落 1 格
- 等级：`level = total_lines / 10 + 1`

### 5. 锁定后消行重力（本项目定制）

与“锁定就整盘沉降”不同，本项目规则为：

1. 活动块写入固定盘面  
2. **检测满行**  
3. **若无满行** → 固定格全部保持原位（不沉降）  
4. **若有满行** → 消除满行 → 各列上方格下落触底/被挡  
5. 若再次满行 → 重复 4，形成连锁计分  

对应函数：`te_lock_active` → `te_resolve_cascade`  
（`clear` → `column_gravity` 循环；**不再**在消行前先整体沉降）

### 6. 对战状态机

阶段：`waiting → countdown → playing ⇄ paused → finished`

| API | 作用 |
|-----|------|
| `te_match_create` | 建局（可传入 `duration_ms`） |
| `te_match_add_player` | 加入（最多 2） |
| `te_match_ready` | 双方 Ready 后进入倒计时 |
| `te_match_input` | 仅 `playing` 接受操作 |
| `te_match_pause` | `playing ↔ paused`，**无次数上限** |
| `te_match_update` | 推进倒计时 / 重力 / 限时；**暂停不计时** |
| `te_match_forfeit` | 断线/认输 |

限时使用累计 `elapsed_ms`（暂停段不增加），到时比分高者胜。

### 7. 与 Node / Electron 的衔接

```text
JS: createMatch / ready / pause / input / update / getState
        │
        ▼  Node-API (binding_napi.c)
C:  te_match_*  →  JSON 状态快照  →  前端渲染
```

若当前平台找不到 `tetris_engine.node`，房主模式回退到 `@tetris/shared` 的 JS 引擎（语义对齐）。

### C 引擎主流程（流程图）

```text
                    ┌─────────────┐
                    │ match_create│
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
              ┌────►│   waiting   │◄──── 玩家 join / ready
              │     └──────┬──────┘
              │            │ 双方 Ready
              │            ▼
              │     ┌─────────────┐
              │     │  countdown  │  3…2…1
              │     └──────┬──────┘
              │            ▼
              │     ┌─────────────┐   P/Esc
              │     │   playing   │◄──────────┐
              │     └──────┬──────┘           │
              │       输入 / 重力 tick         │
              │            │                  │
              │            ▼                  │
              │     活动块落地? ──否──► 继续   │
              │            │是                │
              │            ▼                  │
              │     lock → cascade            │
              │     (仅消行才列重力)            │
              │            │                  │
              │            ▼                  │
              │     顶出 / 时间到?             │
              │       │否         │是         │
              │       ▼           ▼           │
              │   spawn 下一块  finished      │
              │                               │
              │     playing ──pause──► paused ┘
              │     paused  ──pause──► playing
              └───────────────────────────────
```

---

## Electron 具体实现方式

### 进程划分

| 进程 | 文件 | 作用 |
|------|------|------|
| 主进程 | `packages/client/electron/main.cjs` | 窗口、IPC、按需启动内嵌服务 |
| 预加载 | `packages/client/electron/preload.cjs` | 向渲染进程暴露安全 API |
| 内嵌服务 | `packages/client/electron/server-host.cjs` | WebSocket 房主服务 + 调 C/JS 引擎 |
| 渲染进程 | `packages/client/src/*` | React 大厅 / 对战 UI |

### 三种模式

```text
┌──────────────┐     startHost(durationMs)      ┌──────────────────┐
│  当房主开房   │ ─────────────────────────────► │ server-host 监听  │
│  React Lobby │     再连 ws://127.0.0.1:8787    │ 0.0.0.0:8787     │
└──────────────┘                                │ createMatch(C/JS) │
                                                └────────┬─────────┘
                                                         │ state 广播
┌──────────────┐     连接房主 lanWs               │
│  加入房间     │ ───────────────────────────────┘
└──────────────┘

┌──────────────┐
│  单人练习     │ ──► SoloController + shared PlayerEngine（本地 50ms tick）
└──────────────┘
```

### 关键实现点

1. **主进程 IPC**  
   - `tetris:getBootstrap`：平台信息、局域网 IP、服务状态  
   - `tetris:startHost({ durationMs })`：启动内嵌服务并返回 `ws` 地址  
   - `tetris:stopHost`：关闭内嵌服务  

2. **内嵌服务 `server-host.cjs`**  
   - 优先 `require('tetris_engine.node')`  
   - 失败则动态 import `@tetris/shared` 的 `Match` 作为回退  
   - 房间：`join` / `ready` / `pause` / `input` / `leave`  
   - 定时 `match.update(50)` 并向房间广播 `state`  

3. **渲染进程**  
   - `Lobby`：昵称、时长、房主/加入/单人  
   - `Battle` + `BoardView`：双盘、分数、Hold、**3 个 Next**、暂停提示  
   - `useGameSocket`：WebSocket 协议编解码  
   - `useKeyboard`：操作键 + 暂停键  

4. **打包**  
   - `electron-builder`  
   - 0.1.1 默认产物：**mac zip** + **win portable**  
   - 脚本：`packages/client/scripts/package-unified.mjs`

---

## 仓库源码介绍

```text
tetris-versus/
├── package.json                 # monorepo workspaces 脚本
├── packages/
│   ├── engine-c/                # C 权威引擎 + Node-API
│   │   ├── include/tetris_engine.h
│   │   ├── src/tetris_engine.c
│   │   ├── binding/binding_napi.c
│   │   └── binding.gyp
│   ├── shared/                  # 协议 + JS 回退规则
│   │   └── src/
│   │       ├── types.ts         # MatchState / ClientMessage 等
│   │       ├── board.ts         # 消行与列重力（与 C 对齐）
│   │       ├── playerEngine.ts  # 单人/回退活动块逻辑
│   │       ├── match.ts         # JS 对战状态机
│   │       ├── scoring.ts       # 计分 / gravityG
│   │       ├── bag.ts / pieces.ts / protocol.ts
│   ├── server/                  # 独立 WebSocket 服务（开发）
│   │   └── src/roomManager.ts
│   └── client/                  # Electron + React
│       ├── electron/
│       │   ├── main.cjs
│       │   ├── preload.cjs
│       │   └── server-host.cjs
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/      # Lobby / Battle / BoardView
│       │   ├── game/soloEngine.ts
│       │   └── hooks/           # useGameSocket / useKeyboard
│       └── scripts/package-unified.mjs
└── tasks/todo.md
```

### 协议摘要

客户端 → 服务端：`join` / `ready` / `pause` / `input` / `leave` / `ping`  
服务端 → 客户端：`welcome` / `state` / `info` / `error` / `pong`

`input.action`：`left` `right` `softDrop` `softDropEnd` `hardDrop` `rotateCW` `rotateCCW` `hold`

`join` 可携带 `durationMinutes`（主要用于建房侧配置；房主本地 `startHost` 传入 `durationMs`）。

---

## 开发环境运行

```bash
git clone https://github.com/qYcd/tetris-versus.git
cd tetris-versus
npm install
npm run rebuild:engine
npm run dev:client
```

独立服务端调试：

```bash
npm run dev:server
# 大厅连接 ws://127.0.0.1:8787
```

### 打包

```bash
npm run dist:mac    # → arm64-mac.zip
npm run dist:win    # → portable.exe
```

产物：`packages/client/release/unified/`

### 常见问题

**C 引擎加载失败**

```bash
npm run rebuild:engine
```

**端口 8787 占用**

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

---


## 局域网联机：完整实现逻辑

本节说明从点击「当房主」到双方同步落子的全链路，代码以仓库现状为准。

### 1. 角色与职责

| 角色 | 进程 | 做什么 |
|------|------|--------|
| 房主 | Electron 主进程 + 内嵌 WS 服务 | 权威对局、广播 `state` |
| 房主渲染进程 | React | UI、本机输入、显示局域网地址 |
| 加入方 | 仅渲染进程 + WebSocket 客户端 | 连接房主 `ws://LAN_IP:8787` |
| 权威引擎 | `tetris_engine.node`（优先）或 JS `Match` | 规则演算 |

**原则：客户端不自己推进对战逻辑。** 联网时所有重力、消行、胜负只在房主侧引擎执行；双方只发输入、收快照。

### 2. 启动房主服务

```text
Lobby 点击「当房主开房」
    │
    ▼
App.startHost(name, roomId, minutes)
    │  durationMs = minutes * 60 * 1000
    ▼
preload: window.tetrisApp.startHost({ durationMs })
    │  ipcRenderer.invoke('tetris:startHost')
    ▼
main.cjs: ipcMain.handle('tetris:startHost')
    │
    ▼
ensureHostServer({ durationMs })
    │  require('./server-host.cjs').startEmbeddedServer
    ▼
server-host:
  1) loadCEngine() → tetris_engine.node
     失败则 loadJsEngine() → shared Match
  2) http.createServer + WebSocketServer
  3) listen(0.0.0.0:8787)
  4) setInterval 每 50ms: match.update(50) + broadcastRoom
    │
    ▼
返回 bootstrap:
  host.localWs = ws://127.0.0.1:8787
  host.lanWs   = ws://<局域网IPv4>:8787
    │
    ▼
房主渲染进程 connectAndJoin(localWs, name, roomId)
```

关键文件：

- `packages/client/src/App.tsx` → `startHost`
- `packages/client/electron/preload.cjs` → `tetrisApp.startHost`
- `packages/client/electron/main.cjs` → `tetris:startHost` / `ensureHostServer`
- `packages/client/electron/server-host.cjs` → `startEmbeddedServer`

局域网 IP 由主进程 `os.networkInterfaces()` 取第一个非内部 IPv4。

### 3. 会话与房间数据结构

`server-host.cjs` 内内存结构（示意）：

```text
sessions: Map<sessionId, {
  id, name, roomId, enginePlayerId, ws
}>

rooms: Map<roomId, {
  id,
  match,              // C 绑定对象 或 JS 适配器
  seatBySession: Map  // sessionId -> enginePlayerId (P1/P2)
}>

waitingRoomId: string | null   // 快速匹配用
```

房间创建策略：

1. 客户端 `join` 若带 `roomId` → 进入该房（不存在则 `createMatch` 新建）  
2. 若不带 `roomId` → 优先加入 `waitingRoomId`（仍 `waiting` 且未满 2 人），否则新建并设为 waiting  
3. `match.addPlayer(name)` 成功后回 `welcome { playerId, roomId }`，再 `broadcastRoom` 推全量 `state`

独立开发服务端 `packages/server/src/roomManager.ts` 逻辑同构。

### 4. WebSocket 消息协议

序列化：JSON 文本帧（`encodeMessage` / `JSON.stringify`）。

**客户端 → 服务端**

| type | 字段 | 含义 |
|------|------|------|
| `join` | `name`, `roomId?`, `durationMinutes?` | 进房；时长以房主启动服务时传入为准 |
| `ready` | — | 座位 Ready |
| `input` | `action`, `pressed` | 操作按下/抬起 |
| `pause` | — | 切换暂停（任一方，整房同步） |
| `ping` | `t` | 延迟探测 |
| `leave` | — | 主动离开 |

**服务端 → 客户端**

| type | 字段 | 含义 |
|------|------|------|
| `welcome` | `playerId`, `roomId` | 分配座位 id（如 `P1`） |
| `state` | `state: MatchState` | 权威快照（整局） |
| `info` / `error` | `message` | 提示 |
| `pong` | `t` | 应答 ping |

`MatchState` 核心字段（`packages/shared/src/types.ts`）：

```text
roomId, phase, players[2], startedAt, durationMs, remainingMs,
winnerId, finishReason, countdown, seed

PlayerState:
  id, name, board[22][10], active, nextQueue, hold, holdUsed,
  score, lines, level, alive, softDropping, lockTicks, ...
```

前端用 `welcome.playerId` 识别「自己」，渲染时对比 `players[i].id`。

### 5. 输入同步路径

```text
键盘 keydown/keyup
  → useKeyboard 映射为 InputAction
  → useGameSocket.sendInput / SoloController.input
  → { type:'input', action, pressed }
  → 房主 server-host handle('input')
  → match.input(enginePlayerId, action, pressed)
  → C: te_match_input / JS: Match.handleMessage
  → 立即 broadcastRoom（降低手感延迟）
  → 双方 React 用最新 state 重绘
```

动作名：`left` `right` `softDrop` `softDropEnd` `hardDrop` `rotateCW` `rotateCCW` `hold`。

软降需要 **按下** 置位、**抬起** 清除（`softDrop` / `softDropEnd`）。

### 6. 权威 Tick 循环

```text
setInterval(TICK_MS=50):
  for each room:
    if phase in (waiting, finished): skip
    match.update(50)     // 倒计时 / 重力 / 限时 / 暂停跳过
    broadcastRoom(roomId)
```

- **playing**：累加 `elapsed_ms`，跑玩家 `tick`，检测顶出  
- **paused**：`update` 直接返回，**剩余时间不减**  
- **countdown**：每满 1000ms `countdown--`，到 0 进入 playing  

### 7. 状态机与胜负

```text
waiting ──双方 ready──► countdown ──3s──► playing ⇄ paused
                                              │
                         顶出 / 时间到 / 断线认输
                                              ▼
                                          finished
```

| 条件 | finishReason |
|------|----------------|
| 一方 `alive=false` | `opponent_topped_out` |
| `elapsed_ms >= duration_ms` | `time_up`（比分高者胜，平局 `winnerId=null`） |
| 对战中断线 | `forfeit`（对手获胜） |

断线：`ws.close` → `unregister` → 若 phase 为 playing/paused 则 `match.forfeit`。

### 8. 加入方完整步骤

```text
B 输入 ws://192.168.x.x:8787（房主 lanWs，勿用 127.0.0.1）
  → WebSocket 连接
  → onopen 发送 join
  → welcome 记录 selfId
  → 持续收 state 渲染
  → Ready / 操作 / 暂停 同上
```

防火墙需放行 **TCP 8787**。房主监听 `0.0.0.0` 才能被局域网访问。

### 9. 引擎加载与回退

```text
loadCEngine:
  在开发目录 / resources / asar.unpacked 中查找 tetris_engine.node
  require 成功 → kind:'c'

失败 → loadJsEngine:
  import shared/dist/index.js 的 Match
  包装为相同 API: addPlayer/ready/pause/input/update/getState/forfeit
```

因此安装包在缺少原生模块的平台仍可联机（语义与 C 对齐）。

### 10. 联机时序图

```text
房主UI          主进程/内嵌服务           引擎(C/JS)         加入方UI
  | startHost        |                      |                  |
  |----------------->| listen :8787         |                  |
  | join local       | createMatch          |                  |
  |----------------->| addPlayer P1         |                  |
  |                  |--------------------->|                  |
  | welcome+state    |                      |                  |
  |<-----------------|                      |   join lanWs     |
  |                  |<----------------------------------------|
  |                  | addPlayer P2         |                  |
  |                  |--------------------->|                  |
  | state(2p)        |---------------------------------------->|
  | ready            | ready P1/P2          |                  |
  |----------------->|--------------------->|                  |
  |                  | phase=countdown      |                  |
  |   tick 50ms ...  | update               |                  |
  |                  |--------------------->|                  |
  | state playing    |---------------------------------------->|
  | input left       | input(P1,'left',1)   |                  |
  |----------------->|--------------------->|                  |
  | state            |---------------------------------------->|
```

---

## 核心玩法：数据结构与算法

权威实现以 **C 引擎**为准（`packages/engine-c/src/tetris_engine.c`），JS（`packages/shared`）保持同语义回退。

### 1. 公共数据结构

#### 棋盘

```text
宽度 W = 10
高度可见 H = 20
顶部缓冲 BUFFER = 2
总行 TOTAL = 22

board[y][x] ∈ {0 空, 1..7 颜色}
坐标系：x 向右，y 向下，原点左上
```

C：`int board[TE_TOTAL_ROWS][TE_BOARD_W]`  
TS：`Cell[][]`（`packages/shared/src/types.ts`）

#### 活动块

```text
ActivePiece / TeActivePiece:
  id        方块种类 (I/O/T/S/Z/J/L 或 0..6)
  rotation  0..3（顺时针编号）
  x, y      旋转锚点在棋盘上的位置
  valid     C 侧是否存在活动块
```

绝对占用格：

```text
cells[i] = (x, y) + SHAPES[id][rotation][i]   // i=0..3 共 4 格
```

#### 玩家运行时（C 内部）

```text
TePlayerInternal:
  state          // 可序列化 TePlayerState
  bag[7], bag_count
  queue[], queue_len     // 预览供给
  gravity_acc (double)  // 活动块重力累计（格）
  lock_reset_budget
  ready
  rng_state
```

#### 形状表 `SHAPES[7][4][4]`

每种方块 4 个旋转态，每态 4 个相对坐标。  
C 与 TS（`packages/shared/src/pieces.ts` 的 `SHAPES`）一致，对齐 Guideline 常见 spawn 朝向。

---

### 2. 7-bag 随机生成

**目标**：每 7 次生成覆盖 `I O T S Z J L` 各一次，避免长期不来某种块。

#### 数据结构

```text
bag[]      当前袋（最多 7）
queue[]    预览队列（保持长度 ≥ preview+1）
rng        种子随机（C: Mulberry32；TS: createRng）
```

#### 算法

```text
refill_bag:
  if bag 非空: return
  bag ← [I,O,T,S,Z,J,L]
  Fisher–Yates:
    for i = 6 downto 1:
      j = floor(rng() * (i+1))
      swap(bag[i], bag[j])

next:
  while queue 长度不足: refill_bag; queue.push(bag.pop())
  return queue.shift()
  再 refill 以维持预览
```

代码位置：

- C：`te_refill_bag` / `te_bag_next` / `te_refill_queue`
- TS：`packages/shared/src/bag.ts` → `SevenBag`

双方座位种子：`derive(seed, seat)`，同一房间可复现各自序列。

---

### 3. 控制（输入 → 状态变更）

#### 映射

| 键位 | action |
|------|--------|
| ←/A、→/D | `left` / `right` |
| ↓/S 按下、抬起 | `softDrop` / `softDropEnd` |
| Space | `hardDrop` |
| ↑/W/X | `rotateCW` |
| Z | `rotateCCW` |
| C | `hold` |
| P/Esc | 协议 `pause`（非 input） |

#### 处理流程（单玩家）

```text
te_player_input / PlayerEngine.handleInput:
  softDrop: soft_dropping = pressed
  softDropEnd: soft_dropping = false
  其它仅 pressed=true 时：
    left/right → try_move(±1, 0)
    rotate*    → try_rotate(±1)
    hardDrop   → 连续 try_move(0,1) 到底 + lock + 硬降分
    hold       → 与 hold 槽交换（hold_used 限制本回合一次）
```

仅 `phase == playing` 时引擎接受操作输入；暂停时忽略。

---

### 4. 撞墙 / 碰撞判定

核心函数：`te_can_place` / `canPlace(board, cells)`。

```text
对 cells 中每一格 (x,y):
  if x < 0 or x >= W:        非法（左右墙）
  if y < 0 or y >= TOTAL:   非法（顶/底）
  if board[y][x] != 0:       非法（撞到固定块）
全部合法 → 可放置
```

用于：

- 移动前探测  
- 旋转踢墙每一步探测  
- spawn 失败 → `alive = false`（顶出）

```text
try_move(dx,dy):
  cells = abs(active + (dx,dy))
  if !can_place: return false
  active.x += dx; active.y += dy
  若横向移动或上移：可重置 lock delay（有预算）
  return true
```

---

### 5. 旋转与踢墙（简化 SRS）

```text
try_rotate(dir):  // dir=+1 顺时针, -1 逆时针
  from = rotation
  to = (from + dir + 4) % 4
  kicks = 表(I 或 JLSTZ)；O 仅 (0,0)
  for each (kx, ky) in kicks:
    // 逆时针时 C/TS 对 kx 取镜像，以复用表
    rx = x + kx'; ry = y + ky
    if can_place(shape[to] at rx,ry):
      应用 rotation=to 与新坐标
      重置 lock delay
      return true
  return false
```

踢墙表（与 `getKickTests` / C `kicks_jlstz` `kicks_i` 一致）为 **简化 SRS**：每旋转含 `(0,0)` 及若干平移尝试，不是完整 Guideline 状态对表，但对战手感足够。

形状本身预计算在 `SHAPES[piece][rot][4]`，**不做矩阵即时旋转**，避免浮点误差。

---

### 6. 重力实现（两类）

#### 6.1 活动块重力（下落）

公式（60fps 语义，格/帧）：

\[
G(l)=\frac{1}{\max\!\left(1,\ 16\big(5-\lfloor\log_2 l\rfloor\big)-\dfrac{l}{2^{\lfloor\log_2 l\rfloor}}\right)}
\]

数据结构：`gravity_acc: double`（累计「应下落格数」）

```text
每逻辑 tick（50ms ≈ 3 帧）:
  g = te_gravity_g(level)
  gravity_acc += g * 3
  if soft_dropping and gravity_acc < 1:
    gravity_acc = 1          // 软降至少 1 格/tick

  while gravity_acc >= 1 and steps < 40:
    gravity_acc -= 1
    if try_move(0, 1):
      lock_ticks = 0
      软降加分
    else:
      // 着地：累计 lock_ticks，满 TE_LOCK_DELAY_TICKS 则锁定
      lock_ticks++
      if lock_ticks >= LOCK_DELAY: lock_active()
      break
```

等级：`level = lines/10 + 1`。

代码：C `te_gravity_g` + `te_player_tick`；TS `gravityG` + `PlayerEngine.tick`。

#### 6.2 锁定后固定格重力（定制）

**不是**一锁定就全盘沉降，而是：

```text
lock_active:
  把活动块 4 格写入 board（颜色 1..7）
  resolve_cascade(board):
    loop:
      cleared = clear_full_lines(board)   // 删满行，上方行下压（经典消行）
      if cleared == 0: break              // 无满行：整盘保持不动
      apply_column_gravity(board)         // 各列非空格沉底
      累计 lines / chain 计分
  level/score 更新
  spawn 下一块
```

列重力 `apply_column_gravity` / `te_apply_column_gravity`：

```text
for x in 0..W-1:
  自底向上收集 board[*][x] 非 0 到 stack
  自底回填 stack，上方清 0
  // 不跨列，只在本列填空隙
```

验收语义：

- 锁定后悬空且**无满行** → 悬空保持  
- **消行后** → 该列上方块下落并可连锁再消  

---

### 7. 锁定延迟（简要）

着地后不立刻锁定：`lock_ticks` 随重力 tick 增加；移动/旋转成功可重置（有 `lock_reset_budget` 上限）。  
硬降：直接落底并立即 `lock_active`，跳过延迟。

---

### 8. 单人 vs 联机算法复用

| 模式 | 规则执行位置 |
|------|----------------|
| 联机房主 | C `te_match_*`（或 JS Match 回退） |
| 联机加入方 | 不跑规则，只渲染 `state` |
| 单人练习 | `SoloController` + `PlayerEngine`（shared，与 C 对齐） |

因此改规则必须同时改 **C + shared**，否则回退路径手感不一致。


## 参考内容

本项目规则实现参考了 Guideline 体系，并在锁定重力、对战模式上做了课设向定制。

| 主题 | 链接 |
|------|------|
| Tetris Guideline（中文 Wiki） | https://tetris.huijiwiki.com/wiki/Guideline |
| Tetris Guideline（英文） | https://tetris.wiki/Tetris_Guideline |
| 重力公式来源（Bilibili） | https://www.bilibili.com/video/BV1Ff421Z72f/ |

说明：

- 7-bag、基础操作、Hold/Next 等对齐常见 Guideline 思路  
- **锁定后仅消行才列重力**为本项目定制，不完全等同经典“整行消除上移”或“锁后立即全盘沉降”  
- 活动块重力 \(G(l)\) 采用上述视频中的 log₂ 曲线，并按 60fps 语义映射到 50ms 逻辑 tick  

---

## License

仅供学习与实践。
