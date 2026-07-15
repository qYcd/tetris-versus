/**
 * 棋盘工具：创建、碰撞、消行、以及本项目定制的「单格重力 / 级联」。
 * 关键定制：锁定后固定块不再维持方块整体，每个有空隙的格子独立下落。
 */

import {
  BOARD_BUFFER,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  TOTAL_ROWS,
  type Cell,
  type Point,
} from './types.js';

/**
 * 创建空棋盘（含顶部隐藏缓冲行）。
 */
export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: TOTAL_ROWS }, () => Array<Cell>(BOARD_WIDTH).fill(0));
}

/**
 * 深拷贝棋盘。
 */
export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.slice());
}

/**
 * 判断一组绝对坐标是否全部合法且未占用。
 */
export function canPlace(board: Cell[][], cells: Point[]): boolean {
  for (const c of cells) {
    if (c.x < 0 || c.x >= BOARD_WIDTH) return false;
    if (c.y < 0 || c.y >= TOTAL_ROWS) return false;
    if (board[c.y][c.x] !== 0) return false;
  }
  return true;
}

/**
 * 将活动方块写入固定盘面。
 */
export function lockCells(board: Cell[][], cells: Point[], color: number): void {
  for (const c of cells) {
    if (c.y >= 0 && c.y < TOTAL_ROWS && c.x >= 0 && c.x < BOARD_WIDTH) {
      board[c.y][c.x] = color;
    }
  }
}

/**
 * 单列单格重力：该列中所有方块格子向下沉降，底部堆叠，上方留空。
 * 不跨列移动（标准“列内重力”），适合俄罗斯方块锁定后的空隙填充。
 */
export function applyColumnGravity(board: Cell[][]): boolean {
  let moved = false;
  for (let x = 0; x < BOARD_WIDTH; x += 1) {
    const stack: Cell[] = [];
    for (let y = TOTAL_ROWS - 1; y >= 0; y -= 1) {
      if (board[y][x] !== 0) stack.push(board[y][x]);
    }
    // 自底向上回填
    let write = TOTAL_ROWS - 1;
    for (const value of stack) {
      if (board[write][x] !== value) moved = true;
      board[write][x] = value;
      write -= 1;
    }
    while (write >= 0) {
      if (board[write][x] !== 0) moved = true;
      board[write][x] = 0;
      write -= 1;
    }
  }
  return moved;
}

/**
 * 逐步单格下落一拍：每个非空格若正下方为空则下落 1 格。
 * 比整列沉降更接近“有空隙就继续掉”，可做动画；对战权威逻辑可用整列版一次到位。
 */
export function stepCellGravity(board: Cell[][]): boolean {
  let moved = false;
  // 自底向上扫描，避免同帧多次下落
  for (let y = TOTAL_ROWS - 2; y >= 0; y -= 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (board[y][x] !== 0 && board[y + 1][x] === 0) {
        board[y + 1][x] = board[y][x];
        board[y][x] = 0;
        moved = true;
      }
    }
  }
  return moved;
}

/**
 * 清除所有满行，上方行下移（经典消行）。
 * 返回消除行数。注意：本项目在消行后还会再做单格重力级联。
 */
export function clearFullLines(board: Cell[][]): number {
  let cleared = 0;
  let writeRow = TOTAL_ROWS - 1;
  for (let y = TOTAL_ROWS - 1; y >= 0; y -= 1) {
    const full = board[y].every((cell) => cell !== 0);
    if (full) {
      cleared += 1;
      continue;
    }
    if (writeRow !== y) {
      board[writeRow] = board[y].slice();
    }
    writeRow -= 1;
  }
  while (writeRow >= 0) {
    board[writeRow] = Array<Cell>(BOARD_WIDTH).fill(0);
    writeRow -= 1;
  }
  return cleared;
}

/**
 * 锁定后的级联结算：
 * 1) 单格重力沉降空隙
 * 2) 消行
 * 3) 重复直到不再消行
 * 返回总消行数（可用于连锁计分）。
 */
export function resolveCascade(board: Cell[][]): { lines: number; chain: number } {
  let totalLines = 0;
  let chain = 0;
  // 先把锁定瞬间的空隙沉降
  applyColumnGravity(board);

  // 消行 + 再重力，直到稳定
  // 保护上限避免异常死循环
  for (let guard = 0; guard < 40; guard += 1) {
    const cleared = clearFullLines(board);
    if (cleared <= 0) break;
    totalLines += cleared;
    chain += 1;
    applyColumnGravity(board);
  }
  return { lines: totalLines, chain };
}

/**
 * 可见区域（去掉顶部缓冲）拷贝，供 UI 使用。
 */
export function visibleBoard(board: Cell[][]): Cell[][] {
  return board.slice(BOARD_BUFFER, BOARD_BUFFER + BOARD_HEIGHT).map((r) => r.slice());
}

/**
 * 判断是否顶出：固定块占用到缓冲可见分界附近的生成冲突由 spawn 检测；
 * 此函数检查可见区顶行之上缓冲是否残留固定块（可选严格模式）。
 */
export function hasBlocksInBuffer(board: Cell[][]): boolean {
  for (let y = 0; y < BOARD_BUFFER; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (board[y][x] !== 0) return true;
    }
  }
  return false;
}
