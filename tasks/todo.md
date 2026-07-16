# 双人对战俄罗斯方块 - 0.1.1 更新计划

## 目标版本
- v0.1.1

## 需求
- [x] 消行重力：未消行时锁定块不沉降；仅消行后上方格下落触底（C + JS 同步）
- [x] 活动块重力：按图公式 G(l) @60fps，C 权威，JS 对齐
- [x] 暂停功能（单人 + 对战，无次数/时长上限）
- [x] 对局时长可自定义（分钟，1-60）
- [x] NEXT 预览显示 3 个
- [x] 版本升至 0.1.1
- [x] 打包仅 mac.zip + win portable（脚本已收窄）
- [x] 验证 typecheck / 冒烟

## Spec
- [x] 段1 现状分析
- [x] 段2 功能点
- [x] 段3 风险与决策（暂停无上限）
- [x] HARD-GATE 后编码

## Review
- cascade：`clear -> gravity` 循环，无满行不沉降（C `te_resolve_cascade` / JS `resolveCascade`）
- 活动块：`gravity_acc += G*3` per 50ms tick；`te_gravity_g` / `gravityG`
- 暂停：`phase=paused`，`te_match_pause` / `Match.pause` / 客户端 `P|Esc`
- 时长：大厅分钟数 → `durationMs` → `startHost` / `SoloController`
- NEXT：BoardView 显示 3 个
- 验证：`npm run typecheck` 通过；C 引擎冒烟（pause remaining 不变、cascade、G 公式）通过；`build:client` 通过
- 打包产物尚未在本轮执行 dist（脚本已改为只出 zip/portable）；需要时运行：
  - `npm run dist:mac` → arm64-mac.zip
  - `npm run dist:win` → portable.exe

# 房主离开关服 / 端口占用修复

- [x] 修复 `ws` 导致 EADDRINUSE 变成 uncaughtException（server-host 增加 wss error 监听 + listen 失败清理）
- [x] main 探测已有 `/health` 服务并复用，避免开房弹窗
- [x] 房主 `leaveAll` 时调用 `stopHost` 关闭自建内嵌服务，释放 8787
- [x] 仅 `owned=true` 时真正 close；加入端离开不影响房主服务
- [x] `server-host.close` 主动 terminate 所有 WS 连接，确保端口释放
- [x] 验证：typecheck 通过；start→占用→close→端口可再 listen

## Review

- 根因1：`WebSocketServer({ server })` 会把 httpServer 的 `error` 再 emit 到 wss，无监听时触发 main process uncaughtException，覆盖了 main 的 EADDRINUSE catch。
- 根因2：房主点“离开房间”只 `socket.disconnect()`，从未 `stopHost`，内嵌服务继续 listen 8787。
- 行为：
  - 房主开房：`startHost` → 本进程 listen → `owned=true`
  - 房主离开：`disconnect` + `stopHost` → close 释放端口
  - 对手离开：仅 disconnect，房主服务继续
  - 复用外部 8787（如 `npm run dev:server`）：`owned=false`，stopHost 不杀外部进程
- 验证：`npm run typecheck -w @tetris/client` 通过；临时端口 18794 start/close 后可再绑定。

# 0.1.2 发布

- [x] 升版本 monorepo 全包 0.1.2
- [x] 提交房主关服 / EADDRINUSE 修复
- [ ] 打包 mac zip + win portable
- [ ] 推送 GitHub 并创建 Release v0.1.2
