/**
 * 键盘控制：将按键映射为对战输入动作。
 * 说明：双人同屏时双方在各自客户端操作自己的盘面（联网对战），
 * 因此每个客户端只发送“本机玩家”输入。
 */

import { useEffect } from 'react';
import type { InputAction } from '@tetris/shared';

const KEY_MAP: Record<string, InputAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'softDrop',
  ArrowUp: 'rotateCW',
  KeyZ: 'rotateCCW',
  KeyX: 'rotateCW',
  Space: 'hardDrop',
  KeyC: 'hold',
  KeyA: 'left',
  KeyD: 'right',
  KeyS: 'softDrop',
  KeyW: 'rotateCW',
};

/**
 * 绑定全局键盘事件。
 */
export function useKeyboard(
  enabled: boolean,
  onInput: (action: InputAction, pressed: boolean) => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const down = new Set<string>();

    const handleDown = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (down.has(e.code)) return; // 忽略系统长按重复，软降靠 pressed 状态
      down.add(e.code);
      onInput(action, true);
    };

    const handleUp = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      down.delete(e.code);
      if (action === 'softDrop') {
        onInput('softDrop', false);
        onInput('softDropEnd', false);
      }
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, [enabled, onInput]);
}
