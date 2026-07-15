/**
 * tetris_engine.c
 * 双人对战俄罗斯方块权威逻辑（纯 C）。
 * 说明：活动方块整体操作；锁定后固定格按列单格重力填补空隙。
 */

#include "tetris_engine.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* =========================
 * 内部结构
 * ========================= */

typedef struct {
  TePlayerState state;
  int bag[7];
  int bag_count;
  int queue[32];
  int queue_len;
  int gravity_counter;
  int lock_reset_budget;
  int ready;
  uint32_t rng_state;
} TePlayerInternal;

struct TeMatch {
  char room_id[32];
  TeMatchPhase phase;
  TePlayerInternal players[2];
  int player_count;
  int64_t started_at_ms;
  int duration_ms;
  char winner_id[32];
  TeFinishReason finish_reason;
  int countdown;
  int countdown_acc_ms;
  uint32_t seed;
  int logic_acc_ms; /* 累计到 50ms 跑一帧 */
  int64_t last_now_ms;
};

/* =========================
 * 工具：RNG / 字符串
 * ========================= */

/** Mulberry32 风格 0..1 随机 */
static float te_rng_next(uint32_t *state) {
  uint32_t t = (*state += 0x6D2B79F5u);
  t = (t ^ (t >> 15)) * (t | 1u);
  t ^= t + ((t ^ (t >> 7)) * (t | 61u));
  return (float)((t ^ (t >> 14)) >> 0) / 4294967296.0f;
}

/** 从 base+salt 派生种子 */
static uint32_t te_derive_seed(uint32_t base, int salt) {
  return (uint32_t)((base ^ 0x9E3779B9u) * 0x85EBCA6Bu + (uint32_t)salt);
}

/** 安全拷贝字符串 */
static void te_copy_str(char *dst, size_t n, const char *src) {
  if (!dst || n == 0) return;
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strncpy(dst, src, n - 1);
  dst[n - 1] = '\0';
}

/** 比较玩家 id */
static int te_id_eq(const char *a, const char *b) {
  if (!a || !b) return 0;
  return strcmp(a, b) == 0;
}

/* =========================
 * 方块形状（4 旋转 × 4 格）
 * ========================= */

typedef struct {
  int x, y;
} TePoint;

/* shapes[piece][rot][cell] */
static const TePoint SHAPES[7][4][4] = {
  /* I */
  {
    {{-1, 0}, {0, 0}, {1, 0}, {2, 0}},
    {{1, -1}, {1, 0}, {1, 1}, {1, 2}},
    {{-1, 1}, {0, 1}, {1, 1}, {2, 1}},
    {{0, -1}, {0, 0}, {0, 1}, {0, 2}},
  },
  /* O */
  {
    {{0, 0}, {1, 0}, {0, 1}, {1, 1}},
    {{0, 0}, {1, 0}, {0, 1}, {1, 1}},
    {{0, 0}, {1, 0}, {0, 1}, {1, 1}},
    {{0, 0}, {1, 0}, {0, 1}, {1, 1}},
  },
  /* T */
  {
    {{-1, 0}, {0, 0}, {1, 0}, {0, -1}},
    {{0, -1}, {0, 0}, {0, 1}, {1, 0}},
    {{-1, 0}, {0, 0}, {1, 0}, {0, 1}},
    {{0, -1}, {0, 0}, {0, 1}, {-1, 0}},
  },
  /* S */
  {
    {{0, 0}, {1, 0}, {-1, 1}, {0, 1}},
    {{0, -1}, {0, 0}, {1, 0}, {1, 1}},
    {{0, 0}, {1, 0}, {-1, 1}, {0, 1}},
    {{0, -1}, {0, 0}, {1, 0}, {1, 1}},
  },
  /* Z */
  {
    {{-1, 0}, {0, 0}, {0, 1}, {1, 1}},
    {{1, -1}, {0, 0}, {1, 0}, {0, 1}},
    {{-1, 0}, {0, 0}, {0, 1}, {1, 1}},
    {{1, -1}, {0, 0}, {1, 0}, {0, 1}},
  },
  /* J */
  {
    {{-1, 0}, {0, 0}, {1, 0}, {-1, -1}},
    {{0, -1}, {0, 0}, {0, 1}, {1, -1}},
    {{-1, 0}, {0, 0}, {1, 0}, {1, 1}},
    {{0, -1}, {0, 0}, {0, 1}, {-1, 1}},
  },
  /* L */
  {
    {{-1, 0}, {0, 0}, {1, 0}, {1, -1}},
    {{0, -1}, {0, 0}, {0, 1}, {1, 1}},
    {{-1, 0}, {0, 0}, {1, 0}, {-1, 1}},
    {{0, -1}, {0, 0}, {0, 1}, {-1, -1}},
  },
};

