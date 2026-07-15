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
 * 根据等级返回重力间隔（逻辑 tick 数）。
 * level 1 ≈ 20 ticks * 50ms = 1s；随等级加快，下限 2 ticks。
 */
export function gravityIntervalTicks(level: number): number {
  return Math.max(2, 21 - level);
}
