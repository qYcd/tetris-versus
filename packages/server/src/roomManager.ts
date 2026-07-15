/**
 * 房间管理：创建/加入/匹配。
 * 对战权威逻辑全部由 C 引擎（@tetris/engine-c）执行。
 */

import { createRequire } from 'node:module';
import type { WebSocket } from 'ws';
import { encodeMessage, type ServerMessage } from '@tetris/shared';
import { config } from './config.js';

const require = createRequire(import.meta.url);

/** C 引擎 Match 接口（与 index.d.ts 对齐） */
interface CEngineMatch {
  addPlayer(name: string): string;
  ready(playerId: string): void;
  input(playerId: string, action: string, pressed: boolean): void;
  update(dtMs: number): void;
  getState(): any;
  forfeit(playerId: string): void;
  destroy(): void;
}

interface CEngineModule {
  createMatch(roomId: string, durationMs?: number, seed?: number): CEngineMatch;
  engineVersion(): string;
}

/** 延迟加载原生模块，便于给出清晰错误 */
function loadEngine(): CEngineModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@tetris/engine-c') as CEngineModule;
  } catch (err) {
    const msg =
      '加载 C 引擎失败。请先执行: npm run rebuild -w @tetris/engine-c\n' +
      String(err instanceof Error ? err.message : err);
    throw new Error(msg);
  }
}

export interface ClientSession {
  id: string;
  name: string;
  roomId: string | null;
  /** C 引擎返回的座位 id（P1/P2） */
  enginePlayerId: string | null;
  ws: WebSocket;
}

interface Room {
  id: string;
  match: CEngineMatch;
  /** 会话 id -> engine player id */
  seatBySession: Map<string, string>;
}

/**
 * 全局房间与会话表。
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private sessions = new Map<string, ClientSession>();
  private waitingRoomId: string | null = null;
  private engine: CEngineModule;

  constructor() {
    this.engine = loadEngine();
    // 启动时打印引擎版本，证明规则走 C
    console.log(`[server] C engine: ${this.engine.engineVersion()}`);
  }

  /**
   * 注册新连接会话。
   */
  register(ws: WebSocket): ClientSession {
    const id = cryptoRandomId();
    const session: ClientSession = {
      id,
      name: 'Player',
      roomId: null,
      enginePlayerId: null,
      ws,
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * 移除会话；对战中断线视为认输。
   */
  unregister(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.roomId && session.enginePlayerId) {
      const room = this.rooms.get(session.roomId);
      if (room) {
        const st = room.match.getState();
        if (st?.phase === 'playing') {
          room.match.forfeit(session.enginePlayerId);
          this.broadcastRoom(session.roomId);
        }
        room.seatBySession.delete(sessionId);
      }
    }

    this.sessions.delete(sessionId);
  }

  /**
   * 玩家加入：指定房间或自动匹配。
   */
  join(session: ClientSession, name: string, roomId?: string): void {
    session.name = name.slice(0, 16) || 'Player';

    let targetId = roomId?.trim();
    if (!targetId) {
      if (this.waitingRoomId && this.rooms.has(this.waitingRoomId)) {
        const waiting = this.rooms.get(this.waitingRoomId)!;
        const st = waiting.match.getState();
        if (st?.phase === 'waiting' && (st.players?.filter((p: any) => p && !String(p.id).startsWith('empty-')).length ?? 0) < 2) {
          targetId = this.waitingRoomId;
        } else {
          this.waitingRoomId = null;
        }
      }
      if (!targetId) {
        targetId = this.createRoomId();
        const match = this.engine.createMatch(targetId, config.durationMs);
        this.rooms.set(targetId, { id: targetId, match, seatBySession: new Map() });
        this.waitingRoomId = targetId;
      }
    } else if (!this.rooms.has(targetId)) {
      const match = this.engine.createMatch(targetId, config.durationMs);
      this.rooms.set(targetId, { id: targetId, match, seatBySession: new Map() });
    }

    const room = this.rooms.get(targetId)!;
    let enginePlayerId: string;
    try {
      enginePlayerId = room.match.addPlayer(session.name);
    } catch {
      this.send(session, { type: 'error', message: '房间已满，请更换房间号' });
      return;
    }

    session.roomId = targetId;
    session.enginePlayerId = enginePlayerId;
    room.seatBySession.set(session.id, enginePlayerId);

    const st = room.match.getState();
    const occupied = Array.isArray(st?.players)
      ? st.players.filter((p: any) => p && !String(p.id).startsWith('empty-')).length
      : room.seatBySession.size;
    if (occupied >= 2 && this.waitingRoomId === targetId) {
      this.waitingRoomId = null;
    }

    // welcome 的 playerId 使用 C 引擎座位 id，前端以此识别“自己”
    this.send(session, {
      type: 'welcome',
      playerId: enginePlayerId,
      roomId: targetId,
    });
    this.send(session, {
      type: 'info',
      message:
        occupied >= 2
          ? '两人已就绪，请双方点击 Ready 开始（规则引擎：C）'
          : '等待对手加入…可分享房间号（规则引擎：C）',
    });
    this.broadcastRoom(targetId);
  }

  /**
   * 将消息交给对应房间的 C 引擎。
   */
  handle(session: ClientSession, rawType: string, payload: unknown): void {
    if (!session.roomId || !session.enginePlayerId) return;
    const room = this.rooms.get(session.roomId);
    if (!room) return;

    if (rawType === 'ready') {
      room.match.ready(session.enginePlayerId);
      this.broadcastRoom(session.roomId);
      return;
    }

    if (rawType === 'input') {
      const p = payload as { action: string; pressed: boolean };
      room.match.input(session.enginePlayerId, p.action, Boolean(p.pressed));
      // 输入后立刻推一帧，降低手感延迟
      this.broadcastRoom(session.roomId);
    }
  }

  /**
   * 全房间推进 C 引擎逻辑帧并广播。
   */
  tickAll(dtMs: number): void {
    for (const [roomId, room] of this.rooms) {
      const st = room.match.getState();
      const phase = st?.phase as string | undefined;
      if (phase === 'waiting' || phase === 'finished') continue;
      room.match.update(dtMs);
      this.broadcastRoom(roomId);
    }
  }

  /**
   * 向房间内所有会话发送最新 state。
   */
  broadcastRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const state = room.match.getState();
    const stateMsg: ServerMessage = { type: 'state', state };
    for (const session of this.sessions.values()) {
      if (session.roomId === roomId) {
        this.send(session, stateMsg);
      }
    }
  }

  /**
   * 安全发送。
   */
  send(session: ClientSession, msg: ServerMessage): void {
    if (session.ws.readyState === session.ws.OPEN) {
      session.ws.send(encodeMessage(msg));
    }
  }

  private createRoomId(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}

/**
 * 生成会话 ID。
 */
function cryptoRandomId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
