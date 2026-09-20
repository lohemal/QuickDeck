import { isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

/**
 * Windows 파일/폴더 선택창. 취소하면 null.
 *
 * Tauri 밖(브라우저에서 UI 작업 중)에서는 네이티브 창을 열 수 없으므로
 * 화면 흐름을 확인할 수 있게 가짜 경로를 돌려준다. 실제 앱에서는 절대 타지 않는다.
 */
export async function pickProgram(): Promise<string | null> {
  if (!isTauri()) return 'C:\\Windows\\System32\\notepad.exe'
  const picked = await open({
    title: '프로그램 선택',
    multiple: false,
    directory: false,
    filters: [
      { name: '프로그램 (*.exe, *.lnk)', extensions: ['exe', 'lnk'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  return typeof picked === 'string' ? picked : null
}

export async function pickFile(): Promise<string | null> {
  if (!isTauri()) return 'C:\\Users\\Public\\Documents\\보고서.xlsx'
  const picked = await open({ title: '파일 선택', multiple: false, directory: false })
  return typeof picked === 'string' ? picked : null
}

/** 버튼 아이콘용 이미지. 형식 검증·축소는 Rust(icon_import_image)가 한다 */
export async function pickImage(): Promise<string | null> {
  if (!isTauri()) return 'C:\\Users\\Public\\Pictures\\아이콘.png'
  const picked = await open({
    title: '아이콘 이미지 선택',
    multiple: false,
    directory: false,
    filters: [
      { name: '이미지 (PNG, JPG, WebP, ICO)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ico'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  return typeof picked === 'string' ? picked : null
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri()) return 'C:\\Users\\Public\\Downloads'
  const picked = await open({ title: '폴더 선택', multiple: false, directory: true })
  return typeof picked === 'string' ? picked : null
}
