/**
 * 双人对战状态机：等待、倒计时、进行中、结束。
 * 权威逻辑在服务端调用；客户端只渲染 state 快照。
 */

import { createEmptyBoard } from './board.js';
import { PlayerEngine } from './playerEngine.js';
import {
  DEFAULT_DURATION_MS,
  type ClientMessage,
  type FinishReason,
  type InputAction,
  type MatchPhase,
  type MatchState,
  type PlayerState,
} from './types.js';

export interface MatchOptions {
  roomId: string;
  durationMs?: number;
  seed?: number;
}

interface Seat {
  engine: PlayerEngine;
  ready: boolean;
  connected: boolean;
}

/**
 * 一局双人对战。
 */
export class Match {
  readonly roomId: string;
  readonly durationMs: number;
  readonly seed: number;
  private phase: MatchPhase = 'waiting';
  private seats: Map<string, Seat> = new Map();
  private order: string[] = [];
  private startedAt: number | null = null;
  private winnerId: string | null = null;
  private finishReason: FinishReason | null = null;
  private countdown = 3;
  private countdownAccMs = 0;

  constructor(opts: MatchOptions) {
    this.roomId = opts.roomId;
    this.durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    this.seed = opts.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9));
  }

  /**
   * 玩家加入座位（最多 2）。
   */
  addPlayer(playerId: string, name: string): boolean {
    if (this.seats.has(playerId)) {
      const seat = this.seats.get(playerId)!;
      seat.connected = true;
      return true;
    }
    if (this.order.length >= 2) return false;
    const seatIndex = this.order.length;
    const engine = new PlayerEngine({
      id: playerId,
      name: name.slice(0, 16) || `P${seatIndex + 1}`,
      seed: this.seed,
      seat: seatIndex,
    });
    this.seats.set(playerId, { engine, ready: false, connected: true });
    this.order.push(playerId);
    return true;
  }

  /**
   * 标记断线（不立即判负，留重连窗口由服务端策略决定）。
   */
  markDisconnected(playerId: string): void {
    const seat = this.seats.get(playerId);
    if (seat) seat.connected = false;
  }

  /**
   * 处理来自某玩家的消息。
   */
  handleMessage(playerId: string, msg: ClientMessage): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;

    if (msg.type === 'ready') {
      seat.ready = true;
      if (this.phase === 'waiting' && this.order.length === 2) {
        const allReady = this.order.every((id) => this.seats.get(id)?.ready);
        if (allReady) {
          this.phase = 'countdown';
          this.countdown = 3;
          this.countdownAccMs = 0;
        }
      }
      return;
    }

    if (msg.type === 'input' && this.phase === 'playing') {
      seat.engine.handleInput(msg.action as InputAction, msg.pressed);
    }
  }

  /**
   * 推进对局（由服务端按 tick 调用）。
   * @param dtMs 距上次调用的毫秒
   */
  update(dtMs: number): void {
    if (this.phase === 'countdown') {
      this.countdownAccMs += dtMs;
      while (this.countdownAccMs >= 1000 && this.phase === 'countdown') {
        this.countdownAccMs -= 1000;
        this.countdown -= 1;
        if (this.countdown <= 0) {
          this.phase = 'playing';
          this.startedAt = Date.now();
        }
      }
      return;
    }

    if (this.phase !== 'playing') return;

    // 时间到
    if (this.startedAt && Date.now() - this.startedAt >= this.durationMs) {
      this.finishByTime();
      return;
    }

    for (const id of this.order) {
      this.seats.get(id)?.engine.tick();
    }

    this.evaluateTopOut();
  }

  /**
   * 导出可网络传输的完整状态。
   */
  toState(): MatchState {
    const players = this.order.map((id) => this.seats.get(id)!.engine.getState());
    while (players.length < 2) {
      players.push(this.placeholderPlayer(players.length));
    }

    const remainingMs =
      this.phase === 'playing' && this.startedAt
        ? Math.max(0, this.durationMs - (Date.now() - this.startedAt))
        : this.phase === 'finished'
          ? 0
          : this.durationMs;

    return {
      roomId: this.roomId,
      phase: this.phase,
      players: players as [PlayerState, PlayerState],
      startedAt: this.startedAt,
      durationMs: this.durationMs,
      remainingMs,
      winnerId: this.winnerId,
      finishReason: this.finishReason,
      countdown: this.countdown,
      seed: this.seed,
    };
  }

  /**
   * 当前阶段。
   */
  getPhase(): MatchPhase {
    return this.phase;
  }

  /**
   * 是否已坐满两人。
   */
  isFull(): boolean {
    return this.order.length >= 2;
  }

  /**
   * 主动认输。
   */
  forfeit(playerId: string): void {
    if (this.phase !== 'playing') return;
    const other = this.order.find((id) => id !== playerId) ?? null;
    this.winnerId = other;
    this.finishReason = 'forfeit';
    this.phase = 'finished';
  }

  /**
   * 顶死判定：一方 alive=false，另一方获胜。
   */
  private evaluateTopOut(): void {
    if (this.order.length < 2) return;
    const [aId, bId] = this.order;
    const a = this.seats.get(aId)!.engine;
    const b = this.seats.get(bId)!.engine;
    const aAlive = a.isAlive();
    const bAlive = b.isAlive();
    if (aAlive && bAlive) return;
    if (!aAlive && !bAlive) {
      // 同时顶死：比分高者胜
      this.finishByScore('opponent_topped_out');
      return;
    }
    this.winnerId = aAlive ? aId : bId;
    this.finishReason = 'opponent_topped_out';
    this.phase = 'finished';
  }

  /**
   * 时间到比分判定。
   */
  private finishByTime(): void {
    this.finishByScore('time_up');
  }

  /**
   * 按分数决胜；平局 winnerId=null。
   */
  private finishByScore(reason: FinishReason): void {
    const [aId, bId] = this.order;
    const aScore = this.seats.get(aId)!.engine.getState().score;
    const bScore = this.seats.get(bId)!.engine.getState().score;
    if (aScore > bScore) this.winnerId = aId;
    else if (bScore > aScore) this.winnerId = bId;
    else this.winnerId = null;
    this.finishReason = reason;
    this.phase = 'finished';
  }

  /**
   * 占位玩家（房间未满时 UI 用）。
   */
  private placeholderPlayer(index: number): PlayerState {
    return {
      id: `empty-${index}`,
      name: '等待玩家…',
      board: createEmptyBoard(),
      active: null,
      nextQueue: [],
      hold: null,
      holdUsed: false,
      score: 0,
      lines: 0,
      level: 1,
      alive: true,
      softDropping: false,
      lockTicks: 0,
      moveResets: 0,
    };
  }
}
