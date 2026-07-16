/**
 * 单人练习引擎（前端本地）。
 * 使用 shared 的 PlayerEngine，不依赖网络，适合安装包内“单人练习”。
 */

import {
  createEmptyBoard,
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

/**
 * 单人练习控制器。
 */
export class SoloController {
  private engine: PlayerEngine;
  private startedAt: number | null = null;
  private durationMs: number;
  private elapsedMs = 0;
  private phase: MatchState['phase'] = 'playing';
  private timer: ReturnType<typeof setInterval> | null = null;
  private onState: (state: MatchState) => void;
  private seed: number;

  constructor(opts: {
    name: string;
    durationMs?: number;
    onState: (state: MatchState) => void;
  }) {
    // 最少 1 分钟
    this.durationMs = Math.max(60_000, opts.durationMs ?? 10 * 60 * 1000);
    this.onState = opts.onState;
    this.seed = Date.now() >>> 0;
    this.engine = new PlayerEngine({
      id: 'P1',
      name: opts.name || '练习玩家',
      seed: this.seed,
      seat: 0,
    });
  }

  /**
   * 开始本地 tick。
   */
  start(): void {
    this.startedAt = Date.now();
    this.elapsedMs = 0;
    this.phase = 'playing';
    this.emit();
    this.timer = setInterval(() => {
      // 暂停时不推进
      if (this.phase === 'paused') {
        this.emit();
        return;
      }
      if (this.phase !== 'playing') return;

      this.elapsedMs += 50;
      if (this.elapsedMs >= this.durationMs) {
        this.phase = 'finished';
        this.emit();
        return;
      }

      this.engine.tick();
      if (!this.engine.isAlive()) {
        this.phase = 'finished';
      }
      this.emit();
    }, 50);
  }

  /**
   * 处理输入；暂停时忽略。
   */
  input(action: InputAction, pressed: boolean): void {
    if (this.phase !== 'playing') return;
    this.engine.handleInput(action, pressed);
    this.emit();
  }

  /**
   * 切换暂停/继续，无次数上限。
   */
  togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.emit();
      return;
    }
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.emit();
    }
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
    const remaining =
      this.phase === 'playing' || this.phase === 'paused'
        ? Math.max(0, this.durationMs - this.elapsedMs)
        : this.phase === 'finished'
          ? 0
          : this.durationMs;
    const state: MatchState = {
      roomId: 'SOLO',
      phase: this.phase,
      players: [me, emptyOpponent()],
      startedAt: this.startedAt,
      durationMs: this.durationMs,
      remainingMs: remaining,
      winnerId: this.phase === 'finished' ? me.id : null,
      finishReason:
        this.phase === 'finished'
          ? !me.alive
            ? 'opponent_topped_out'
            : 'time_up'
          : null,
      countdown: 0,
      seed: this.seed,
    };
    this.onState(state);
  }
}