/* 颜色索引：固定到棋盘时使用 1..7 */
static int te_piece_color(int id) {
  return id + 1;
}

/** 取绝对坐标 */
static void te_abs_cells(int id, int rot, int x, int y, TePoint out[4]) {
  int r = ((rot % 4) + 4) % 4;
  int i;
  for (i = 0; i < 4; i++) {
    out[i].x = x + SHAPES[id][r][i].x;
    out[i].y = y + SHAPES[id][r][i].y;
  }
}

/* =========================
 * 棋盘：碰撞 / 锁定 / 单格重力 / 消行
 * ========================= */

/** 清空棋盘 */
static void te_board_clear(int board[TE_TOTAL_ROWS][TE_BOARD_W]) {
  memset(board, 0, sizeof(int) * TE_TOTAL_ROWS * TE_BOARD_W);
}

/** 是否可放置 */
static int te_can_place(const int board[TE_TOTAL_ROWS][TE_BOARD_W], const TePoint cells[4]) {
  int i;
  for (i = 0; i < 4; i++) {
    int x = cells[i].x;
    int y = cells[i].y;
    if (x < 0 || x >= TE_BOARD_W) return 0;
    if (y < 0 || y >= TE_TOTAL_ROWS) return 0;
    if (board[y][x] != 0) return 0;
  }
  return 1;
}

/** 写入固定块 */
static void te_lock_cells(int board[TE_TOTAL_ROWS][TE_BOARD_W], const TePoint cells[4], int color) {
  int i;
  for (i = 0; i < 4; i++) {
    int x = cells[i].x;
    int y = cells[i].y;
    if (x >= 0 && x < TE_BOARD_W && y >= 0 && y < TE_TOTAL_ROWS) {
      board[y][x] = color;
    }
  }
}

/**
 * 列内单格重力：每一列中的方块整体向下沉降，上方留空。
 * 这实现“只要有空隙，相应方格继续下落直到触底或被挡”。
 * 注意：不跨列移动，避免破坏列堆叠物理直觉。
 */
static void te_apply_column_gravity(int board[TE_TOTAL_ROWS][TE_BOARD_W]) {
  int x, y, write;
  int stack[TE_TOTAL_ROWS];
  int n;

  for (x = 0; x < TE_BOARD_W; x++) {
    n = 0;
    /* 自底向上收集非空格 */
    for (y = TE_TOTAL_ROWS - 1; y >= 0; y--) {
      if (board[y][x] != 0) {
        stack[n++] = board[y][x];
      }
    }
    /* 回填到底部 */
    write = TE_TOTAL_ROWS - 1;
    for (y = 0; y < n; y++) {
      board[write--][x] = stack[y];
    }
    while (write >= 0) {
      board[write--][x] = 0;
    }
  }
}

/** 清除满行（经典压缩），返回消除行数 */
static int te_clear_full_lines(int board[TE_TOTAL_ROWS][TE_BOARD_W]) {
  int y, x, write;
  int cleared = 0;
  int tmp[TE_TOTAL_ROWS][TE_BOARD_W];

  write = TE_TOTAL_ROWS - 1;
  memset(tmp, 0, sizeof(tmp));

  for (y = TE_TOTAL_ROWS - 1; y >= 0; y--) {
    int full = 1;
    for (x = 0; x < TE_BOARD_W; x++) {
      if (board[y][x] == 0) {
        full = 0;
        break;
      }
    }
    if (full) {
      cleared++;
      continue;
    }
    for (x = 0; x < TE_BOARD_W; x++) {
      tmp[write][x] = board[y][x];
    }
    write--;
  }

  memcpy(board, tmp, sizeof(tmp));
  return cleared;
}

/**
 * 锁定后级联：
 * 重力 -> 消行 -> 重力 -> ... 直到不再消行
 */
