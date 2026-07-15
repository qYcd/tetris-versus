/**
 * WebSocket 对战连接 Hook：加入房间、收状态、发输入。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  encodeMessage,
  parseServerMessage,
  type ClientMessage,
  type InputAction,
  type MatchState,
  type ServerMessage,
} from '@tetris/shared';

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface UseGameSocketResult {
  status: ConnStatus;
  playerId: string | null;
  roomId: string | null;
  state: MatchState | null;
  info: string;
  error: string;
  connectAndJoin: (serverUrl: string, name: string, roomId?: string) => void;
  ready: () => void;
  sendInput: (action: InputAction, pressed: boolean) => void;
  disconnect: () => void;
}

/**
 * 管理与对战服务端的连接生命周期。
 */
export function useGameSocket(): UseGameSocketResult {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  /**
   * 统一发送。
   */
  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(encodeMessage(msg));
  }, []);

  /**
   * 处理服务端消息。
   */
  const onServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'welcome':
        setPlayerId(msg.playerId);
        setRoomId(msg.roomId);
        break;
      case 'state':
        setState(msg.state);
        setRoomId(msg.state.roomId);
        break;
      case 'info':
        setInfo(msg.message);
        break;
      case 'error':
        setError(msg.message);
        break;
      default:
        break;
    }
  }, []);

  /**
   * 连接并 join。
   */
  const connectAndJoin = useCallback(
    (serverUrl: string, name: string, joinRoomId?: string) => {
      // 关闭旧连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setError('');
      setInfo('');
      setState(null);
      setStatus('connecting');

      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        // 直接通过当前 socket 发送，避免 hook 闭包时序问题
        const joinMsg: ClientMessage = {
          type: 'join',
          name,
          roomId: joinRoomId || undefined,
        };
        ws.send(encodeMessage(joinMsg));
      };

      ws.onmessage = (ev) => {
        const msg = parseServerMessage(String(ev.data));
        if (msg) onServerMessage(msg);
      };

      ws.onerror = () => {
        setStatus('error');
        setError('WebSocket 连接失败，请检查服务端地址与防火墙');
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'error' ? prev : 'idle'));
      };
    },
    [onServerMessage, send],
  );

  /**
   * 就绪开始。
   */
  const ready = useCallback(() => {
    send({ type: 'ready' });
  }, [send]);

  /**
   * 发送输入。
   */
  const sendInput = useCallback(
    (action: InputAction, pressed: boolean) => {
      send({ type: 'input', action, pressed });
    },
    [send],
  );

  /**
   * 主动断开。
   */
  const disconnect = useCallback(() => {
    send({ type: 'leave' });
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('idle');
    setPlayerId(null);
    setRoomId(null);
    setState(null);
  }, [send]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return useMemo(
    () => ({
      status,
      playerId,
      roomId,
      state,
      info,
      error,
      connectAndJoin,
      ready,
      sendInput,
      disconnect,
    }),
    [
      status,
      playerId,
      roomId,
      state,
      info,
      error,
      connectAndJoin,
      ready,
      sendInput,
      disconnect,
    ],
  );
}
