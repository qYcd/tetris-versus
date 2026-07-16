/**
 * 统一应用：
 * - 当房主开房（内嵌服务端）
 * - 加入房间
 * - 单人练习
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InputAction, MatchState } from '@tetris/shared';
import { Battle } from './components/Battle';
import { Lobby } from './components/Lobby';
import { SoloController } from './game/soloEngine';
import { useGameSocket } from './hooks/useGameSocket';
import { useKeyboard } from './hooks/useKeyboard';

type RuntimeMode = 'online' | 'solo';

/**
 * 根应用。
 */
export function App() {
  const socket = useGameSocket();
  const [bootstrap, setBootstrap] = useState<TetrisBootstrap | null>(null);
  const [runtime, setRuntime] = useState<RuntimeMode>('online');
  const [soloState, setSoloState] = useState<MatchState | null>(null);
  const soloRef = useRef<SoloController | null>(null);

  const refreshBootstrap = useCallback(async () => {
    if (!window.tetrisApp?.getBootstrap) return;
    const info = await window.tetrisApp.getBootstrap();
    setBootstrap(info);
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    return () => {
      soloRef.current?.stop();
      soloRef.current = null;
    };
  }, []);

  const inOnlineRoom = runtime === 'online' && Boolean(socket.roomId && socket.state);
  const inSolo = runtime === 'solo' && Boolean(soloState);
  const playing =
    (runtime === 'online' && socket.state?.phase === 'playing') ||
    (runtime === 'solo' && soloState?.phase === 'playing');
  const canPause =
    (runtime === 'online' &&
      (socket.state?.phase === 'playing' || socket.state?.phase === 'paused')) ||
    (runtime === 'solo' &&
      (soloState?.phase === 'playing' || soloState?.phase === 'paused'));

  const onInput = useCallback(
    (action: InputAction, pressed: boolean) => {
      if (runtime === 'solo') {
        soloRef.current?.input(action, pressed);
        return;
      }
      // 暂停中不转发操作输入
      if (socket.state?.phase === 'paused') return;
      socket.sendInput(action, pressed);
    },
    [runtime, socket],
  );

  /**
   * 切换暂停（单人本地 / 联网发 pause 消息）。
   */
  const onTogglePause = useCallback(() => {
    if (runtime === 'solo') {
      soloRef.current?.togglePause();
      return;
    }
    socket.sendPause();
  }, [runtime, socket]);

  // 游戏中与暂停中都监听键盘：操作仅 playing，暂停键在 canPause 时生效
  useKeyboard(Boolean(playing || canPause), onInput, {
    enabledPause: Boolean(canPause),
    onTogglePause,
  });

  const platform = useMemo(() => {
    return bootstrap?.platform || window.tetrisApp?.platform || navigator.platform || 'web';
  }, [bootstrap]);

  async function startHost(name: string, roomId?: string, durationMinutes = 10) {
    const minutes = Math.min(60, Math.max(1, Math.floor(durationMinutes || 10)));
    const durationMs = minutes * 60 * 1000;
    if (!window.tetrisApp?.startHost) {
      // 网页调试回退：假定本机已有服务
      socket.connectAndJoin('ws://127.0.0.1:8787', name, roomId);
      setRuntime('online');
      return;
    }
    try {
      const info = await window.tetrisApp.startHost({ durationMs });
      setBootstrap(info);
      const wsUrl = info.host.localWs || 'ws://127.0.0.1:8787';
      // 稍等服务起来
      await new Promise((r) => setTimeout(r, 120));
      socket.connectAndJoin(wsUrl, name, roomId);
      setRuntime('online');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 开发态常见：旧主进程未重载，提示完整重启 Electron
      throw new Error(
        msg.includes('No handler registered')
          ? '主进程未注册 startHost。请完全退出 Electron 后执行 npm run dev:client 重启。'
          : msg,
      );
    }
  }

  function startSolo(name: string, durationMinutes = 10) {
    const minutes = Math.min(60, Math.max(1, Math.floor(durationMinutes || 10)));
    soloRef.current?.stop();
    const ctrl = new SoloController({
      name,
      durationMs: minutes * 60 * 1000,
      onState: setSoloState,
    });
    soloRef.current = ctrl;
    setRuntime('solo');
    ctrl.start();
  }

  function leaveAll() {
    if (runtime === 'solo') {
      soloRef.current?.stop();
      soloRef.current = null;
      setSoloState(null);
      setRuntime('online');
      return;
    }
    socket.disconnect();
  }

  const statusText = (() => {
    if (runtime === 'solo') return soloState?.phase === 'finished' ? '练习结束' : '单人练习中';
    if (socket.status === 'connected') return `已连接${socket.roomId ? ` · 房间 ${socket.roomId}` : ''}`;
    if (socket.status === 'connecting') return '连接中';
    if (socket.status === 'error') return '连接错误';
    return '未连接';
  })();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>TETRIS VERSUS</strong>
          <span>开房 / 加入 / 单人 · {platform}</span>
        </div>
        <div className="status-pill">
          <span
            className={`dot ${
              runtime === 'solo' || socket.status === 'connected' ? 'on' : ''
            }`}
          />
          {statusText}
        </div>
      </header>

      <main className="main">
        {!inOnlineRoom && !inSolo ? (
          <Lobby
            connecting={socket.status === 'connecting'}
            error={socket.error}
            bootstrap={bootstrap}
            onRefreshBootstrap={refreshBootstrap}
            onStartHost={startHost}
            onJoin={(url, name, roomId) => {
              setRuntime('online');
              socket.connectAndJoin(url, name, roomId);
            }}
            onSolo={startSolo}
          />
        ) : null}

        {inOnlineRoom && socket.state ? (
          <Battle
            state={socket.state}
            selfId={socket.playerId}
            info={socket.info}
            onReady={socket.ready}
            onLeave={leaveAll}
          />
        ) : null}

        {inSolo && soloState ? (
          <Battle
            state={soloState}
            selfId="P1"
            info="单人练习：本地运行，不消耗网络"
            onReady={() => undefined}
            onLeave={leaveAll}
          />
        ) : null}
      </main>
    </div>
  );
}