static void te_resolve_cascade(int board[TE_TOTAL_ROWS][TE_BOARD_W], int *out_lines, int *out_chain) {
  int total_lines = 0;
  int chain = 0;
  int guard;

  te_apply_column_gravity(board);

  for (guard = 0; guard < 40; guard++) {
    int cleared = te_clear_full_lines(board);
    if (cleared <= 0) break;
    total_lines += cleared;
    chain++;
    te_apply_column_gravity(board);
  }

  if (out_lines) *out_lines = total_lines;
  if (out_chain) *out_chain = chain;
}

/* =========================
 * 计分 / 等级 / 重力间隔
 * ========================= */

static int te_score_for_lines(int lines, int level, int chain) {
  int base = 0;
  int bonus;
  if (lines <= 0) return 0;
  if (lines == 1) base = 100;
  else if (lines == 2) base = 300;
  else if (lines == 3) base = 500;
  else if (lines == 4) base = 800;
  else base = lines * 200;

  if (level < 1) level = 1;
  base *= level;
  bonus = (chain > 1) ? (base * (chain - 1)) / 2 : 0;
  return base + bonus;
}

static int te_level_from_lines(int total_lines) {
  return total_lines / 10 + 1;
}

/** 等级越高重力越快，返回需要累计的逻辑帧数 */
static int te_gravity_interval(int level) {
  int v = 21 - level;
  if (v < 2) v = 2;
  return v;
}

/* =========================
 * 7-bag
 * ========================= */

/** 袋空则洗入 I..L */
static void te_refill_bag(TePlayerInternal *p) {
  int i, j;
  if (p->bag_count > 0) return;
  for (i = 0; i < 7; i++) p->bag[i] = i;
  /* Fisher-Yates */
  for (i = 6; i > 0; i--) {
    j = (int)(te_rng_next(&p->rng_state) * (float)(i + 1));
    if (j < 0) j = 0;
    if (j > i) j = i;
    {
      int tmp = p->bag[i];
      p->bag[i] = p->bag[j];
      p->bag[j] = tmp;
    }
  }
  p->bag_count = 7;
}

/** 保证预览队列长度 */
static void te_refill_queue(TePlayerInternal *p) {
  while (p->queue_len < TE_PREVIEW_COUNT + 1) {
    te_refill_bag(p);
    if (p->bag_count <= 0) break;
    p->queue[p->queue_len++] = p->bag[--p->bag_count];
  }
}

/** 取出下一块并刷新 next 显示 */
static int te_bag_next(TePlayerInternal *p) {
  int id;
  te_refill_queue(p);
  id = p->queue[0];
  memmove(&p->queue[0], &p->queue[1], (size_t)(p->queue_len - 1) * sizeof(int));
  p->queue_len--;
  te_refill_queue(p);
  return id;
}

static void te_sync_next_queue(TePlayerInternal *p) {
  int i;
  te_refill_queue(p);
  for (i = 0; i < TE_PREVIEW_COUNT; i++) {
    p->state.next_queue[i] = (i < p->queue_len) ? p->queue[i] : 0;
  }
}

/* =========================
 * 玩家：生成 / 移动 / 旋转 / 锁定
 * ========================= */

static int te_try_move(TePlayerInternal *p, int dx, int dy);
static void te_lock_active(TePlayerInternal *p);

/** 生成新方块；forced>=0 时使用指定 id（hold） */
static void te_spawn(TePlayerInternal *p, int forced) {
  TePoint cells[4];
  int id = (forced >= 0) ? forced : te_bag_next(p);
  TeActivePiece *a = &p->state.active;

  te_sync_next_queue(p);

  a->id = id;
  a->rotation = 0;
  a->x = TE_BOARD_W / 2 - 1;
  a->y = TE_BOARD_BUFFER - 1;
  a->valid = 1;

  te_abs_cells(a->id, a->rotation, a->x, a->y, cells);
  if (!te_can_place((const int(*)[TE_BOARD_W])p->state.board, cells)) {
    a->valid = 0;
    p->state.alive = 0;
    return;
  }

  p->state.hold_used = 0;
  p->state.lock_ticks = 0;
  p->gravity_counter = 0;
  p->lock_reset_budget = 15;
}

