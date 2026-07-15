/**
 * 7-bag（Random Generator）洗牌算法。
 * 每 7 次生成覆盖 I,O,T,S,Z,J,L 各一次，袋空后重新洗牌。
 */

import { ALL_PIECES } from './pieces.js';
import type { PieceId } from './types.js';
import { createRng } from './rng.js';

/**
 * 7-bag 生成器：内部维护袋与预览队列。
 */
export class SevenBag {
  private bag: PieceId[] = [];
  private queue: PieceId[] = [];
  private readonly rng: () => number;
  private readonly previewSize: number;

  constructor(seed: number, previewSize = 5) {
    this.rng = createRng(seed);
    this.previewSize = previewSize;
    this.refillQueue();
  }

  /**
   * 取出下一个方块，并维持预览队列长度。
   */
  next(): PieceId {
    this.refillQueue();
    const id = this.queue.shift();
    if (!id) {
      throw new Error('7-bag 队列异常为空');
    }
    this.refillQueue();
    return id;
  }

  /**
   * 查看当前预览队列（只读拷贝）。
   */
  peek(count = this.previewSize): PieceId[] {
    this.refillQueue();
    return this.queue.slice(0, count);
  }

  /**
   * 袋空则 Fisher–Yates 洗入新的 7 种方块。
   */
  private refillBag(): void {
    if (this.bag.length > 0) return;
    this.bag = [...ALL_PIECES];
    for (let i = this.bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = this.bag[i];
      this.bag[i] = this.bag[j];
      this.bag[j] = tmp;
    }
  }

  /**
   * 保证预览队列至少 previewSize。
   */
  private refillQueue(): void {
    while (this.queue.length < this.previewSize + 1) {
      this.refillBag();
      const id = this.bag.pop();
      if (!id) break;
      this.queue.push(id);
    }
  }
}
