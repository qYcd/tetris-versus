/**
 * 内嵌对战服务端（在 Electron 主进程中启动）。
 * 优先使用 C 引擎；若当前平台无原生模块则回退到 TS 共享引擎，保证安装包可玩。
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 8787;
const DEFAULT_DURATION_MS = 10 * 60 * 1000;
const TICK_MS = 50;

/**
 * 解析资源根目录（开发 / 打包 asar / asar.unpacked）。
 */
function resolveResourceRoots() {
  const roots = [];
  // 开发：packages/client/electron -> repo packages
  roots.push(path.resolve(__dirname, '..', '..'));
  // 打包后：resources
  if (process.resourcesPath) {
    roots.push(process.resourcesPath);
    roots.push(path.join(process.resourcesPath, 'app.asar.unpacked'));
    roots.push(path.join(process.resourcesPath, 'app'));
  }
  // 当前 app 根
  roots.push(path.resolve(__dirname, '..'));
  return roots;
}

/**
 * 查找首个存在的文件。
 */
function findExisting(candidates) {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * 加载 C 原生引擎。
 */
function loadCEngine() {
  const roots = resolveResourceRoots();
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.join(root, 'engine-c', 'build', 'Release', 'tetris_engine.node'));
    candidates.push(path.join(root, 'packages', 'engine-c', 'build', 'Release', 'tetris_engine.node'));
    candidates.push(path.join(root, 'native', 'tetris_engine.node'));
    candidates.push(path.join(root, 'tetris_engine.node'));
  }
  const nodePath = findExisting(candidates);
  if (!nodePath) {
    throw new Error('未找到 tetris_engine.node');
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const binding = require(nodePath);
  return {
    kind: 'c',
    version: typeof binding.engineVersion === 'function' ? binding.engineVersion() : 'c-engine',
    createMatch(roomId, durationMs, seed) {
      return binding.createMatch(roomId, durationMs, seed);
    },
  };
}

/**
 * 加载 TS 共享引擎（ESM dist）作为回退。
 */
async function loadJsEngine() {
  const roots = resolveResourceRoots();
  const candidates = [];
  for (const root of roots) {
    candidates.push(path.join(root, 'shared', 'dist', 'index.js'));
    candidates.push(path.join(root, 'packages', 'shared', 'dist', 'index.js'));
  }
  const jsPath = findExisting(candidates);
  if (!jsPath) {
    throw new Error('未找到 @tetris/shared dist，无法回退 JS 引擎');
  }
  const mod = await import(pathToFileURL(jsPath).href);
  const { Match } = mod;
  if (!Match) throw new Error('shared.Match 不存在');

  return {
    kind: 'js',
    version: 'shared-js-fallback',
    createMatch(roomId, durationMs, seed) {
      const match = new Match({ roomId, durationMs, seed });
      let seat = 0;
      // 适配成与 C 绑定相近的接口
      return {
        addPlayer(name) {
          seat += 1;
          const id = `P${seat}`;
          const ok = match.addPlayer(id, name);
          if (!ok) throw new Error('room full');
          return id;
        },
        ready(playerId) {
          match.handleMessage(playerId, { type: 'ready' });
        },
        pause() {
          match.pause();
        },
        input(playerId, action, pressed) {
          match.handleMessage(playerId, { type: 'input', action, pressed });
        },
        update(dtMs) {
          match.update(dtMs);
        },
        getState() {
          return match.toState();
        },
        forfeit(playerId) {
          match.forfeit(playerId);
        },
        destroy() {
          // no-op
        },
      };
    },
  };
}

/**
 * 创建随机房间号。
 */
function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function cryptoRandomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * 启动内嵌服务端。
 * @returns {Promise<{ port:number, engineKind:string, engineVersion:string, close:Function }>}
 */
