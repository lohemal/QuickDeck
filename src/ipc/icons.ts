import { invoke, isTauri } from '@tauri-apps/api/core'

/** Rust icons 모듈 IPC. 브라우저 미리보기에서는 추출·등록이 불가능하므로 reject 한다 (UI 는 폴백을 보여준다) */

export interface ManagedIcon {
  file: string
}

export interface ImportedIcon extends ManagedIcon {
  width: number
  height: number
}

export interface CleanupResult {
  removed: number
  kept: number
}

export async function extractIcon(path: string): Promise<ManagedIcon> {
  if (!isTauri()) throw new Error('브라우저 미리보기에서는 아이콘을 추출할 수 없습니다')
  return invoke<ManagedIcon>('icon_extract', { path })
}

export async function importImage(path: string): Promise<ImportedIcon> {
  if (!isTauri()) throw new Error('브라우저 미리보기에서는 이미지를 등록할 수 없습니다')
  return invoke<ImportedIcon>('icon_import_image', { path })
}

export async function cleanupIcons(keepFiles: string[], keepPaths: string[]): Promise<CleanupResult> {
  if (!isTauri()) return { removed: 0, kept: 0 }
  return invoke<CleanupResult>('icon_cleanup', { keepFiles, keepPaths })
}
