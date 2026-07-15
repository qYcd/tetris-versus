/**
 * 可复现的伪随机数（Mulberry32）。
 * 服务端用 seed 驱动双方独立 7-bag，保证可回放与公平性。
 */

/**
 * 创建 0..1 浮点随机函数。
 */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 从种子派生玩家专属种子，避免双方队列完全相同（可选）。
 * 当前对战采用“各自独立 bag”，更公平且策略独立。
 */
export function deriveSeed(base: number, salt: number): number {
  return (Math.imul(base ^ 0x9e3779b9, 0x85ebca6b) + salt) >>> 0;
}
