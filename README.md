# Tetris Versus

双人对战俄罗斯方块：**一个安装包**即可当房主、加入房间或单人练习。  
核心规则引擎用 **C 语言**实现，界面与联网为 Electron + WebSocket。

仓库：https://github.com/qYcd/tetris-versus

## 功能

- 一个应用内选择：**当房主开房 / 加入房间 / 单人练习**
- 双人联网积分对战（同一局域网即可）
- 7-bag 洗牌生成方块
- 操控中方块整体移动/旋转；**锁定后固定格按列单格重力下落**，消行可连锁
- Hold / Next 预览
- 胜负：一方顶出即负，或 **10 分钟**到时比分高者胜

## 下载与安装

安装包在发布目录（本地构建后）：

```text
packages/client/release/unified/
```

| 平台 | 文件 | 用法 |
|------|------|------|
| macOS (Apple Silicon) | `Tetris Versus-0.1.0-arm64.dmg` | 打开 dmg，拖入「应用程序」后启动 |
| macOS (免安装) | `Tetris Versus-0.1.0-arm64-mac.zip` | 解压后直接运行 `.app` |
| Windows | `Tetris Versus-0.1.0-win-x64.exe` | 安装程序，可装到系统并创建快捷方式 |
| Windows (免安装) | `Tetris Versus-0.1.0-portable.exe` | 双击即玩，无需安装 |

> 未签名：macOS 可能提示“无法验证开发者”，可在「系统设置 → 隐私与安全性」允许打开；Windows 可能出现 SmartScreen，选择“仍要运行”。

## 怎么玩（推荐）

1. **A 电脑**打开应用 → 填昵称 → **当房主开房** → 启动并进入房间  
2. 把界面显示的 **局域网地址**（如 `ws://192.168.x.x:8787`）发给 B  
3. **B 电脑**打开同一应用 → **加入房间** → 填该地址与相同房间号（可空则快速匹配）  
4. 双方 **Ready** 开始  
5. 不想联网时选 **单人练习**

注意：

- 两台电脑须在同一局域网
- 加入方不要填 `127.0.0.1`（那是本机）
- 防火墙放行 **8787** 端口
- 房主端会在应用内自动启动服务，无需另开终端

### 操作

| 操作 | 键位 |
|------|------|
| 左/右 | `←` `→` 或 `A` `D` |
| 软降 | `↓` / `S` |
| 硬降 | `Space` |
| 顺时针旋转 | `↑` / `W` / `X` |
| 逆时针旋转 | `Z` |
| Hold | `C` |

## 架构

```text
统一 Electron 应用
 ├─ 界面（React）
 ├─ 单人练习（本地引擎）
 └─ 当房主时内嵌 WebSocket 服务 ──► C 规则引擎（权威）
加入房间时：仅作为客户端连接房主的 ws 地址
```

| 包 | 说明 |
|----|------|
| `packages/engine-c` | C 规则引擎（生成、旋转、锁定重力、计分、对战状态机） |
| `packages/client` | 统一 Electron 应用（房主 / 加入 / 单人） |
| `packages/server` | 独立 WebSocket 服务端（开发调试用） |
| `packages/shared` | 协议类型与 JS 回退引擎 |

核心规则在 `packages/engine-c/src/tetris_engine.c`。  
若某平台缺少 C 原生模块，房主模式会回退到共享 JS 引擎以保证可玩。

## 开发环境运行

```bash
git clone https://github.com/qYcd/tetris-versus.git
cd tetris-versus
npm install
npm run rebuild:engine
npm run dev:client
```

可选独立服务端调试：

```bash
npm run dev:server
```

大厅连接：`ws://127.0.0.1:8787`

### 重新打包安装包

```bash
npm run dist:mac    # macOS 统一安装包
npm run dist:win    # Windows 统一安装包
npm run dist:all    # 两者
```

产物输出：`packages/client/release/unified/`

## 协议摘要

客户端 → 服务端：`join` / `ready` / `input` / `leave`  
服务端 → 客户端：`welcome` / `state` / `info` / `error`

`input.action`：`left` `right` `softDrop` `softDropEnd` `hardDrop` `rotateCW` `rotateCCW` `hold`

## 常见问题

**开发时加载 C 引擎失败**

```bash
npm run rebuild:engine
```

**依赖 / 命令找不到**

```bash
npm install
```

**端口 8787 被占用**

说明本机已有服务在跑（可能是之前开的房主）。可继续加入，或结束占用进程：

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

## License

仅供学习与实践。
