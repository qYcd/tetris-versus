# Lessons

- 参考 tetris.c 仅作 Windows 控制台案例，本项目走跨平台 GUI + 服务端同步。
- 用户定制规则：锁定后单格重力，不把已固定方块当整体。
- 默认不写 README/说明文档，除非用户明确要求。

- 课设必须 C 语言完成主体；前后端/跨平台不能用 Node/Electron 替代主交付。
- GUI 若需要，优先 C + SDL2/raylib；网络用 BSD sockets。
- 课设逻辑用 C：权威规则放在 packages/engine-c，网络/GUI 可保留 Node/Electron。
