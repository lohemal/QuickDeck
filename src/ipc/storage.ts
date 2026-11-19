import { invoke, isTauri } from '@tauri-apps/api/core'

/**
 * 로컬 저장 IPC. Rust 는 JSON 텍스트를 읽고 쓰기만 하고 구조는 알지 않는다.
 * (구조의 단일 기준은 src/model — 마이그레이션도 프론트엔드에서 한다)
 *
 * Tauri 밖(순수 브라우저에서 `vite` 로 UI 작업할 때)에서는 localStorage 로 대체한다.
 */
const BROWSER_KEY = 'quickdeck.appData'

/** 저장 파일 텍스트 그대로. 파일이 없으면 null. 해석(BOM·JSON·스키마)은 src/model/load.ts 가 한다 */
export async function loadAppDataText(): Promise<string | null> {
  return isTauri() ? invoke<string | null>('load_app_data') : localStorage.getItem(BROWSER_KEY)
}

/**
 * 손상된 저장 파일을 `quickdeck.json.corrupt-YYYYMMDD-HHMMSS` 로 옮긴다(기존 보존본은 덮어쓰지 않음).
 * 시각은 사용자가 알아보기 쉽게 로컬 시각으로 정해 넘긴다. 돌려주는 값은 보존본 파일 이름
 */
export async function backupCorruptAppData(now = new Date()): Promise<string> {
  const stamp = formatStamp(now)
  if (isTauri()) return invoke<string>('backup_corrupt_app_data', { stamp })
  const text = localStorage.getItem(BROWSER_KEY)
  const key = `${BROWSER_KEY}.corrupt-${stamp}`
  if (text != null) localStorage.setItem(key, text)
  localStorage.removeItem(BROWSER_KEY)
  return key
}

function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
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
