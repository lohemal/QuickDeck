/**
 * 버튼 실행키(1/2/3/4, Q/W/E/R, A/S/D/F …) 처리 여부를 정하는 가드.
 *
 * 원칙: 텍스트를 입력할 수 있는 요소에 포커스가 있으면 실행키를 처리하지 않는다.
 * 검색 입력창, 편집 다이얼로그의 입력란, DevBar 의 숫자 입력 모두 여기에 해당한다.
 *
 * P4 에서 전역 keydown 핸들러가 `shouldHandleDeckHotkey(e)` 로 먼저 걸러 쓰도록 만들어 두었다.
 * DOM 에 의존하지 않는 duck-typing 이라 Node 에서도 테스트할 수 있다.
 */

export interface EditableLike {
  tagName?: string
  type?: string
  isContentEditable?: boolean
  readOnly?: boolean
  disabled?: boolean
  getAttribute?: (name: string) => string | null
}

/** 입력 요소가 아닌 <input type> — 이런 것들에 포커스가 있어도 실행키는 살아 있어야 한다 */
const NON_TEXT_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'])

export function isEditableElement(el: EditableLike | null | undefined): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName?.toUpperCase()
  if (tag === 'TEXTAREA') return !el.disabled
  if (tag === 'INPUT') {
    const type = (el.type ?? 'text').toLowerCase()
    return !NON_TEXT_INPUT_TYPES.has(type) && !el.disabled
  }
  if (tag === 'SELECT') return true // 화살표·문자 입력으로 옵션을 고르므로 실행키와 충돌
  const role = el.getAttribute?.('role')
  return role === 'textbox' || role === 'searchbox' || role === 'combobox'
}

export function isTextInputFocused(doc: Pick<Document, 'activeElement'> = document): boolean {
  return isEditableElement(doc.activeElement as unknown as EditableLike | null)
}

export interface HotkeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  isComposing?: boolean
  target?: EditableLike | null
}

/**
 * 이 키 입력을 덱 실행키로 다뤄도 되는가.
 * - 입력 요소에 포커스/타깃이면 안 됨
 * - IME 조합 중이면 안 됨 (한글 입력 도중 키가 새지 않도록)
 * - Ctrl/Alt/Meta 조합은 실행키가 아님 (전역 단축키·시스템 단축키에 양보)
 * - 모달(다이얼로그)이 떠 있으면 안 됨
 */
export function shouldHandleDeckHotkey(e: HotkeyEventLike, opts: { dialogOpen?: boolean; activeElement?: EditableLike | null } = {}): boolean {
  if (e.isComposing) return false
  if (e.ctrlKey || e.altKey || e.metaKey) return false
  if (opts.dialogOpen) return false
  if (isEditableElement(e.target)) return false
  if (isEditableElement(opts.activeElement)) return false
  return true
}
