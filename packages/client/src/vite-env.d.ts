/// <reference types="vite/client" />

interface TetrisAppBridge {
  platform: string;
  versions: {
    electron?: string;
    chrome?: string;
    node?: string;
  };
}

interface Window {
  tetrisApp?: TetrisAppBridge;
}
