/**
 * C 引擎 Node 绑定类型声明。
 */

export interface EngineMatch {
  /** 内部原生句柄 id */
  readonly handle: number;
  /** 加入玩家，最多 2 人。返回 playerId */
  addPlayer(name: string): string;
  /** 标记玩家就绪 */
  ready(playerId: string): void;
  /** 切换暂停/继续（无上限） */
  pause(): void;
  /** 发送输入动作 */
  input(playerId: string, action: string, pressed: boolean): void;
  /** 推进 dt 毫秒逻辑 */
  update(dtMs: number): void;
  /** 导出与前端兼容的状态对象 */
  getState(): any;
  /** 主动离开/认输 */
  forfeit(playerId: string): void;
  /** 释放原生资源 */
  destroy(): void;
}

/** 创建一局对战（时长默认 10 分钟） */
export function createMatch(roomId: string, durationMs?: number, seed?: number): EngineMatch;

/** 引擎版本字符串 */
export function engineVersion(): string;
