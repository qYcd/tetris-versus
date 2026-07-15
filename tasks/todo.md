# 双人对战俄罗斯方块 - 开发计划

## 硬约束
- 俄罗斯方块**实现逻辑用 C 语言**（课设要求）
- 网络双机联网保留
- Electron/WebSocket 客户端与网络层可保留

## 架构
- `packages/engine-c`：纯 C 权威规则引擎 + Node-API 绑定
- `packages/server`：WebSocket 网络层，调用 C 引擎
- `packages/client`：Electron/React GUI
- `packages/shared`：TS 协议类型（网络/UI 用）

## 任务
- [x] C 引擎核心（7-bag / 旋转 / 单格重力级联 / 计分 / 对战状态机）
- [x] Node-API 绑定并编译出 `tetris_engine.node`
- [x] 服务端改为调用 C 引擎
- [x] C 引擎冒烟测试
- [x] 本机启动 server + 双连接联调
- [x] 客户端 Vite 构建验证
- [x] git 仓库初始化并首次提交
- [ ] 推送到 GitHub（待创建远程仓库）

## Review（2026-07-15 实测）
```
C_ENGINE_OK filled=4 score=36 next=JLZSI
SERVER_OK rules=C
MATCH_OK room=OK491 countdown->playing remaining=600000
INPUT_OK left 4->3 score=108 filled=12
CLIENT_BUILD_OK
ALL_TESTS_PASSED
```
- 服务端日志确认：`authoritative rules engine = C`
- 双人 join/ready/countdown/playing、左移、硬降、状态同步均通过

### Git
- 本地仓库已初始化，分支 main，首提 77d24c4
- 远程尚未配置，待 `gh repo create` 或手动添加 origin 后 push
