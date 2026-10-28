/// <reference types="vite/client" />
/// <reference types="web-bluetooth" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_GLOVE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
