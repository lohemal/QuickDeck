// Node 검사 스크립트(scripts/check-*.ts)에서도 읽히도록 값 import 는 상대 경로를 쓴다
import { visibleButtons, type Deck, type DeckButton } from '../../model/deck.ts'

/**
 * 버튼 실행키(저장값: "Q", "1" 같은 한 글자) ↔ 물리 키 코드(`KeyboardEvent.code`) 대응.
 *
 * 한국어 IME 가 켜져 있으면 `event.key` 가 "ㅂ" 처럼 들어오므로 물리 키 기준인 `code` 로 판정한다.
 * 숫자는 윗줄(Digit1)과 숫자패드(Numpad1) 모두 허용한다. 대소문자는 구분하지 않는다.
 *
 * 예외: 매크로 도구·원격 데스크톱처럼 스캔코드 없이 키를 주입하면 `code` 가 "" 로 온다.
 * 그때만 `key` 가 영문/숫자 한 글자인 경우 대체로 쓴다 (IME 로 한글이 들어오면 대체하지 않는다).
 */
const CODE_PATTERN = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/

/** 'KeyQ' → 'Q', 'Digit1' | 'Numpad1' → '1'. 실행키로 쓸 수 없는 키면 null */
export function hotkeyFromCode(code: string): string | null {
  const m = CODE_PATTERN.exec(code)
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? null
}

/** 키 이벤트에서 실행키 글자를 뽑는다. code 우선, 없으면 key(ASCII 한 글자)로 대체 */
export function hotkeyFromEvent(e: { code: string; key: string }): string | null {
  const fromCode = hotkeyFromCode(e.code)
  if (fromCode) return fromCode
  if (e.code === '' && /^[a-zA-Z0-9]$/.test(e.key)) return e.key.toUpperCase()
  return null
}

/** 'q' → 'KeyQ', '1' → 'Digit1'. 유효하지 않으면 null */
export function codeForHotkey(hotkey: string): string | null {
  const k = hotkey.trim().toUpperCase()
  if (/^[A-Z]$/.test(k)) return `Key${k}`
  if (/^[0-9]$/.test(k)) return `Digit${k}`
  return null
}

export function matchesHotkey(hotkey: string | null | undefined, code: string): boolean {
  if (!hotkey) return false
  const fromCode = hotkeyFromCode(code)
  return fromCode !== null && fromCode === hotkey.trim().toUpperCase()
}

/**
 * 눌린 키에 해당하는 버튼. 저장된 실행키만 본다(프리셋 하드코딩 없음).
 * 격자 밖에 보존된 버튼은 화면에 없으므로 실행하지 않는다.
 */
export function findButtonForEvent(deck: Pick<Deck, 'buttons' | 'layout'>, e: { code: string; key: string }): DeckButton | undefined {
  const pressed = hotkeyFromEvent(e)
  if (!pressed) return undefined
  return visibleButtons(deck).find((b) => b.hotkey?.trim().toUpperCase() === pressed)
}

export function findButtonByCode(deck: Pick<Deck, 'buttons' | 'layout'>, code: string): DeckButton | undefined {
  return findButtonForEvent(deck, { code, key: '' })
}
