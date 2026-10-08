/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPS_SCRIPT_URL?: string;
}

declare module '*.gs?raw' {
  const content: string;
  export default content;
}
