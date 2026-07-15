/**
 * 对战主界面：并排双盘 + 中控状态 + Ready。
 */

import type { MatchState } from '@tetris/shared';
import { BoardView } from './BoardView';

interface Props {
  state: MatchState;
  selfId: string | null;
  info: string;
  onReady: () => void;
  onLeave: () => void;
}

/**
 * 格式化剩余时间 mm:ss。
 */
function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * 对战视图。
 */
export function Battle({ state, selfId, info, onReady, onLeave }: Props) {
  const [p0, p1] = state.players;
  const phaseText =
    state.phase === 'waiting'
      ? '等待双方 Ready'
      : state.phase === 'countdown'
        ? `倒计时 ${state.countdown}`
        : state.phase === 'playing'
          ? '对战中'
          : '已结束';

  const winnerName =
    state.winnerId == null
      ? '平局'
      : state.players.find((p) => p.id === state.winnerId)?.name ?? '未知';

  return (
    <div className="battle">
      <BoardView player={p0} isSelf={p0.id === selfId} />

      <div className="center-panel">
        <div className="panel">
          <h2>对局信息</h2>
          <div className="meta">
            <div>
              房间 <strong>{state.roomId}</strong>
            </div>
            <div>
              阶段 <strong>{phaseText}</strong>
            </div>
            <div className="timer">{formatMs(state.remainingMs)}</div>
          </div>
          {state.phase === 'waiting' ? (
            <button className="primary" style={{ width: '100%', marginTop: 12 }} onClick={onReady}>
              Ready
            </button>
          ) : null}
          {state.phase === 'countdown' ? (
            <div className="banner" style={{ marginTop: 12 }}>
              {state.countdown}
            </div>
          ) : null}
          {state.phase === 'finished' ? (
            <div className="banner" style={{ marginTop: 12 }}>
              胜者：{winnerName}
              <br />
              原因：{state.finishReason ?? '-'}
            </div>
          ) : null}
          <button className="ghost" style={{ width: '100%', marginTop: 12 }} onClick={onLeave}>
            离开房间
          </button>
        </div>

        <div className="panel">
          <h3>提示</h3>
          <div className="meta" style={{ fontSize: 13 }}>
            {info || '双方 Ready 后开始 3 秒倒计时。'}
          </div>
        </div>
      </div>

      <BoardView player={p1} isSelf={p1.id === selfId} />
    </div>
  );
}
