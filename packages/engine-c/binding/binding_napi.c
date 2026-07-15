/**
 * 纯 Node-API (C) 绑定：无 node-addon-api 依赖。
 * 将 C 对战引擎暴露给 Node 服务端。
 */

#include <node_api.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "tetris_engine.h"

/* 简单包装：JS 对象上挂 external 指针 */
typedef struct {
  TeMatch *match;
} MatchWrap;

/** 当前毫秒 */
static int64_t now_ms(void) {
  struct timespec ts;
#if defined(CLOCK_REALTIME)
  clock_gettime(CLOCK_REALTIME, &ts);
  return (int64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
#else
  return (int64_t)time(NULL) * 1000;
#endif
}

static void match_finalize(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  MatchWrap *w = (MatchWrap *)data;
  if (w) {
    if (w->match) te_match_destroy(w->match);
    free(w);
  }
}

static MatchWrap *get_wrap(napi_env env, napi_value jsthis) {
  MatchWrap *w = NULL;
  napi_status st = napi_unwrap(env, jsthis, (void **)&w);
  if (st != napi_ok) return NULL;
  return w;
}

/** addPlayer(name) -> playerId */
static napi_value Match_AddPlayer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_value jsthis;
  char name[64] = "Player";
  napi_value result;

  napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  if (!w || !w->match) {
    napi_get_null(env, &result);
    return result;
  }
  if (argc >= 1) {
    size_t len = 0;
    napi_get_value_string_utf8(env, args[0], name, sizeof(name), &len);
  }
  {
    const char *id = te_match_add_player(w->match, name);
    if (!id) {
      napi_throw_error(env, NULL, "room full");
      napi_get_null(env, &result);
      return result;
    }
    napi_create_string_utf8(env, id, NAPI_AUTO_LENGTH, &result);
    return result;
  }
}

/** ready(playerId) */
static napi_value Match_Ready(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_value jsthis;
  char pid[32] = {0};
  napi_value undefined;

  napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  napi_get_undefined(env, &undefined);
  if (!w || !w->match || argc < 1) return undefined;
  napi_get_value_string_utf8(env, args[0], pid, sizeof(pid), NULL);
  te_match_ready(w->match, pid);
  return undefined;
}

/** input(playerId, action, pressed) */
static napi_value Match_Input(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_value jsthis;
  char pid[32] = {0};
  char action[32] = {0};
  bool pressed = false;
  napi_value undefined;
  int act;

  napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  napi_get_undefined(env, &undefined);
  if (!w || !w->match || argc < 3) return undefined;
  napi_get_value_string_utf8(env, args[0], pid, sizeof(pid), NULL);
  napi_get_value_string_utf8(env, args[1], action, sizeof(action), NULL);
  napi_get_value_bool(env, args[2], &pressed);
  act = te_parse_action(action);
  if (act >= 0) {
    te_match_input(w->match, pid, (TeInputAction)act, pressed ? 1 : 0);
  }
  return undefined;
}

/** update(dtMs) */
static napi_value Match_Update(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_value jsthis;
  int32_t dt = 50;
  napi_value undefined;

  napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  napi_get_undefined(env, &undefined);
  if (!w || !w->match) return undefined;
  if (argc >= 1) napi_get_value_int32(env, args[0], &dt);
  te_match_update(w->match, now_ms(), dt);
  return undefined;
}

