/**
 * 大厅：填写昵称、服务器地址、房间号，发起匹配/加入。
 */

import { useMemo, useState } from 'react';

interface Props {
  connecting: boolean;
  error: string;
  onJoin: (serverUrl: string, name: string, roomId?: string) => void;
}

/**
 * 默认 WebSocket 地址（本机服务端）。
 */
function defaultServerUrl(): string {
  // Electron/Web 统一默认连本机权威服务
  return 'ws://127.0.0.1:8787';
}

/**
 * 对战大厅表单。
 */
export function Lobby({ connecting, error, onJoin }: Props) {
  const [name, setName] = useState(() => `玩家${Math.floor(Math.random() * 90 + 10)}`);
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [roomId, setRoomId] = useState('');

  const canSubmit = useMemo(() => name.trim().length > 0 && serverUrl.trim().length > 0, [name, serverUrl]);

  return (
    <div className="lobby">
      <h1>Tetris Versus</h1>
      <p>
        双人联网积分对战 · 核心规则由 C 引擎驱动 · 7-bag 洗牌 · 锁定后单格重力级联 · 一方顶出或 10 分钟比分决胜。
        Electron 客户端可在 macOS / Windows 同时运行。
      </p>

      <div className="form-grid">
        <label className="form-row">
          <span>昵称</span>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="你的名字" />
        </label>
        <label className="form-row">
          <span>服务器 WebSocket</span>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="ws://127.0.0.1:8787"
          />
        </label>
        <label className="form-row">
          <span>房间号（可空=自动匹配）</span>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            placeholder="例如 AB12CD"
          />
        </label>
        <div className="form-actions">
          <button
            className="primary"
            disabled={!canSubmit || connecting}
            onClick={() => onJoin(serverUrl.trim(), name.trim(), roomId.trim() || undefined)}
          >
            {connecting ? '连接中…' : roomId.trim() ? '加入房间' : '快速匹配'}
          </button>
        </div>
        {error ? <div className="banner danger">{error}</div> : null}
      </div>

      <div className="help-box">
        <strong>操作（本机控制自己的盘面）</strong>
        <br />
        移动：← → 或 A D　旋转：↑ / W / X（顺） Z（逆）　软降：↓ / S
        <br />
        硬降：Space　Hold：C
        <br />
        <strong>规则要点</strong>
        <br />
        当前操控方块仍整体移动/旋转；锁定后固定格按列单格下落填补空隙，消行可连锁计分。
        <br />
        胜负：对方顶出即胜；满 10 分钟比分高者胜。
      </div>
    </div>
  );
}