/** 是否可移动（只读） */
static int te_can_move(TePlayerInternal *p, int dx, int dy) {
  TePoint cells[4];
  TeActivePiece *a = &p->state.active;
  if (!a->valid) return 0;
  te_abs_cells(a->id, a->rotation, a->x + dx, a->y + dy, cells);
  return te_can_place((const int(*)[TE_BOARD_W])p->state.board, cells);
}

/** 着地时重置锁延（有限次数） */
static void te_reset_lock_delay(TePlayerInternal *p) {
  if (p->lock_reset_budget <= 0) return;
  if (!te_can_move(p, 0, 1)) {
    p->state.lock_ticks = 0;
    p->lock_reset_budget--;
  }
}

static int te_try_move(TePlayerInternal *p, int dx, int dy) {
  TePoint cells[4];
  TeActivePiece *a = &p->state.active;
  if (!a->valid) return 0;
  te_abs_cells(a->id, a->rotation, a->x + dx, a->y + dy, cells);
  if (!te_can_place((const int(*)[TE_BOARD_W])p->state.board, cells)) return 0;
  a->x += dx;
  a->y += dy;
  if (dx != 0 || dy < 0) te_reset_lock_delay(p);
  return 1;
}

/** 简化踢墙表 */
static int te_try_rotate(TePlayerInternal *p, int dir) {
  static const TePoint kicks_jlstz[5] = {
    {0, 0}, {-1, 0}, {-1, -1}, {0, 2}, {-1, 2}
  };
  static const TePoint kicks_i[5] = {
    {0, 0}, {-2, 0}, {1, 0}, {-2, 1}, {1, -2}
  };
  TeActivePiece *a = &p->state.active;
  TePoint cells[4];
  int from, to, i, n;
  const TePoint *kicks;

  if (!a->valid) return 0;
  from = a->rotation;
  to = (from + dir + 4) % 4;

  if (a->id == TE_PIECE_O) {
    a->rotation = to;
    return 1;
  }

  kicks = (a->id == TE_PIECE_I) ? kicks_i : kicks_jlstz;
  n = 5;
  for (i = 0; i < n; i++) {
    int kx = kicks[i].x;
    int ky = kicks[i].y;
    int rx, ry;
    if (dir < 0) kx = -kx; /* 逆时针镜像 */
    rx = a->x + kx;
    ry = a->y + ky;
    te_abs_cells(a->id, to, rx, ry, cells);
    if (te_can_place((const int(*)[TE_BOARD_W])p->state.board, cells)) {
      a->x = rx;
      a->y = ry;
      a->rotation = to;
      te_reset_lock_delay(p);
      return 1;
    }
  }
  return 0;
}

static void te_hard_drop(TePlayerInternal *p) {
  int dist = 0;
  if (!p->state.active.valid) return;
  while (te_try_move(p, 0, 1)) dist++;
  p->state.score += dist * 2;
  te_lock_active(p);
}

static void te_hold(TePlayerInternal *p) {
  int current, swapped;
  if (!p->state.active.valid || p->state.hold_used) return;
  current = p->state.active.id;
  swapped = p->state.hold;
  p->state.hold = current;
  p->state.hold_used = 1;
  p->state.active.valid = 0;
  te_spawn(p, swapped);
}

static void te_lock_active(TePlayerInternal *p) {
  TePoint cells[4];
  TeActivePiece *a = &p->state.active;
  int lines = 0, chain = 0;
  int gained, extra;

  if (!a->valid) return;
  te_abs_cells(a->id, a->rotation, a->x, a->y, cells);
  te_lock_cells(p->state.board, cells, te_piece_color(a->id));
  a->valid = 0;

  /* 定制规则：锁定后单格重力 + 消行连锁 */
  te_resolve_cascade(p->state.board, &lines, &chain);
  if (lines > 0) {
    int scored_lines = lines > 4 ? 4 : lines;
    gained = te_score_for_lines(scored_lines, p->state.level, chain);
    extra = 0;
    if (lines > 4) {
      extra = (lines - 4) * 200 * p->state.level * (chain > 0 ? chain : 1);
    }
    p->state.score += gained + extra;
    p->state.lines += lines;
    p->state.level = te_level_from_lines(p->state.lines);
  }

  te_spawn(p, -1);
}