/** getState() -> object */
static napi_value Match_GetState(napi_env env, napi_callback_info info) {
  napi_value jsthis;
  napi_value result;
  napi_value json_str;
  napi_value global, json_obj, parse_fn;
  TeMatchState st;
  char *buf;
  int n;

  napi_get_cb_info(env, info, NULL, NULL, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  if (!w || !w->match) {
    napi_get_null(env, &result);
    return result;
  }

  te_match_get_state(w->match, &st);
  if (st.phase == TE_PHASE_PLAYING && st.started_at_ms > 0) {
    int64_t now = now_ms();
    int rem = (int)(st.duration_ms - (now - st.started_at_ms));
    if (rem < 0) rem = 0;
    st.remaining_ms = rem;
  }

  buf = (char *)malloc(256 * 1024);
  if (!buf) {
    napi_throw_error(env, NULL, "oom");
    napi_get_null(env, &result);
    return result;
  }
  n = te_match_state_to_json(&st, buf, 256 * 1024);
  if (n < 0) {
    free(buf);
    napi_throw_error(env, NULL, "state json failed");
    napi_get_null(env, &result);
    return result;
  }

  napi_create_string_utf8(env, buf, (size_t)n, &json_str);
  free(buf);

  napi_get_global(env, &global);
  napi_get_named_property(env, global, "JSON", &json_obj);
  napi_get_named_property(env, json_obj, "parse", &parse_fn);
  napi_call_function(env, json_obj, parse_fn, 1, &json_str, &result);
  return result;
}

/** forfeit(playerId) */
static napi_value Match_Forfeit(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_value jsthis;
  char pid[32] = {0};
  napi_value undefined;

  napi_get_cb_info(env, info, &argc, args, &jsthis, NULL);
  MatchWrap *w = get_wrap(env, jsthis);
  napi_get_undefined(env, &undefined);
  if (!w || !w->match || argc < 1) return undefined;
  napi_get_value_string_utf8(env, args[0], pid, sizeof(pid), NULL);
  te_match_forfeit(w->match, pid);
  return undefined;
}

/** destroy() */
static napi_value Match_Destroy(napi_env env, napi_callback_info info) {
  napi_value jsthis;
  napi_value undefined;
  MatchWrap *w;

  napi_get_cb_info(env, info, NULL, NULL, &jsthis, NULL);
  w = get_wrap(env, jsthis);
  napi_get_undefined(env, &undefined);
  if (w && w->match) {
    te_match_destroy(w->match);
    w->match = NULL;
  }
  return undefined;
}

/** createMatch(roomId, durationMs?, seed?) */
static napi_value CreateMatch(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  char room[32] = "ROOM";
  int32_t duration = TE_DEFAULT_DURATION_MS;
  uint32_t seed = 0;
  MatchWrap *w;
  napi_value obj;
  napi_value fn;
  const char *ids[] = {"addPlayer", "ready", "input", "update", "getState", "forfeit", "destroy"};
  napi_callback cbs[] = {
      Match_AddPlayer, Match_Ready, Match_Input, Match_Update, Match_GetState, Match_Forfeit, Match_Destroy};

  napi_get_cb_info(env, info, &argc, args, NULL, NULL);
  if (argc >= 1) {
    size_t len = 0;
    napi_get_value_string_utf8(env, args[0], room, sizeof(room), &len);
  }
  if (argc >= 2) napi_get_value_int32(env, args[1], &duration);
  if (argc >= 3) {
    int64_t s = 0;
    napi_get_value_int64(env, args[2], &s);
    seed = (uint32_t)s;
  }

  w = (MatchWrap *)calloc(1, sizeof(MatchWrap));
  if (!w) {
    napi_throw_error(env, NULL, "oom");
    return NULL;
  }
  w->match = te_match_create(room, duration, seed);
  if (!w->match) {
    free(w);
    napi_throw_error(env, NULL, "te_match_create failed");
    return NULL;
  }

  napi_create_object(env, &obj);
  napi_wrap(env, obj, w, match_finalize, NULL, NULL);

  for (int i = 0; i < 7; i++) {
    napi_create_function(env, ids[i], NAPI_AUTO_LENGTH, cbs[i], NULL, &fn);
    napi_set_named_property(env, obj, ids[i], fn);
  }
  return obj;
}

static napi_value EngineVersion(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value v;
  napi_create_string_utf8(env, te_engine_version(), NAPI_AUTO_LENGTH, &v);
  return v;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn_create;
  napi_value fn_ver;
  napi_create_function(env, "createMatch", NAPI_AUTO_LENGTH, CreateMatch, NULL, &fn_create);
  napi_create_function(env, "engineVersion", NAPI_AUTO_LENGTH, EngineVersion, NULL, &fn_ver);
  napi_set_named_property(env, exports, "createMatch", fn_create);
  napi_set_named_property(env, exports, "engineVersion", fn_ver);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
