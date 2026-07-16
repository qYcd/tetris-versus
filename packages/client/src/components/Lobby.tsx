/**
 * 统一大厅：
 * 1) 当房主开房
 * 2) 加入房间
 * 3) 单人练习
 */

import { useEffect, useMemo, useState } from 'react';

export type PlayMode = 'menu' | 'host' | 'join' | 'solo';

interface Props {
  connecting: boolean;
  error: string;
  bootstrap?: TetrisBootstrap | null;
  onRefreshBootstrap?: () => Promise<void> | void;
  onStartHost: (name: string, roomId?: string) => Promise<void> | void;
  onJoin: (serverUrl: string, name: string, roomId?: string) => void;
  onSolo: (name: string) => void;
}

/**
 * 统一入口大厅。
 */
export function Lobby({
  connecting,
  error,
  bootstrap,
  onRefreshBootstrap,
  onStartHost,
  onJoin,
  onSolo,
}: Props) {
  const [mode, setMode] = useState<PlayMode>('menu');
  const [name, setName] = useState(() => `玩家${Math.floor(Math.random() * 90 + 10)}`);
  const [serverUrl, setServerUrl] = useState('ws://192.168.1.8:8787');
  const [roomId, setRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (bootstrap?.host?.lanWs) {
      // 给加入模式一个合理默认，不强制覆盖用户输入
      setServerUrl((prev) => (prev.includes('192.168.') ? prev : bootstrap.host.lanWs));
    }
  }, [bootstrap]);

  const canSubmit = useMemo(() => name.trim().length > 0, [name]);

  async function handleHost() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setLocalError('');
    try {
      await onStartHost(name.trim(), roomId.trim() || undefined);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lobby">
      <h1>Tetris Versus</h1>
      <p>一个安装包完成全部玩法：当房主、加入房间、单人练习。</p>

      {mode === 'menu' ? (
        <div className="form-grid">
          <label className="form-row">
            <span>昵称</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="form-actions" style={{ display: 'grid', gap: 10 }}>
            <button className="primary" disabled={!canSubmit} onClick={() => setMode('host')}>
              当房主开房（双人对战）
            </button>
            <button disabled={!canSubmit} onClick={() => setMode('join')}>
              加入房间
            </button>
            <button disabled={!canSubmit} onClick={() => onSolo(name.trim())}>
              单人练习
            </button>
          </div>
          <div className="help-box">
            <strong>推荐双人流程</strong>
            <br />
            1. A 选择“当房主开房”
            <br />
            2. 把显示的局域网地址发给 B
            <br />
            3. B 选择“加入房间”并填写该地址
            <br />
            4. 双方 Ready 开始
          </div>
        </div>
      ) : null}

      {mode === 'host' ? (
        <div className="form-grid">
          <div className="banner">
            <div>
              本机地址：<strong>{bootstrap?.host?.localWs || 'ws://127.0.0.1:8787'}</strong>
            </div>
            <div>
              给对手的地址：<strong>{bootstrap?.host?.lanWs || '启动后显示'}</strong>
            </div>
            <div style={{ marginTop: 6, color: 'var(--muted)' }}>
              服务状态：{bootstrap?.host?.running ? '已启动' : '点击下方后启动'}
              {bootstrap?.host?.engineKind ? ` · 引擎 ${bootstrap.host.engineKind}` : ''}
            </div>
          </div>
          <label className="form-row">
            <span>昵称</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="form-row">
            <span>房间号（可空）</span>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="例如 AB12CD"
            />
          </label>
          <div className="form-actions">
            <button className="primary" disabled={!canSubmit || busy || connecting} onClick={handleHost}>
              {busy || connecting ? '启动中…' : '启动并进入房间'}
            </button>
            <button
              onClick={async () => {
                await onRefreshBootstrap?.();
                setMode('menu');
              }}
            >
              返回
            </button>
          </div>
          {(localError || error) && <div className="banner danger">{localError || error}</div>}
        </div>
      ) : null}

      {mode === 'join' ? (
        <div className="form-grid">
          <label className="form-row">
            <span>昵称</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="form-row">
            <span>房主服务器地址</span>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="ws://192.168.1.8:8787"
            />
          </label>
          <label className="form-row">
            <span>房间号（可空）</span>
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="例如 AB12CD"
            />
          </label>
          <div className="form-actions">
            <button
              className="primary"
              disabled={!canSubmit || !serverUrl.trim() || connecting}
              onClick={() => onJoin(serverUrl.trim(), name.trim(), roomId.trim() || undefined)}
            >
              {connecting ? '连接中…' : '加入房间'}
            </button>
            <button onClick={() => setMode('menu')}>返回</button>
          </div>
          {error ? <div className="banner danger">{error}</div> : null}
        </div>
      ) : null}

      <div className="help-box" style={{ marginTop: 18 }}>
        操作：← → / A D 移动；↑ W X 顺时针；Z 逆时针；↓ S 软降；Space 硬降；C Hold
      </div>
    </div>
  );
}
