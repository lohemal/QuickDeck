import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * 로컬 저장 IPC. Rust 는 JSON 텍스트를 읽고 쓰기만 하고 구조는 알지 않는다.
 * (구조의 단일 기준은 src/model — 마이그레이션도 프론트엔드에서 한다)
 *
 * Tauri 밖(순수 브라우저에서 `vite` 로 UI 작업할 때)에서는 localStorage 로 대체한다.
 */
const BROWSER_KEY = 'quickdeck.appData'

export async function loadRawAppData(): Promise<unknown | null> {
  const text = isTauri() ? await invoke<string | null>('load_app_data') : localStorage.getItem(BROWSER_KEY)
  if (text == null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export async function saveRawAppData(data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2)
  if (isTauri()) await invoke('save_app_data', { json })
  else localStorage.setItem(BROWSER_KEY, json)
}

export interface AppInfo {
  version: string
  dataDir: string
}

export async function appInfo(): Promise<AppInfo> {
  if (!isTauri()) return { version: 'browser', dataDir: 'localStorage' }
  return invoke<AppInfo>('app_info')
}
