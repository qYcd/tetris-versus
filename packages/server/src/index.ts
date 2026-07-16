/**
 * WebSocket 对战服务端入口。
 * 职责：连接管理、房间匹配、权威 tick 循环、状态广播。
 */

import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '@tetris/shared';
import { config } from './config.js';
import { RoomManager } from './roomManager.js';

const manager = new RoomManager();

const httpServer = createServer((req, res) => {
  // 简单健康检查，便于部署探测
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'tetris-versus-server' }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Tetris Versus Server is running. Connect via WebSocket.\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const session = manager.register(ws);
  manager.send(session, {
    type: 'info',
    message: '已连接服务器，请发送 join 加入房间',
  });

  ws.on('message', (data) => {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const msg = parseClientMessage(text);
    if (!msg) {
      manager.send(session, { type: 'error', message: '非法消息格式' });
      return;
    }

    switch (msg.type) {
      case 'join':
        manager.join(session, msg.name, msg.roomId);
        break;
      case 'ready':
        manager.handle(session, 'ready', null);
        break;
      case 'pause':
        manager.handle(session, 'pause', null);
        break;
      case 'input':
        manager.handle(session, 'input', msg);
        break;
      case 'ping':
        manager.send(session, { type: 'pong', t: msg.t });
        break;
      case 'leave':
        manager.unregister(session.id);
        break;
      default:
        manager.send(session, { type: 'error', message: '未知消息类型' });
    }
  });

  ws.on('close', () => {
    manager.unregister(session.id);
  });

  ws.on('error', () => {
    manager.unregister(session.id);
  });
});

// 权威逻辑循环
setInterval(() => {
  manager.tickAll(config.tickMs);
}, config.tickMs);

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  // 启动失败时给出可操作提示（最常见是端口占用）
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] 端口 ${config.port} 已被占用（EADDRINUSE）。`,
    );
    console.error(
      `[server] 处理方式：
` +
        `  1) 若已有服务在跑，可直接使用，不必重复启动
` +
        `  2) 查看占用：lsof -nP -iTCP:${config.port} -sTCP:LISTEN
` +
        `  3) 结束旧进程：kill <PID>
` +
        `  4) 或换端口：PORT=8788 npm run dev:server`,
    );
    process.exit(1);
  }
  console.error('[server] 启动失败:', err);
  process.exit(1);
});

httpServer.listen(config.port, config.host, () => {
  // 服务启动日志
  console.log(
    `[server] Tetris Versus listening on ws://${config.host}:${config.port}`,
  );
  console.log(
    `[server] match duration=${config.durationMs}ms tick=${config.tickMs}ms`,
  );
  console.log('[server] authoritative rules engine = C (packages/engine-c)');
});
