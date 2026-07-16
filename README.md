# Tetris Versus

双人对战俄罗斯方块：**一个安装包**即可当房主、加入房间或单人练习。  
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
