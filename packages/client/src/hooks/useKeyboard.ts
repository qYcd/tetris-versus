/**
 * 键盘输入映射：支持长按软降与 DAS 简化处理。
 */

import { useEffect, useRef } from 'react';
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

export interface KeyboardPauseOptions {
  enabledPause?: boolean;
  onTogglePause?: () => void;
}

/**
 * 绑定窗口键盘事件到游戏输入。
 * @param enabled 是否启用操作输入（playing）
 * @param onInput 操作回调
 * @param pauseOpts 暂停键（P / Esc），在 playing/paused 时可用
 */
export function useKeyboard(
  enabled: boolean,
  onInput: (action: InputAction, pressed: boolean) => void,
  pauseOpts?: KeyboardPauseOptions,
): void {
  const onInputRef = useRef(onInput);
  const pauseRef = useRef(pauseOpts);
  onInputRef.current = onInput;
  pauseRef.current = pauseOpts;

  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      // 暂停切换
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (pauseRef.current?.enabledPause && pauseRef.current.onTogglePause) {
          e.preventDefault();
          if (!e.repeat) pauseRef.current.onTogglePause();
        }
        return;
      }

      const action = KEY_MAP[e.code];
      if (!action) return;
      e.preventDefault();
      if (down.has(e.code)) return;
      down.add(e.code);
      onInputRef.current(action, true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      down.delete(e.code);
      if (action === 'softDrop') {
        onInputRef.current('softDrop', false);
        onInputRef.current('softDropEnd', false);
      } else {
        onInputRef.current(action, false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled]);
}
