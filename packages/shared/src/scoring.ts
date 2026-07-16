/**
 * 计分与等级：参考 Guideline 思路的简化版，并加入连锁加成。
 */

/**
 * 基础消行分（单次 cascade 步骤内的 lines）。
 * 1/2/3/4 行对应 100/300/500/800 * level。
 */
export function scoreForLines(lines: number, level: number, chainIndex: number): number {
  if (lines <= 0) return 0;
  const table: Record<number, number> = {
    1: 100,
    2: 300,
    3: 500,
    4: 800,
  };
  const base = (table[lines] ?? lines * 200) * Math.max(1, level);
  // 连锁：第 2 段起 +50% * (chainIndex)
  const chainBonus = chainIndex > 1 ? Math.floor(base * 0.5 * (chainIndex - 1)) : 0;
  return base + chainBonus;
}

/**
 * 软降：每下移 1 格 +1 分。
 */
export function scoreSoftDrop(cells: number): number {
  return Math.max(0, cells);
}

/**
 * 硬降：每下移 1 格 +2 分。
 */
export function scoreHardDrop(cells: number): number {
  return Math.max(0, cells) * 2;
}

/**
 * 等级：每清 10 行升 1 级，从 1 起。
 */
export function levelFromLines(totalLines: number): number {
  return Math.floor(totalLines / 10) + 1;
}

/**
 * 活动块重力 G（格/60fps帧），与 C 引擎 te_gravity_g 一致：
 * G = 1 / max(1, 16*(5 - floor(log2(l))) - l / 2^floor(log2(l)))
 */
export function gravityG(level: number): number {
  const l = Math.max(1, Math.floor(level));
  const fl = Math.floor(Math.log2(l));
  const base = 2 ** fl;
  const den = Math.max(1, 16 * (5 - fl) - l / base);
  return 1 / den;
}

/**
 * 兼容旧接口：将 G 映射为大约多少个 50ms tick 落 1 格。
 * 新逻辑请优先使用 gravityG + 累计器。
 */
export function gravityIntervalTicks(level: number): number {
  const g = gravityG(level);
  // 每 tick 增加 g*3，约 1/(g*3) 个 tick 落一格
  return Math.max(1, Math.round(1 / (g * 3)));
}
