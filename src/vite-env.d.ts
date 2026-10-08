/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_APPS_SCRIPT_URL?: string;
  readonly VITE_PROXY_URL?: string;
}