/** 单逻辑帧（约 50ms） */
static void te_player_tick(TePlayerInternal *p) {
  int interval;
  if (!p->state.alive || !p->state.active.valid) return;

  interval = p->state.soft_dropping ? 1 : te_gravity_interval(p->state.level);
  p->gravity_counter++;
  if (p->gravity_counter < interval) return;
  p->gravity_counter = 0;

  if (te_try_move(p, 0, 1)) {
    if (p->state.soft_dropping) p->state.score += 1;
    p->state.lock_ticks = 0;
  } else {
    p->state.lock_ticks++;
    if (p->state.lock_ticks >= TE_LOCK_DELAY_TICKS) {
      te_lock_active(p);
    }
  }
}

static void te_player_input(TePlayerInternal *p, TeInputAction action, int pressed) {
  if (!p->state.alive) return;

  if (action == TE_INPUT_SOFT_DROP) {
    p->state.soft_dropping = pressed ? 1 : 0;
    return;
  }
  if (action == TE_INPUT_SOFT_DROP_END) {
    p->state.soft_dropping = 0;
    return;
  }
  if (!pressed) return;

  switch (action) {
    case TE_INPUT_LEFT: te_try_move(p, -1, 0); break;
    case TE_INPUT_RIGHT: te_try_move(p, 1, 0); break;
    case TE_INPUT_ROTATE_CW: te_try_rotate(p, 1); break;
    case TE_INPUT_ROTATE_CCW: te_try_rotate(p, -1); break;
    case TE_INPUT_HARD_DROP: te_hard_drop(p); break;
    case TE_INPUT_HOLD: te_hold(p); break;
    default: break;
  }
}

static void te_player_init(TePlayerInternal *p, const char *id, const char *name, uint32_t seed, int seat) {
  memset(p, 0, sizeof(*p));
  te_copy_str(p->state.id, sizeof(p->state.id), id);
  te_copy_str(p->state.name, sizeof(p->state.name), name);
  te_board_clear(p->state.board);
  p->state.hold = -1;
  p->state.alive = 1;
  p->state.level = 1;
  p->state.active.valid = 0;
  p->rng_state = te_derive_seed(seed, seat + 1);
  p->ready = 0;
  te_spawn(p, -1);
}

/* =========================
 * 对局状态机
 * ========================= */

static TePlayerInternal *te_find_player(TeMatch *m, const char *player_id) {
  int i;
  for (i = 0; i < m->player_count; i++) {
    if (te_id_eq(m->players[i].state.id, player_id)) return &m->players[i];
  }
  return NULL;
}

static void te_finish_by_score(TeMatch *m, TeFinishReason reason) {
  int s0 = m->players[0].state.score;
  int s1 = m->players[1].state.score;
  m->winner_id[0] = '\0';
  if (m->player_count >= 2) {
    if (s0 > s1) te_copy_str(m->winner_id, sizeof(m->winner_id), m->players[0].state.id);
    else if (s1 > s0) te_copy_str(m->winner_id, sizeof(m->winner_id), m->players[1].state.id);
  }
  m->finish_reason = reason;
  m->phase = TE_PHASE_FINISHED;
}

static void te_evaluate_topout(TeMatch *m) {
  int a0, a1;
  if (m->player_count < 2 || m->phase != TE_PHASE_PLAYING) return;
  a0 = m->players[0].state.alive;
  a1 = m->players[1].state.alive;
  if (a0 && a1) return;
  if (!a0 && !a1) {
    te_finish_by_score(m, TE_FINISH_TOPOUT);
    return;
  }
  if (a0) te_copy_str(m->winner_id, sizeof(m->winner_id), m->players[0].state.id);
  else te_copy_str(m->winner_id, sizeof(m->winner_id), m->players[1].state.id);
  m->finish_reason = TE_FINISH_TOPOUT;
  m->phase = TE_PHASE_FINISHED;
}

/* =========================
 * 对外 API
 * ========================= */

TeMatch *te_match_create(const char *room_id, int duration_ms, uint32_t seed) {
  TeMatch *m = (TeMatch *)calloc(1, sizeof(TeMatch));
  if (!m) return NULL;
  te_copy_str(m->room_id, sizeof(m->room_id), room_id ? room_id : "ROOM");
  m->phase = TE_PHASE_WAITING;
  m->duration_ms = duration_ms > 0 ? duration_ms : TE_DEFAULT_DURATION_MS;
  m->seed = seed ? seed : (uint32_t)time(NULL) ^ 0xC0FFEEu;
  m->countdown = 3;
  return m;
}

