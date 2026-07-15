/**
 * 服务端运行配置（环境变量可覆盖）。
 */

import { DEFAULT_DURATION_MS, DEFAULT_TICK_MS } from '@tetris/shared';

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  durationMs: Number(process.env.MATCH_DURATION_MS ?? DEFAULT_DURATION_MS),
  tickMs: Number(process.env.TICK_MS ?? DEFAULT_TICK_MS),
};
