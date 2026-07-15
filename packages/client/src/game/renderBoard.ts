/**
 * 将棋盘状态与活动方块合并为可渲染的可见矩阵。
 */

import {
  BOARD_BUFFER,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  COLOR_HEX,
  getAbsoluteCells,
  PIECE_COLOR,
  type Cell,
  type PlayerState,
} from '@tetris/shared';

/**
 * 生成 20x10 可见盘面颜色值（含活动方块）。
 */
export function buildDisplayGrid(player: PlayerState): number[][] {
  const grid: number[][] = Array.from({ length: BOARD_HEIGHT }, () =>
    Array<number>(BOARD_WIDTH).fill(0),
  );

  // 固定块
  if (player.board.length >= BOARD_BUFFER + BOARD_HEIGHT) {
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        grid[y][x] = player.board[y + BOARD_BUFFER][x] ?? 0;
      }
    }
  }

  // 活动方块叠加上去
  if (player.active) {
    const cells = getAbsoluteCells(
      player.active.id,
      player.active.rotation,
      player.active.x,
      player.active.y,
    );
    const color = PIECE_COLOR[player.active.id];
    for (const c of cells) {
      const vy = c.y - BOARD_BUFFER;
      if (vy >= 0 && vy < BOARD_HEIGHT && c.x >= 0 && c.x < BOARD_WIDTH) {
        grid[vy][c.x] = color;
      }
    }
  }

  return grid;
}

/**
 * 颜色索引转 CSS 颜色。
 */
export function cellColor(value: Cell): string {
  return COLOR_HEX[value] ?? COLOR_HEX[0];
}

/**
 * 生成方块预览的 4x2/4x4 简易矩阵。
 */
export function previewMatrix(pieceId: string | null | undefined): number[][] {
  const empty = Array.from({ length: 2 }, () => Array<number>(4).fill(0));
  if (!pieceId) return empty;
  // 动态导入形状会循环依赖风险，这里用硬编码预览占位布局
  const map: Record<string, Array<[number, number]>> = {
    I: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
    O: [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ],
    T: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    S: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
    Z: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    J: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
    L: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  };
  const cells = map[pieceId] ?? [];
  const color = PIECE_COLOR[pieceId as keyof typeof PIECE_COLOR] ?? 0;
  const mat = Array.from({ length: 2 }, () => Array<number>(4).fill(0));
  for (const [x, y] of cells) {
    if (y >= 0 && y < 2 && x >= 0 && x < 4) mat[y][x] = color;
  }
  return mat;
}