void te_match_destroy(TeMatch *match) {
  free(match);
}

const char *te_match_add_player(TeMatch *match, const char *name) {
  char id[32];
  char nbuf[32];
  if (!match) return NULL;
  if (match->player_count >= 2) return NULL;

  snprintf(id, sizeof(id), "P%d", match->player_count + 1);
  if (name && name[0]) te_copy_str(nbuf, sizeof(nbuf), name);
  else snprintf(nbuf, sizeof(nbuf), "玩家%d", match->player_count + 1);

  te_player_init(&match->players[match->player_count], id, nbuf, match->seed, match->player_count);
  match->player_count++;
  return match->players[match->player_count - 1].state.id;
}

void te_match_ready(TeMatch *match, const char *player_id) {
  TePlayerInternal *p;
  int i, all_ready;
  if (!match) return;
  p = te_find_player(match, player_id);
  if (!p) return;
  p->ready = 1;

  if (match->phase == TE_PHASE_WAITING && match->player_count == 2) {
    all_ready = 1;
    for (i = 0; i < 2; i++) {
      if (!match->players[i].ready) all_ready = 0;
    }
    if (all_ready) {
      match->phase = TE_PHASE_COUNTDOWN;
      match->countdown = 3;
      match->countdown_acc_ms = 0;
    }
  }
}

void te_match_input(TeMatch *match, const char *player_id, TeInputAction action, int pressed) {
  TePlayerInternal *p;
  if (!match || match->phase != TE_PHASE_PLAYING) return;
  p = te_find_player(match, player_id);
  if (!p) return;
  te_player_input(p, action, pressed);
}

void te_match_update(TeMatch *match, int64_t now_ms, int dt_ms) {
  int i;
  if (!match) return;
  match->last_now_ms = now_ms;
  if (dt_ms < 0) dt_ms = 0;
  if (dt_ms > 200) dt_ms = 200; /* 防止卡顿导致瞬移过大 */

  if (match->phase == TE_PHASE_COUNTDOWN) {
    match->countdown_acc_ms += dt_ms;
    while (match->countdown_acc_ms >= 1000 && match->phase == TE_PHASE_COUNTDOWN) {
      match->countdown_acc_ms -= 1000;
      match->countdown--;
      if (match->countdown <= 0) {
        match->phase = TE_PHASE_PLAYING;
        match->started_at_ms = now_ms;
        match->logic_acc_ms = 0;
      }
    }
    return;
  }

  if (match->phase != TE_PHASE_PLAYING) return;

  /* 限时 */
  if (match->started_at_ms > 0 && now_ms - match->started_at_ms >= match->duration_ms) {
    te_finish_by_score(match, TE_FINISH_TIMEUP);
    return;
  }

  /* 固定 50ms 逻辑帧 */
  match->logic_acc_ms += dt_ms;
  while (match->logic_acc_ms >= 50) {
    match->logic_acc_ms -= 50;
    for (i = 0; i < match->player_count; i++) {
      te_player_tick(&match->players[i]);
    }
    te_evaluate_topout(match);
    if (match->phase != TE_PHASE_PLAYING) break;
  }
}

void te_match_get_state(const TeMatch *match, TeMatchState *out) {
  int i;
  int rem;
  if (!match || !out) return;
  memset(out, 0, sizeof(*out));
  te_copy_str(out->room_id, sizeof(out->room_id), match->room_id);
  out->phase = match->phase;
  out->player_count = match->player_count;
  out->started_at_ms = match->started_at_ms;
  out->duration_ms = match->duration_ms;
  out->countdown = match->countdown;
  out->seed = match->seed;
  out->finish_reason = match->finish_reason;
  te_copy_str(out->winner_id, sizeof(out->winner_id), match->winner_id);

  for (i = 0; i < match->player_count && i < 2; i++) {
    out->players[i] = match->players[i].state;
  }

  if (match->phase == TE_PHASE_PLAYING && match->started_at_ms > 0) {
    rem = (int)(match->duration_ms - (match->last_now_ms - match->started_at_ms));
    if (rem < 0) rem = 0;
    out->remaining_ms = rem;
  } else if (match->phase == TE_PHASE_FINISHED) {
    out->remaining_ms = 0;
  } else {
    out->remaining_ms = match->duration_ms;
  }
}

