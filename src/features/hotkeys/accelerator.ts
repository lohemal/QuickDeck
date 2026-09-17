/**
 * 전역 호출 단축키(accelerator) 문자열 다루기.
 *
 * 저장 형식은 Tauri global-shortcut 이 파싱하는 문자열이다: "Ctrl+Shift+Space", "Alt+F1", "Ctrl+Alt+Q".
 * 사용자가 문자열을 직접 치지 않고 키를 눌러 등록하므로, 여기서는
 *  - KeyboardEvent → accelerator 문자열
 *  - 전역 단축키로 적절한지 검증
 *  - 화면 표시용 문자열 ("Ctrl + Shift + Space")
 * 만 담당한다. 실제 등록은 Rust(hotkey.rs)가 하며 실패하면 이전 단축키를 유지한다.
 */

export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Super'
const MODIFIER_ORDER: Modifier[] = ['Ctrl', 'Alt', 'Shift', 'Super']

export interface ParsedAccelerator {
  modifiers: Modifier[]
  key: string
}

export interface KeyEventLike {
  code: string
  key: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/** 눌린 키가 수식키 자체인지 (조합이 완성되지 않은 상태) */
export function isModifierCode(code: string): boolean {
  return /^(Control|Alt|Shift|Meta)(Left|Right)?$|^(OS|Super)(Left|Right)?$/.test(code)
}

/** `event.code` 를 accelerator 의 키 이름으로. 지원하지 않는 키면 null */
export function keyNameFromCode(code: string): string | null {
  let m: RegExpExecArray | null
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1]!
  if ((m = /^Digit([0-9])$/.exec(code))) return m[1]!
  if ((m = /^Numpad([0-9])$/.exec(code))) return `Numpad${m[1]}`
  if ((m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(code))) return `F${m[1]}`
  const named: Record<string, string> = {
    Space: 'Space',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    NumpadAdd: 'NumAdd',
    NumpadSubtract: 'NumSubtract',
    NumpadMultiply: 'NumMultiply',
    NumpadDivide: 'NumDivide',
    NumpadDecimal: 'NumDecimal',
    NumpadEnter: 'NumEnter',
  }
  return named[code] ?? null
}

/** 키 이벤트 → accelerator. 수식키만 눌렸거나 지원하지 않는 키면 null */
export function acceleratorFromEvent(e: KeyEventLike): string | null {
  if (isModifierCode(e.code)) return null
  const key = keyNameFromCode(e.code)
  if (!key) return null
  const mods: Modifier[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  return [...mods, key].join('+')
}

export function parseAccelerator(accel: string): ParsedAccelerator | null {
  const parts = accel.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const key = parts[parts.length - 1]!
  const modifiers: Modifier[] = []
  for (const p of parts.slice(0, -1)) {
    const m = normalizeModifier(p)
    if (!m) return null
    if (!modifiers.includes(m)) modifiers.push(m)
  }
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return { modifiers, key }
}

function normalizeModifier(p: string): Modifier | null {
  switch (p.toLowerCase()) {
    case 'ctrl':
    case 'control':
    case 'commandorcontrol':
    case 'cmdorctrl':
      return 'Ctrl'
    case 'alt':
    case 'option':
      return 'Alt'
    case 'shift':
      return 'Shift'
    case 'super':
    case 'win':
    case 'windows':
    case 'meta':
    case 'cmd':
    case 'command':
      return 'Super'
    default:
      return null
  }
}

/** Windows 가 예약하거나 가로채는 조합. 등록이 되더라도 사용자가 곤란해지는 것들 */
const RESERVED: ReadonlySet<string> = new Set([
  'Alt+F4',
  'Alt+Tab',
  'Alt+Shift+Tab',
  'Alt+Escape',
  'Ctrl+Alt+Delete',
  'Ctrl+Shift+Escape',
  'Ctrl+Escape',
  'Super+L',
  'Super+D',
  'Super+Tab',
  'Super+E',
  'Super+R',
])

/**
 * 전역 단축키로 쓸 수 있는가. 문제가 있으면 사용자에게 보여줄 이유를 돌려준다.
 * 규칙: 기능키(F1~F24)는 단독 허용, 그 외는 Ctrl/Alt/Super 중 하나 이상 필요(Shift 만은 타이핑과 충돌).
 */
export function validateAccelerator(accel: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseAccelerator(accel)
  if (!parsed) return { ok: false, reason: '알 수 없는 키 조합입니다.' }
  const { modifiers, key } = parsed
  const isFunctionKey = /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
  const strong = modifiers.some((m) => m === 'Ctrl' || m === 'Alt' || m === 'Super')
  if (!isFunctionKey && !strong) {
    return { ok: false, reason: 'Ctrl, Alt, Win 중 하나 이상을 함께 눌러야 합니다. (Shift 만으로는 글자 입력과 겹칩니다)' }
  }
  if (RESERVED.has(formatAccelerator(accel))) return { ok: false, reason: 'Windows 가 사용하는 조합이라 쓸 수 없습니다.' }
  return { ok: true }
}

/** 정규화된 저장 문자열 (수식키 순서 고정) */
export function formatAccelerator(accel: string): string {
  const p = parseAccelerator(accel)
  return p ? [...p.modifiers, p.key].join('+') : accel
}

/** 화면 표시용: "Ctrl + Shift + Space" (Super 는 Win 으로) */
export function displayAccelerator(accel: string): string {
  const p = parseAccelerator(accel)
  if (!p) return accel
  return [...p.modifiers.map((m) => (m === 'Super' ? 'Win' : m)), p.key].join(' + ')
}
