/**
 * tetris_engine.h
 * ------------------------------------------------------------
 * 课设核心：双人对战俄罗斯方块 C 语言引擎（权威逻辑）
 *
 * 规则要点：
 * 1) 活动方块整体移动/旋转（含简化踢墙）
 * 2) 锁定后仅当发生消行时，消行上方固定格才按列下落触底
 * 3) 消行连锁：clear -> gravity -> clear ...
 * 4) 活动块重力采用 Guideline 风格 log2 曲线（60fps 语义）
 * 4) 方块生成使用 7-bag 洗牌
 * 5) 胜负：一方顶出；或限时结束比分高者胜
 *
 * 网络层（Node/WebSocket）只负责传输，不实现规则。
 */
#ifndef TETRIS_ENGINE_H
#define TETRIS_ENGINE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* 棋盘几何：10x20 可见 + 2 行隐藏缓冲 */
#define TE_BOARD_W        10
#define TE_BOARD_H        20
#define TE_BOARD_BUFFER   2
#define TE_TOTAL_ROWS     (TE_BOARD_H + TE_BOARD_BUFFER)

/* 预览队列长度 */
#define TE_PREVIEW_COUNT  5

/* 默认对局 10 分钟 */
#define TE_DEFAULT_DURATION_MS  600000

/* 逻辑 tick 默认 50ms（由上层传入 dt 累加） */
#define TE_LOCK_DELAY_TICKS     10

/* 方块 ID：0=I,1=O,2=T,3=S,4=Z,5=J,6=L */
typedef enum {
  TE_PIECE_I = 0,
  TE_PIECE_O = 1,
  TE_PIECE_T = 2,
  TE_PIECE_S = 3,
  TE_PIECE_Z = 4,
  TE_PIECE_J = 5,
  TE_PIECE_L = 6,
  TE_PIECE_COUNT = 7
} TePieceId;

/* 输入动作 */
typedef enum {
  TE_INPUT_LEFT = 0,
  TE_INPUT_RIGHT,
  TE_INPUT_SOFT_DROP,
  TE_INPUT_HARD_DROP,
  TE_INPUT_ROTATE_CW,
  TE_INPUT_ROTATE_CCW,
  TE_INPUT_HOLD,
  TE_INPUT_SOFT_DROP_END
} TeInputAction;

/* 对局阶段 */
typedef enum {
  TE_PHASE_WAITING = 0,
  TE_PHASE_COUNTDOWN,
  TE_PHASE_PLAYING,
  TE_PHASE_PAUSED,
  TE_PHASE_FINISHED
} TeMatchPhase;

/* 结束原因 */
typedef enum {
  TE_FINISH_NONE = 0,
  TE_FINISH_TOPOUT,
  TE_FINISH_TIMEUP,
  TE_FINISH_FORFEIT
} TeFinishReason;

/* 活动方块 */
typedef struct {
  int id;       /* TePieceId */
  int rotation; /* 0..3 */
  int x;
  int y;
  int valid;    /* 1=存在 */
} TeActivePiece;

/* 单名玩家状态（可序列化） */
typedef struct {
  char id[32];
  char name[32];
  int board[TE_TOTAL_ROWS][TE_BOARD_W];
  TeActivePiece active;
  int next_queue[TE_PREVIEW_COUNT];
  int hold;          /* -1 表示无 */
  int hold_used;
  int score;
  int lines;
  int level;
  int alive;
  int soft_dropping;
  int lock_ticks;
} TePlayerState;

/* 整局状态快照 */
typedef struct {
  char room_id[32];
  TeMatchPhase phase;
  TePlayerState players[2];
  int player_count;
  int64_t started_at_ms;
  int duration_ms;
  int remaining_ms;
  char winner_id[32]; /* 空串表示无/平局 */
  TeFinishReason finish_reason;
  int countdown;
  uint32_t seed;
} TeMatchState;

/* 不透明对局句柄 */
typedef struct TeMatch TeMatch;

/**
 * 创建对局。
 * @param room_id 房间号
 * @param duration_ms 限时毫秒，<=0 则默认 10 分钟
 * @param seed 随机种子，0 表示用时间派生
 */
TeMatch *te_match_create(const char *room_id, int duration_ms, uint32_t seed);

/** 销毁对局并释放内存 */
void te_match_destroy(TeMatch *match);

/**
 * 加入玩家。成功返回玩家 id 字符串指针（内部存储），失败返回 NULL。
 */
const char *te_match_add_player(TeMatch *match, const char *name);

/** 玩家 Ready */
void te_match_ready(TeMatch *match, const char *player_id);

/** 切换暂停/继续（playing <-> paused，无次数上限） */
void te_match_pause(TeMatch *match);

/** 处理输入：pressed=1 按下，0 抬起（软降需要） */
void te_match_input(TeMatch *match, const char *player_id, TeInputAction action, int pressed);

/**
 * 推进逻辑。
 * @param now_ms 当前墙钟毫秒（用于限时与倒计时）
 * @param dt_ms  距离上次调用的间隔
 */
void te_match_update(TeMatch *match, int64_t now_ms, int dt_ms);

/** 导出状态快照到 out */
void te_match_get_state(const TeMatch *match, TeMatchState *out);

/** 认输 */
void te_match_forfeit(TeMatch *match, const char *player_id);

/** 引擎版本 */
const char *te_engine_version(void);

/**
 * 将状态序列化为 JSON 字符串（调用方提供缓冲区）。
 * 返回写入长度（不含 '\0'），失败返回 -1。
 */
int te_match_state_to_json(const TeMatchState *st, char *buf, size_t buflen);

/** 字符串动作名转枚举，失败返回 -1 */
int te_parse_action(const char *name);

#ifdef __cplusplus
}
#endif

#endif /* TETRIS_ENGINE_H */
