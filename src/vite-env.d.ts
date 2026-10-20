/// <reference types="vite/client" />
/// <reference types="web-bluetooth" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
