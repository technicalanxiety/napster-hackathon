/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NAPSTER_API_KEY: string;
  readonly VITE_AGENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
