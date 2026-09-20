import type { Action, SystemCommand } from '../../model/action.ts'
import type { Deck, DeckButton, IconRef } from '../../model/deck.ts'
import { isBuiltinIconName, type BuiltinIconName } from './builtinNames.ts'
import { isManagedIconId } from './managed.ts'

/**
 * IconRef + Action → 실제로 그릴 것 (순수 로직).
 *
 * - none     → 아무것도 안 그림
 * - builtin  → 그 이름 (모르는 이름이면 동작 기본 아이콘)
 * - image / extracted → 관리 파일 (+ 못 읽을 때 폴백할 내장 아이콘)
 * - auto     → 프로그램·파일은 셸 아이콘 추출 결과(있으면) → 없거나 실패면 동작 기본 아이콘
 *              폴더·웹·검색·시스템은 동작 기본 아이콘
 */
export type ResolvedIcon =
  | { kind: 'none' }
  | { kind: 'builtin'; name: BuiltinIconName }
  | { kind: 'managed'; file: string; fallback: BuiltinIconName }

export const SYSTEM_ICON: Record<SystemCommand, BuiltinIconName> = {
  'play-pause': 'play-pause',
  'prev-track': 'previous',
  'next-track': 'next',
  'volume-up': 'volume-up',
  'volume-down': 'volume-down',
  mute: 'mute',
  'lock-screen': 'lock',
  sleep: 'sleep',
  'log-off': 'logout',
  restart: 'restart',
  shutdown: 'shutdown',
  'file-explorer': 'explorer',
  'windows-settings': 'settings',
  'task-manager': 'task-manager',
  'screen-capture': 'screenshot',
}

const FILE_TYPE_ICON: Array<[BuiltinIconName, string[]]> = [
  ['spreadsheet', ['xlsx', 'xlsm', 'xls', 'csv', 'ods', 'cell']],
  ['presentation', ['pptx', 'ppt', 'odp', 'show']],
  ['pdf', ['pdf']],
  ['document', ['docx', 'doc', 'hwp', 'hwpx', 'hwt', 'odt', 'rtf', 'txt', 'md']],
  ['image', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'heic']],
  ['video', ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm']],
  ['music', ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'wma']],
  ['archive', ['zip', '7z', 'rar', 'tar', 'gz']],
  ['code', ['js', 'ts', 'py', 'rs', 'json', 'html', 'css', 'bat', 'ps1']],
]

/** 확장자로 고르는 파일 기본 아이콘 (셸 아이콘을 못 얻었을 때의 폴백) */
export function fileTypeIcon(path: string): BuiltinIconName {
  const base = path.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
  if (!ext) return 'file'
  for (const [icon, exts] of FILE_TYPE_ICON) if (exts.includes(ext)) return icon
  return 'file'
}

/** 동작 종류별 기본 내장 아이콘 (auto 의 최종 폴백이자 관리 파일의 폴백) */
export function autoBuiltinFor(action: Action): BuiltinIconName {
  switch (action.type) {
    case 'website':
      return 'web'
    case 'search':
      return 'search'
    case 'folder':
      return 'folder'
    case 'program':
      return 'program'
    case 'file':
      return fileTypeIcon(action.path)
    case 'system':
      return SYSTEM_ICON[action.command] ?? 'settings'
  }
}

/** auto 아이콘이 셸에서 추출해야 하는 원본 경로. 프로그램·파일만 해당 (폴더는 내장 폴더 아이콘) */
export function autoShellSource(button: Pick<DeckButton, 'icon' | 'action'>): string | null {
  if (button.icon.kind !== 'auto') return null
  const a = button.action
  if (a.type === 'program' || a.type === 'file') return a.path || null
  return null
}

/**
 * @param extracted auto 버튼의 추출 결과: 관리 id | null(없음·실패·아직) — useExtractedIcon 이 준다
 */
export function resolveIcon(button: Pick<DeckButton, 'icon' | 'action'>, extracted: string | null = null): ResolvedIcon {
  const icon: IconRef = button.icon
  const fallback = autoBuiltinFor(button.action)
  switch (icon.kind) {
    case 'none':
      return { kind: 'none' }
    case 'builtin':
      return { kind: 'builtin', name: isBuiltinIconName(icon.name) ? icon.name : fallback }
    case 'image':
    case 'extracted':
      return isManagedIconId(icon.file) ? { kind: 'managed', file: icon.file, fallback } : { kind: 'builtin', name: fallback }
    case 'auto':
      // 추출 결과는 셸 아이콘을 쓰는 동작(프로그램·파일)에서만 의미가 있다
      if (extracted && autoShellSource(button) && isManagedIconId(extracted)) return { kind: 'managed', file: extracted, fallback }
      return { kind: 'builtin', name: fallback }
  }
}

/**
 * 정리(cleanup)에 넘길 참조 목록. 여러 버튼이 같은 파일·경로를 써도 한 번만 넣는다.
 * - files: image/extracted 가 직접 가리키는 관리 id
 * - paths: auto 프로그램·파일 버튼의 원본 경로 (Rust 가 캐시 id 로 환산해 보존)
 */
export function collectIconReferences(decks: Array<Pick<Deck, 'buttons'>>): { files: string[]; paths: string[] } {
  const files = new Set<string>()
  const paths = new Set<string>()
  for (const deck of decks) {
    for (const b of deck.buttons) {
      if ((b.icon.kind === 'image' || b.icon.kind === 'extracted') && isManagedIconId(b.icon.file)) files.add(b.icon.file)
      const src = autoShellSource(b)
      if (src) paths.add(src)
    }
  }
  return { files: [...files], paths: [...paths] }
}
