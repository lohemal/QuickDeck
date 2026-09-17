import type { Position } from './deck'

/**
 * 기본 실행키 배열. 키보드 왼쪽 영역과 화면 버튼 위치가 대응되도록
 * 실제 키보드 행(숫자열·QWERTY·ASDF·ZXCV)을 그대로 따른다.
 * 4×3 기본 덱에서는 1234 / QWER / ASDF 가 된다.
 */
const KEYBOARD_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'] as const

export function defaultHotkeyFor(position: Position): string | null {
  const row = KEYBOARD_ROWS[position.row]
  if (!row) return null
  return row[position.col] ?? null
}

/** 사용자가 실행키로 지정할 수 있는 단일 키인지 (영문 대문자 1자 또는 숫자 1자) */
export function isValidHotkey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key)
}