void te_match_forfeit(TeMatch *match, const char *player_id) {
  int i;
  if (!match || match->phase != TE_PHASE_PLAYING) return;
  match->winner_id[0] = '\0';
  for (i = 0; i < match->player_count; i++) {
    if (!te_id_eq(match->players[i].state.id, player_id)) {
      te_copy_str(match->winner_id, sizeof(match->winner_id), match->players[i].state.id);
      break;
    }
  }
  match->finish_reason = TE_FINISH_FORFEIT;
  match->phase = TE_PHASE_FINISHED;
}

const char *te_engine_version(void) {
  return "tetris-engine-c/0.1.0";
}

int te_parse_action(const char *name) {
  if (!name) return -1;
  if (strcmp(name, "left") == 0) return TE_INPUT_LEFT;
  if (strcmp(name, "right") == 0) return TE_INPUT_RIGHT;
  if (strcmp(name, "softDrop") == 0) return TE_INPUT_SOFT_DROP;
  if (strcmp(name, "hardDrop") == 0) return TE_INPUT_HARD_DROP;
  if (strcmp(name, "rotateCW") == 0) return TE_INPUT_ROTATE_CW;
  if (strcmp(name, "rotateCCW") == 0) return TE_INPUT_ROTATE_CCW;
  if (strcmp(name, "hold") == 0) return TE_INPUT_HOLD;
  if (strcmp(name, "softDropEnd") == 0) return TE_INPUT_SOFT_DROP_END;
  return -1;
}

/* =========================
 * JSON 序列化（与现有前端字段对齐）
 * ========================= */

static const char *te_phase_str(TeMatchPhase p) {
  switch (p) {
    case TE_PHASE_WAITING: return "waiting";
    case TE_PHASE_COUNTDOWN: return "countdown";
    case TE_PHASE_PLAYING: return "playing";
    case TE_PHASE_FINISHED: return "finished";
    default: return "waiting";
  }
}

static const char *te_finish_str(TeFinishReason r) {
  switch (r) {
    case TE_FINISH_TOPOUT: return "opponent_topped_out";
    case TE_FINISH_TIMEUP: return "time_up";
    case TE_FINISH_FORFEIT: return "forfeit";
    default: return NULL;
  }
}

static const char *te_piece_name(int id) {
  static const char *names[7] = {"I", "O", "T", "S", "Z", "J", "L"};
  if (id < 0 || id >= 7) return "I";
  return names[id];
}

/** 追加格式化文本，失败返回 -1 */
static int te_json_append(char *buf, size_t buflen, int *pos, const char *fmt, ...) {
  va_list ap;
  int n;
  if (*pos < 0) return -1;
  if ((size_t)*pos >= buflen) return -1;
  va_start(ap, fmt);
  n = vsnprintf(buf + *pos, buflen - (size_t)*pos, fmt, ap);
  va_end(ap);
  if (n < 0 || (size_t)n >= buflen - (size_t)*pos) {
    *pos = -1;
    return -1;
  }
  *pos += n;
  return 0;
}

