import type { CodesterApi } from './index'

declare global {
  interface Window {
    api: CodesterApi
  }
}

export {}
