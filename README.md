# Tetris Versus

双人对战俄罗斯方块：Electron 客户端 + WebSocket 服务端 + **C 语言权威规则引擎**。

仓库：https://github.com/qYcd/tetris-versus

## 功能

- 双人联网积分对战（两台电脑连同一服务端）
- 7-bag 洗牌生成方块
- 操控中方块整体移动/旋转；**锁定后固定格按列单格重力下落**，消行可连锁
- Hold / Next 预览
- 胜负：一方顶出即负，或 **10 分钟**到时比分高者胜

## 架构

```text
Electron Client (React)  --WebSocket-->  Node Server  --N-API-->  C Engine
   输入 / 渲染                          房间 / 同步              权威规则
```

| 包 | 说明 |
|----|------|
| `packages/engine-c` | C 规则引擎（生成、旋转、锁定重力、计分、对战状态机） |
| `packages/server` | WebSocket 服务端，调用 C 引擎 |
| `packages/client` | Electron + React 客户端 |
| `packages/shared` | 协议类型与消息编解码（TS） |

核心规则在 `packages/engine-c/src/tetris_engine.c`，服务端不重复实现逻辑。

## 环境

- Node.js >= 18
- macOS 编译引擎需要 Xcode Command Line Tools

## 本地运行

```bash
git clone https://github.com/qYcd/tetris-versus.git
cd tetris-versus
npm install
npm run rebuild:engine
```

终端 1 — 服务端：

```bash
npm run dev:server
```

看到 `listening on ws://0.0.0.0:8787` 且 `authoritative rules engine = C` 即可。

终端 2 — 客户端：

```bash
npm run dev:client
```

大厅服务器地址填：

```text
ws://127.0.0.1:8787
```

本机可开两个客户端做双人对战。

### 操作

| 操作 | 键位 |
|------|------|
| 左/右 | `←` `→` 或 `A` `D` |
| 软降 | `↓` / `S` |
| 硬降 | `Space` |
| 顺时针旋转 | `↑` / `W` / `X` |
| 逆时针旋转 | `Z` |
| Hold | `C` |

## 双机对战

1. 一台电脑运行服务端：`npm run dev:server`
2. 查服务端局域网 IP（macOS：`ipconfig getifaddr en0`）
3. 两台客户端连接：`ws://服务器IP:8787`
4. 同房间号（或快速匹配）→ 双方 Ready

注意：

- 两台机器同一局域网
- 不要填对方电脑上的 `127.0.0.1`
- 防火墙放行 **8787**
- 若提示端口占用，说明服务已在跑：`lsof -nP -iTCP:8787 -sTCP:LISTEN`

## 常用命令

```bash
npm install              # 安装依赖
npm run rebuild:engine   # 编译 C 引擎
npm run dev:server       # 启动服务端
npm run dev:client       # 启动 Electron 客户端
npm run typecheck        # 类型检查
```

## 协议摘要

客户端 → 服务端：`join` / `ready` / `input` / `leave`  
服务端 → 客户端：`welcome` / `state` / `info` / `error`

`input.action`：`left` `right` `softDrop` `softDropEnd` `hardDrop` `rotateCW` `rotateCCW` `hold`

## 常见问题

**加载 C 引擎失败**

```bash
npm run rebuild:engine
```

**`tsx` / 模块找不到**

```bash
npm install
```

**端口 8787 被占用**

服务端可能已在运行。查看并结束旧进程：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
kill <PID>
```

或换端口：

```bash
PORT=8788 npm run dev:server
```

## License

仅供学习与实践。