async function startEmbeddedServer(options = {}) {
  const port = Number(options.port || process.env.PORT || DEFAULT_PORT);
  const host = options.host || '0.0.0.0';
  const durationMs = Number(options.durationMs || DEFAULT_DURATION_MS);

  let engine;
  try {
    engine = loadCEngine();
    console.log('[host-server] using C engine:', engine.version);
  } catch (err) {
    console.warn('[host-server] C engine unavailable, fallback JS:', err.message);
    engine = await loadJsEngine();
    console.log('[host-server] using JS engine:', engine.version);
  }

  /** @type {Map<string, any>} */
  const rooms = new Map();
  /** @type {Map<string, any>} */
  const sessions = new Map();
  let waitingRoomId = null;

  function send(session, msg) {
    if (session.ws.readyState === 1) {
      session.ws.send(JSON.stringify(msg));
    }
  }

  function broadcastRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const state = room.match.getState();
    const payload = JSON.stringify({ type: 'state', state });
    for (const session of sessions.values()) {
      if (session.roomId === roomId && session.ws.readyState === 1) {
        session.ws.send(payload);
      }
    }
  }

  function ensureRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        match: engine.createMatch(roomId, durationMs),
        seatBySession: new Map(),
      });
    }
    return rooms.get(roomId);
  }

  function join(session, name, roomId) {
    session.name = String(name || 'Player').slice(0, 16);
    let targetId = (roomId || '').trim();
    if (!targetId) {
      if (waitingRoomId && rooms.has(waitingRoomId)) {
        const st = rooms.get(waitingRoomId).match.getState();
        const occupied = Array.isArray(st?.players)
          ? st.players.filter((p) => p && !String(p.id).startsWith('empty-')).length
          : 0;
        if (st?.phase === 'waiting' && occupied < 2) targetId = waitingRoomId;
        else waitingRoomId = null;
      }
      if (!targetId) {
        targetId = createRoomId();
        ensureRoom(targetId);
        waitingRoomId = targetId;
      }
    } else {
      ensureRoom(targetId);
    }

    const room = rooms.get(targetId);
    let enginePlayerId;
    try {
      enginePlayerId = room.match.addPlayer(session.name);
    } catch {
      send(session, { type: 'error', message: '房间已满，请更换房间号' });
      return;
    }
    // JS Match 使用我们传入的 id；C 引擎返回 P1/P2
    session.roomId = targetId;
    session.enginePlayerId = enginePlayerId;
    room.seatBySession.set(session.id, enginePlayerId);

    const st = room.match.getState();
    const occupied = Array.isArray(st?.players)
      ? st.players.filter((p) => p && !String(p.id).startsWith('empty-')).length
      : room.seatBySession.size;
    if (occupied >= 2 && waitingRoomId === targetId) waitingRoomId = null;

    send(session, { type: 'welcome', playerId: enginePlayerId, roomId: targetId });
    send(session, {
      type: 'info',
      message:
        occupied >= 2
          ? '两人已就绪，请双方点击 Ready 开始'
          : '已开房，等待对手加入…可把本机 IP 发给对方',
    });
    broadcastRoom(targetId);
  }

  function handle(session, type, payload) {
    if (!session.roomId || !session.enginePlayerId) return;
    const room = rooms.get(session.roomId);
    if (!room) return;
    if (type === 'ready') {
      room.match.ready(session.enginePlayerId);
      broadcastRoom(session.roomId);
      return;
    }
    if (type === 'pause') {
      if (typeof room.match.pause === 'function') {
        room.match.pause();
      } else if (typeof room.match.togglePause === 'function') {
        room.match.togglePause();
      }
      broadcastRoom(session.roomId);
      return;
    }
    if (type === 'input') {
      room.match.input(session.enginePlayerId, payload.action, Boolean(payload.pressed));
      broadcastRoom(session.roomId);
    }
  }

  function unregister(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.roomId && session.enginePlayerId) {
      const room = rooms.get(session.roomId);
      if (room) {
        const st = room.match.getState();
        if ((st?.phase === 'playing' || st?.phase === 'paused') && typeof room.match.forfeit === 'function') {
          room.match.forfeit(session.enginePlayerId);
          broadcastRoom(session.roomId);
        }
        room.seatBySession.delete(sessionId);
      }
    }
    sessions.delete(sessionId);
  }

  const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'tetris-versus-embedded',
          engine: engine.kind,
          version: engine.version,
        }),
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Tetris Versus Embedded Host Server\n');
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    const session = {
      id: cryptoRandomId(),
      name: 'Player',
      roomId: null,
      enginePlayerId: null,
      ws,
    };
    sessions.set(session.id, session);
    send(session, { type: 'info', message: '已连接主机房间服务' });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        send(session, { type: 'error', message: '非法消息格式' });
        return;
      }
      switch (msg.type) {
        case 'join':
          join(session, msg.name, msg.roomId);
          break;
        case 'ready':
          handle(session, 'ready', null);
          break;
        case 'pause':
          handle(session, 'pause', null);
          break;
        case 'input':
          handle(session, 'input', msg);
          break;
        case 'ping':
          send(session, { type: 'pong', t: msg.t });
          break;
        case 'leave':
          unregister(session.id);
          break;
        default:
          send(session, { type: 'error', message: '未知消息类型' });
      }
    });
    ws.on('close', () => unregister(session.id));
    ws.on('error', () => unregister(session.id));
  });

  const timer = setInterval(() => {
    for (const [roomId, room] of rooms) {
      const st = room.match.getState();
      const phase = st?.phase;
      if (phase === 'waiting' || phase === 'finished') continue;
      room.match.update(TICK_MS);
      broadcastRoom(roomId);
    }
  }, TICK_MS);

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => resolve());
  });

  console.log(`[host-server] listening on ws://${host}:${port} engine=${engine.kind}`);

  return {
    port,
    host,
    engineKind: engine.kind,
    engineVersion: engine.version,
    close: () =>
      new Promise((resolve) => {
        clearInterval(timer);
        wss.close();
        httpServer.close(() => resolve());
      }),
  };
}

module.exports = { startEmbeddedServer };
