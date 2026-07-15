/**
 * 应用根组件：大厅 ↔ 对战，绑定键盘与 WebSocket。
 */

import { useMemo } from 'react';
import { Battle } from './components/Battle';
import { Lobby } from './components/Lobby';
import { useGameSocket } from './hooks/useGameSocket';
import { useKeyboard } from './hooks/useKeyboard';

/**
 * 根应用。
 */
export function App() {
  const socket = useGameSocket();

  const inRoom = Boolean(socket.roomId && socket.state);
  const playing = socket.state?.phase === 'playing';

  useKeyboard(Boolean(playing), socket.sendInput);

  const platform = useMemo(() => {
    const app = (window as unknown as { tetrisApp?: { platform?: string } }).tetrisApp;
    return app?.platform ?? navigator.platform ?? 'web';
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>TETRIS VERSUS</strong>
          <span>跨平台双人对战 · {platform}</span>
        </div>
        <div className="status-pill">
          <span className={`dot ${socket.status === 'connected' ? 'on' : ''}`} />
          {socket.status === 'connected'
            ? `已连接${socket.roomId ? ` · 房间 ${socket.roomId}` : ''}`
            : socket.status === 'connecting'
              ? '连接中'
              : socket.status === 'error'
                ? '连接错误'
                : '未连接'}
        </div>
      </header>

      <main className="main">
        {!inRoom ? (
          <Lobby
            connecting={socket.status === 'connecting'}
            error={socket.error}
            onJoin={socket.connectAndJoin}
          />
        ) : socket.state ? (
          <Battle
            state={socket.state}
            selfId={socket.playerId}
            info={socket.info}
            onReady={socket.ready}
            onLeave={socket.disconnect}
          />
        ) : null}
      </main>

      {socket.info && !inRoom ? (
        <div className="overlay-msg">
          <span>{socket.info}</span>
        </div>
      ) : null}
    </div>
  );
}
