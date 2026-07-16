/**
 * 单玩家引擎：生成、移动、旋转、软/硬降、锁定、级联重力、计分。
 * 服务端每名玩家持有一个实例；状态可序列化进 MatchState。
 */

import { SevenBag } from './bag.js';
import {
  canPlace,
  createEmptyBoard,
  lockCells,
  resolveCascade,
} from './board.js';
import { getAbsoluteCells, getKickTests, PIECE_COLOR } from './pieces.js';
import { deriveSeed } from './rng.js';
import {
  gravityG,
  levelFromLines,
  scoreForLines,
  scoreHardDrop,
  scoreSoftDrop,
} from './scoring.js';
import {
  BOARD_BUFFER,
  BOARD_WIDTH,
  LOCK_DELAY_TICKS,
  type ActivePiece,
  type InputAction,
  type PieceId,
  type PlayerState,
} from './types.js';

export interface PlayerEngineOptions {
  id: string;
  name: string;
  seed: number;
  /** 玩家序号盐，派生独立 bag */
  seat: number;
}

/**
 * 单玩家权威引擎。
 */
export class PlayerEngine {
  readonly id: string;
  name: string;
  private bag: SevenBag;
  private state: PlayerState;
  private gravityAcc = 0;
  /** 水平/旋转等输入后重置锁延 */
  private lockResetBudget = 15;

  constructor(opts: PlayerEngineOptions) {
    this.id = opts.id;
    this.name = opts.name;
    this.bag = new SevenBag(deriveSeed(opts.seed, opts.seat + 1));
    this.state = this.createInitialState();
    this.spawn();
  }

  /**
   * 读取可同步的玩家状态快照。
   */
  getState(): PlayerState {
    return {
      ...this.state,
      board: this.state.board.map((r) => r.slice()),
      nextQueue: this.state.nextQueue.slice(),
      active: this.state.active ? { ...this.state.active } : null,
    };
  }

  /**
   * 是否仍存活。
   */
  isAlive(): boolean {
    return this.state.alive;
  }

  /**
   * 处理离散输入（按下瞬间）。
   */
  handleInput(action: InputAction, pressed: boolean): void {
    if (!this.state.alive) return;

    if (action === 'softDrop') {
      this.state.softDropping = pressed;
      return;
    }
    if (action === 'softDropEnd') {
      this.state.softDropping = false;
      return;
    }
    if (!pressed) return;

    switch (action) {
      case 'left':
        this.tryMove(-1, 0);
        break;
      case 'right':
        this.tryMove(1, 0);
        break;
      case 'rotateCW':
        this.tryRotate(1);
        break;
      case 'rotateCCW':
        this.tryRotate(-1);
        break;
      case 'hardDrop':
        this.hardDrop();
        break;
      case 'hold':
        this.hold();
        break;
      default:
        break;
    }
  }

  /**
   * 固定逻辑帧推进（默认 50ms 一次）。
   */
  /**
   * 固定逻辑帧推进（默认 50ms 一次，≈3 个 60fps 帧）。
   */
  tick(): void {
    if (!this.state.alive || !this.state.active) return;

    const g = gravityG(this.state.level);
    this.gravityAcc += g * 3;
    // 软降：本 tick 至少尝试下落 1 格
    if (this.state.softDropping && this.gravityAcc < 1) {
      this.gravityAcc = 1;
    }

    let steps = 0;
    while (this.gravityAcc >= 1 && steps < 40) {
      this.gravityAcc -= 1;
      steps += 1;
      const moved = this.tryMove(0, 1);
      if (moved) {
        if (this.state.softDropping) {
          this.state.score += scoreSoftDrop(1);
        }
        this.state.lockTicks = 0;
      } else {
        if (this.gravityAcc > 1) this.gravityAcc = 0;
        this.state.lockTicks += 1;
        if (this.state.lockTicks >= LOCK_DELAY_TICKS) {
          this.lockActive();
        }
        break;
      }
    }
  }

