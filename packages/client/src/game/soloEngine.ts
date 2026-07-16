/**
 * 单人练习引擎（前端本地）。
 * 使用 shared 的 PlayerEngine，不依赖网络，适合安装包内“单人练习”。
 */

import {
  PlayerEngine,
  type InputAction,
  type MatchState,
  type PlayerState,
} from '@tetris/shared';

/**
 * 创建空对手占位，便于复用双人 UI。
 */
function emptyOpponent(): PlayerState {
  return {
    id: 'cpu',
    name: '练习模式',
    board: [],
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

/**
 * 单人练习控制器。
 */
export class SoloController {
  private engine: PlayerEngine;
  private startedAt: number;
  private durationMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onState: (state: MatchState) => void;

  constructor(opts: {
    name: string;
    durationMs?: number;
    onState: (state: MatchState) => void;
  }) {
    this.durationMs = opts.durationMs ?? 10 * 60 * 1000;
    this.startedAt = Date.now();
    this.onState = opts.onState;
    this.engine = new PlayerEngine({
      id: 'P1',
      name: opts.name || '练习玩家',
      seed: Date.now() >>> 0,
      seat: 0,
    });
  }

  /**
   * 开始本地 tick。
   */
  start(): void {
    this.emit();
    this.timer = setInterval(() => {
      this.engine.tick();
      this.emit();
    }, 50);
  }

  /**
   * 处理输入。
   */
  input(action: InputAction, pressed: boolean): void {
    this.engine.handleInput(action, pressed);
    this.emit();
  }

  /**
   * 停止并清理。
   */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * 导出与联网模式兼容的 MatchState。
   */
  private emit(): void {
    const me = this.engine.getState();
    const remaining = Math.max(0, this.durationMs - (Date.now() - this.startedAt));
    const finished = !me.alive || remaining <= 0;
    const state: MatchState = {
      roomId: 'SOLO',
      phase: finished ? 'finished' : 'playing',
      players: [me, emptyOpponent()],
      startedAt: this.startedAt,
      durationMs: this.durationMs,
      remainingMs: remaining,
      winnerId: finished ? me.id : null,
      finishReason: !me.alive ? 'opponent_topped_out' : remaining <= 0 ? 'time_up' : null,
      countdown: 0,
      seed: 0,
    };
    this.onState(state);
  }
}
