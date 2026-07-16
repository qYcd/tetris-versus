/**
 * 单个玩家棋盘与旁路信息展示。
 */

import type { PlayerState, PieceId } from '@tetris/shared';
import { buildDisplayGrid, cellColor, previewMatrix } from '../game/renderBoard';

interface Props {
  player: PlayerState;
  isSelf: boolean;
}

/**
 * 渲染一名玩家的盘面、分数、预览与 Hold。
 */
export function BoardView({ player, isSelf }: Props) {
  const grid = buildDisplayGrid(player);
  // 显示接下来 3 个预览块
  const nextList: Array<PieceId | null> = [
    player.nextQueue?.[0] ?? null,
    player.nextQueue?.[1] ?? null,
    player.nextQueue?.[2] ?? null,
  ];

  return (
    <section className="panel player-card">
      <div className="player-head">
        <div>
          <span className="name">{player.name || 'Player'}</span>
          {isSelf ? <span className="you">你</span> : null}
        </div>
        <div style={{ color: player.alive ? 'var(--accent-2)' : 'var(--danger)' }}>
          {player.alive ? '作战中' : '已顶出'}
        </div>
      </div>

      <div className="board-wrap">
        <div className="side-stack">
          <div>
            <h3>HOLD</h3>
            <Mini matrix={previewMatrix(player.hold)} />
          </div>
          <div className="meta">
            <div>
              分数 <strong>{player.score}</strong>
            </div>
            <div>
              行数 <strong>{player.lines}</strong>
            </div>
            <div>
              等级 <strong>{player.level}</strong>
            </div>
          </div>
        </div>

        <div
          className="board"
          aria-label={`${player.name} 的游戏盘面`}
          style={{ opacity: player.alive ? 1 : 0.55 }}
        >
          {grid.flatMap((row, y) =>
            row.map((value, x) => (
              <div
                key={`${y}-${x}`}
                className="cell"
                style={{
                  background: value ? cellColor(value) : '#0c1224',
                  boxShadow: value
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.2), 0 0 10px rgba(0,0,0,0.25)'
                    : undefined,
                }}
              />
            )),
          )}
        </div>

        <div className="side-stack">
          <div>
            <h3>NEXT</h3>
            <div className="next-stack">
              {nextList.map((piece, idx) => (
                <Mini key={idx} matrix={previewMatrix(piece)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 小型预览格。
 */
function Mini({ matrix }: { matrix: number[][] }) {
  return (
    <div className="mini-board">
      {matrix.map((row, y) => (
        <div className="mini-row" key={y}>
          {row.map((v, x) => (
            <div
              key={`${y}-${x}`}
              className="mini-cell"
              style={{ background: v ? cellColor(v) : '#0c1224' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