  /**
   * 创建初始状态。
   */
  private createInitialState(): PlayerState {
    return {
      id: this.id,
      name: this.name,
      board: createEmptyBoard(),
      active: null,
      nextQueue: this.bag.peek(5),
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
   * 生成新活动方块；失败则顶死。
   */
  private spawn(forced?: PieceId): void {
    const id = forced ?? this.bag.next();
    this.state.nextQueue = this.bag.peek(5);
    const active: ActivePiece = {
      id,
      rotation: 0,
      // Guideline 风格：接近顶部中央
      x: Math.floor(BOARD_WIDTH / 2) - 1,
      y: BOARD_BUFFER - 1,
    };
    const cells = getAbsoluteCells(active.id, active.rotation, active.x, active.y);
    if (!canPlace(this.state.board, cells)) {
      this.state.active = null;
      this.state.alive = false;
      return;
    }
    this.state.active = active;
    this.state.holdUsed = false;
    this.state.lockTicks = 0;
    this.state.moveResets = 0;
    this.gravityAcc = 0;
    this.lockResetBudget = 15;
  }

  /**
   * 尝试平移；成功时若在地面则消耗锁延重置次数。
   */
  private tryMove(dx: number, dy: number): boolean {
    const a = this.state.active;
    if (!a) return false;
    const nx = a.x + dx;
    const ny = a.y + dy;
    const cells = getAbsoluteCells(a.id, a.rotation, nx, ny);
    if (!canPlace(this.state.board, cells)) return false;
    a.x = nx;
    a.y = ny;
    if (dx !== 0 || dy < 0) {
      this.resetLockDelay();
    }
    return true;
  }

  /**
   * 旋转（dir=1 顺时针，-1 逆时针），带简化 SRS 踢墙。
   */
  private tryRotate(dir: number): boolean {
    const a = this.state.active;
    if (!a) return false;
    const from = a.rotation;
    const to = (from + dir + 4) % 4;
    const kicks = getKickTests(a.id, from, to);
    for (const k of kicks) {
      // 简化：逆时针时水平踢墙镜像
      const kickX = dir > 0 ? k.x : -k.x;
      const kickY = k.y;
      const rx = a.x + kickX;
      const ry = a.y + kickY;
      const cells = getAbsoluteCells(a.id, to, rx, ry);
      if (canPlace(this.state.board, cells)) {
        a.x = rx;
        a.y = ry;
        a.rotation = to;
        this.resetLockDelay();
        return true;
      }
    }
    return false;
  }

  /**
   * 硬降：一降到底并立即锁定。
   */
  private hardDrop(): void {
    const a = this.state.active;
    if (!a) return;
    let dist = 0;
    while (this.tryMove(0, 1)) {
      dist += 1;
    }
    this.state.score += scoreHardDrop(dist);
    this.lockActive();
  }

  /**
   * Hold 交换。
   */
  private hold(): void {
    if (!this.state.active || this.state.holdUsed) return;
    const current = this.state.active.id;
    const swapped = this.state.hold;
    this.state.hold = current;
    this.state.holdUsed = true;
    this.state.active = null;
    this.spawn(swapped ?? undefined);
  }

  /**
   * 锁定活动方块 → 单格重力级联 → 计分 → 生成下一块。
   */
  private lockActive(): void {
    const a = this.state.active;
    if (!a) return;
    const cells = getAbsoluteCells(a.id, a.rotation, a.x, a.y);
    lockCells(this.state.board, cells, PIECE_COLOR[a.id]);
    this.state.active = null;

    // 定制规则：锁定后单格重力 + 消行连锁
    // 为体现连锁计分，分阶段：先重力，再循环消行
    const cascade = resolveCascade(this.state.board);
    if (cascade.lines > 0) {
      // 将总行数按连锁段粗略计分：每段至少 1 行
      // 简化：一次性按总行数 + chain 加成
      const gained = scoreForLines(Math.min(4, cascade.lines), this.state.level, cascade.chain);
      // 额外行（>4）按 200*level/行
      const extra =
        cascade.lines > 4
          ? (cascade.lines - 4) * 200 * this.state.level * Math.max(1, cascade.chain)
          : 0;
      this.state.score += gained + extra;
      this.state.lines += cascade.lines;
      this.state.level = levelFromLines(this.state.lines);
    }

    this.spawn();
  }

  /**
   * 地面时成功移动/旋转可重置锁定延迟（有限次数）。
   */
  private resetLockDelay(): void {
    if (this.lockResetBudget <= 0) return;
    // 仅当无法再下移时视为着地
    if (!this.canMove(0, 1)) {
      this.state.lockTicks = 0;
      this.lockResetBudget -= 1;
      this.state.moveResets += 1;
    }
  }

  /**
   * 只读检测是否可移动。
   */
  private canMove(dx: number, dy: number): boolean {
    const a = this.state.active;
    if (!a) return false;
    const cells = getAbsoluteCells(a.id, a.rotation, a.x + dx, a.y + dy);
    return canPlace(this.state.board, cells);
  }
}
