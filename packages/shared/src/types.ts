/**
 * 共享类型定义：对战房间、玩家状态、网络协议。
 * 客户端与服务端必须使用同一份类型，避免同步漂移。
 */

/** 七种标准方块 ID（Guideline） */
export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 棋盘单元格：0 为空，>0 表示固定方块颜色索引 */
export type Cell = number;

/** 二维坐标（列 x，行 y，原点左上） */
export interface Point {
  x: number;
  y: number;
}

/** 当前操控中的活动方块 */
export interface ActivePiece {
  id: PieceId;
  /** 旋转状态 0..3（顺时针） */
  rotation: number;
  /** 方块旋转中心/锚点在棋盘上的位置 */
  x: number;
  y: number;
}

/** 单名玩家的完整对战状态 */
export interface PlayerState {
  id: string;
  name: string;
  /** 固定盘面，行优先 [row][col] */
  board: Cell[][];
  active: ActivePiece | null;
  /** 下一块预览队列（至少 1 个，可扩展到 5） */
  nextQueue: PieceId[];
  hold: PieceId | null;
  /** 本回合是否已使用 hold */
  holdUsed: boolean;
  score: number;
  lines: number;
  level: number;
  /** 是否仍存活 */
  alive: boolean;
  /** 是否处于软降 */
  softDropping: boolean;
  /** 锁定延迟计数（tick） */
  lockTicks: number;
  /** 连续重力未移动时的锁定相关计数 */
  moveResets: number;
}

/** 对局阶段 */
export type MatchPhase = 'waiting' | 'countdown' | 'playing' | 'finished';

/** 对局结束原因 */
export type FinishReason = 'opponent_topped_out' | 'time_up' | 'forfeit' | 'disconnect';

/** 整场对战快照（权威状态在服务端） */
export interface MatchState {
  roomId: string;
  phase: MatchPhase;
  players: [PlayerState, PlayerState];
  /** 对局开始时间戳 ms */
  startedAt: number | null;
  /** 限时毫秒，默认 10 分钟 */
  durationMs: number;
  /** 剩余毫秒（服务端推送时填充） */
  remainingMs: number;
  winnerId: string | null;
  finishReason: FinishReason | null;
  /** 倒计时秒数（phase=countdown） */
  countdown: number;
  seed: number;
}

/** 客户端输入动作 */
export type InputAction =
  | 'left'
  | 'right'
  | 'softDrop'
  | 'hardDrop'
  | 'rotateCW'
  | 'rotateCCW'
  | 'hold'
  | 'softDropEnd';

/** 客户端 → 服务端消息 */
export type ClientMessage =
  | { type: 'join'; name: string; roomId?: string }
  | { type: 'ready' }
  | { type: 'input'; action: InputAction; pressed: boolean }
  | { type: 'ping'; t: number }
  | { type: 'leave' };

/** 服务端 → 客户端消息 */
export type ServerMessage =
  | { type: 'welcome'; playerId: string; roomId: string }
  | { type: 'state'; state: MatchState }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number }
  | { type: 'info'; message: string };

/** 棋盘几何常量 */
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
/** 隐藏行（生成/旋转缓冲），渲染时可不显示 */
export const BOARD_BUFFER = 2;
export const TOTAL_ROWS = BOARD_HEIGHT + BOARD_BUFFER;

/** 默认对局时长：10 分钟 */
export const DEFAULT_DURATION_MS = 10 * 60 * 1000;

/** 锁定延迟（重力 tick 次数，约 500ms@50ms） */
export const LOCK_DELAY_TICKS = 10;

/** 服务端逻辑 tick */
export const DEFAULT_TICK_MS = 50;