static int te_json_player(char *buf, size_t buflen, int *pos, const TePlayerState *p) {
  int y, x, i;
  if (te_json_append(buf, buflen, pos,
                     "{\"id\":\"%s\",\"name\":\"%s\",\"score\":%d,\"lines\":%d,\"level\":%d,"
                     "\"alive\":%s,\"softDropping\":%s,\"lockTicks\":%d,\"holdUsed\":%s,",
                     p->id, p->name, p->score, p->lines, p->level,
                     p->alive ? "true" : "false",
                     p->soft_dropping ? "true" : "false",
                     p->lock_ticks,
                     p->hold_used ? "true" : "false") < 0) return -1;

  /* hold */
  if (p->hold < 0) {
    if (te_json_append(buf, buflen, pos, "\"hold\":null,") < 0) return -1;
  } else {
    if (te_json_append(buf, buflen, pos, "\"hold\":\"%s\",", te_piece_name(p->hold)) < 0) return -1;
  }

  /* nextQueue */
  if (te_json_append(buf, buflen, pos, "\"nextQueue\":[") < 0) return -1;
  for (i = 0; i < TE_PREVIEW_COUNT; i++) {
    if (te_json_append(buf, buflen, pos, "%s\"%s\"", i ? "," : "", te_piece_name(p->next_queue[i])) < 0)
      return -1;
  }
  if (te_json_append(buf, buflen, pos, "],") < 0) return -1;

  /* active */
  if (!p->active.valid) {
    if (te_json_append(buf, buflen, pos, "\"active\":null,") < 0) return -1;
  } else {
    if (te_json_append(buf, buflen, pos,
                       "\"active\":{\"id\":\"%s\",\"rotation\":%d,\"x\":%d,\"y\":%d},",
                       te_piece_name(p->active.id), p->active.rotation, p->active.x, p->active.y) < 0)
      return -1;
  }

  /* board */
  if (te_json_append(buf, buflen, pos, "\"board\":[") < 0) return -1;
  for (y = 0; y < TE_TOTAL_ROWS; y++) {
    if (te_json_append(buf, buflen, pos, "%s[", y ? "," : "") < 0) return -1;
    for (x = 0; x < TE_BOARD_W; x++) {
      if (te_json_append(buf, buflen, pos, "%s%d", x ? "," : "", p->board[y][x]) < 0) return -1;
    }
    if (te_json_append(buf, buflen, pos, "]") < 0) return -1;
  }
  if (te_json_append(buf, buflen, pos, "],\"moveResets\":0}") < 0) return -1;
  return 0;
}

int te_match_state_to_json(const TeMatchState *st, char *buf, size_t buflen) {
  int pos = 0;
  int i;
  const char *fin;
  if (!st || !buf || buflen < 16) return -1;

  fin = te_finish_str(st->finish_reason);

  /* 开头字段：startedAt 需要区分 null / 数字 */
  if (st->started_at_ms > 0) {
    if (te_json_append(buf, buflen, &pos,
                       "{\"roomId\":\"%s\",\"phase\":\"%s\",\"startedAt\":%lld,\"durationMs\":%d,"
                       "\"remainingMs\":%d,\"countdown\":%d,\"seed\":%u,",
                       st->room_id,
                       te_phase_str(st->phase),
                       (long long)st->started_at_ms,
                       st->duration_ms,
                       st->remaining_ms,
                       st->countdown,
                       (unsigned)st->seed) < 0) return -1;
  } else {
    if (te_json_append(buf, buflen, &pos,
                       "{\"roomId\":\"%s\",\"phase\":\"%s\",\"startedAt\":null,\"durationMs\":%d,"
                       "\"remainingMs\":%d,\"countdown\":%d,\"seed\":%u,",
                       st->room_id,
                       te_phase_str(st->phase),
                       st->duration_ms,
                       st->remaining_ms,
                       st->countdown,
                       (unsigned)st->seed) < 0) return -1;
  }

  /* winnerId */
  if (st->winner_id[0] == '\0') {
    if (te_json_append(buf, buflen, &pos, "\"winnerId\":null,") < 0) return -1;
  } else {
    if (te_json_append(buf, buflen, &pos, "\"winnerId\":\"%s\",", st->winner_id) < 0) return -1;
  }

  /* finishReason */
  if (!fin) {
    if (te_json_append(buf, buflen, &pos, "\"finishReason\":null,") < 0) return -1;
  } else {
    if (te_json_append(buf, buflen, &pos, "\"finishReason\":\"%s\",", fin) < 0) return -1;
  }

  if (te_json_append(buf, buflen, &pos, "\"players\":[") < 0) return -1;
  for (i = 0; i < 2; i++) {
    if (i) {
      if (te_json_append(buf, buflen, &pos, ",") < 0) return -1;
    }
    if (i < st->player_count) {
      if (te_json_player(buf, buflen, &pos, &st->players[i]) < 0) return -1;
    } else {
      /* 占位玩家 */
      if (te_json_append(buf, buflen, &pos,
                         "{\"id\":\"empty-%d\",\"name\":\"Waiting\",\"score\":0,\"lines\":0,"
                         "\"level\":1,\"alive\":true,\"softDropping\":false,\"lockTicks\":0,"
                         "\"holdUsed\":false,\"hold\":null,\"nextQueue\":[],\"active\":null,"
                         "\"board\":[],\"moveResets\":0}",
                         i) < 0) return -1;
    }
  }
  if (te_json_append(buf, buflen, &pos, "]}") < 0) return -1;
  return pos;
}
