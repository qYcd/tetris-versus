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
