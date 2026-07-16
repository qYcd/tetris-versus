/// <reference types="vite/client" />

interface TetrisHostInfo {
  running: boolean;
  /** 是否为本进程自建内嵌服务（房主离开时应关闭） */
  owned?: boolean;
  port: number;
  lanIp: string;
  localWs: string;
  lanWs: string;
  engineKind: string | null;
  engineVersion: string | null;
}

interface TetrisBootstrap {
  mode: 'unified' | 'host' | 'client';
  isDev: boolean;
  platform: string;
  versions: {
    electron?: string;
    chrome?: string;
    node?: string;
  };
  host: TetrisHostInfo;
}

interface TetrisAppBridge {
  platform: string;
  versions: {
    electron?: string;
    chrome?: string;
    node?: string;
  };
  getBootstrap?: () => Promise<TetrisBootstrap>;
  startHost?: (opts?: { durationMs?: number }) => Promise<TetrisBootstrap>;
  stopHost?: () => Promise<TetrisBootstrap>;
}

interface Window {
  tetrisApp?: TetrisAppBridge;
}
