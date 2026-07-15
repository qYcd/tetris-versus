/**
 * Guideline 风格方块定义与旋转矩阵。
 * 旋转使用各形态的占用格列表，并配合 SRS 踢墙表。
 */

import type { PieceId, Point } from './types.js';

/** 方块颜色索引（固定到棋盘时使用） */
export const PIECE_COLOR: Record<PieceId, number> = {
  I: 1,
  O: 2,
  T: 3,
  S: 4,
  Z: 5,
  J: 6,
  L: 7,
};

export const COLOR_HEX: Record<number, string> = {
  0: '#0b1020',
  1: '#00f0f0', // I cyan
  2: '#f0f000', // O yellow
  3: '#a000f0', // T purple
  4: '#00f000', // S green
  5: '#f00000', // Z red
  6: '#0000f0', // J blue
  7: '#f0a000', // L orange
};

/**
 * 每种方块 4 个旋转态的相对坐标（以 spawn 习惯对齐 Guideline JLSTZ / I / O）。
 * 坐标系：x 向右，y 向下。
 */
const SHAPES: Record<PieceId, Point[][]> = {
  I: [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ],
    [
      { x: 1, y: -1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
    ],
    [
      { x: -1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
    ],
  ],
  O: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  ],
  T: [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
    ],
  ],
  S: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
      { x: 0, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
  ],
  Z: [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 1, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: 1, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ],
  ],
  J: [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: -1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: -1 },
    ],
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
    ],
  ],
  L: [
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: -1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    [
      { x: -1, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 1 },
    ],
    [
      { x: 0, y: -1 },
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: -1 },
    ],
  ],
};

/** JLSTZ 的 SRS 踢墙偏移（from rotation -> to rotation 简化为按目标态索引） */
const JLSTZ_KICKS: Point[][] = [
  // 0>>1 / 1>>0 等：这里用统一尝试序列（含 (0,0)）
  [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: 2 },
    { x: -1, y: 2 },
  ],
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ],
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: -1 },
    { x: 0, y: 2 },
    { x: 1, y: 2 },
  ],
  [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: -1, y: -1 },
    { x: 0, y: 2 },
    { x: -1, y: 2 },
  ],
];

const I_KICKS: Point[][] = [
  [
    { x: 0, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 1 },
    { x: 1, y: -2 },
  ],
  [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: -1 },
    { x: -1, y: 2 },
  ],
  [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 2, y: 0 },
    { x: -1, y: -2 },
    { x: 2, y: 1 },
  ],
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 1, y: 2 },
    { x: -2, y: -1 },
  ],
];

/**
 * 获取方块在某旋转态下的相对占用格。
 */
export function getShapeCells(id: PieceId, rotation: number): Point[] {
  const shapes = SHAPES[id];
  return shapes[((rotation % 4) + 4) % 4].map((p) => ({ x: p.x, y: p.y }));
}

/**
 * 将相对坐标映射为棋盘绝对坐标。
 */
export function getAbsoluteCells(id: PieceId, rotation: number, x: number, y: number): Point[] {
  return getShapeCells(id, rotation).map((p) => ({ x: x + p.x, y: y + p.y }));
}

/**
 * 获取旋转踢墙尝试列表（含 (0,0)）。
 * 说明：第一版采用简化 SRS 表，足够支撑对战手感，后续可换成完整 0>>1 状态对表。
 */
export function getKickTests(id: PieceId, fromRot: number, _toRot: number): Point[] {
  if (id === 'O') return [{ x: 0, y: 0 }];
  const idx = ((fromRot % 4) + 4) % 4;
  if (id === 'I') return I_KICKS[idx];
  return JLSTZ_KICKS[idx];
}

/** 所有方块 ID，供 7-bag 使用 */
export const ALL_PIECES: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
