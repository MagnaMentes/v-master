/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

import type { ElectronApi } from './types';

declare global {
  interface Window {
    api: ElectronApi;
  }
}
