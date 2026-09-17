import type { Action } from './action'

/** 격자 위치 (0 부터 시작, 왼쪽 위가 원점) */
export interface Position {
  row: number
  col: number
}

export type DisplayMode = 'icon' | 'text' | 'icon-text'

/**
 * 아이콘 정보.
 *  - none     : 아이콘 없음 (자리표시자 표시)
 *  - builtin  : 앱 내장 아이콘 세트의 이름 (세트는 이후 단계에서 제작)
 *  - extracted: 프로그램/파일에서 추출한 아이콘 (앱 데이터 폴더에 저장된 파일명)
 *  - image    : 사용자가 고른 이미지 (등록 시 검증·리사이즈 후 앱 데이터 폴더에 저장된 파일명)
 */
export type IconRef =
  | { kind: 'none' }
  | { kind: 'builtin'; name: string }
  | { kind: 'extracted'; file: string }
  | { kind: 'image'; file: string }

export interface DeckButton {
  id: string
  position: Position
  name: string
  action: Action
  icon: IconRef
  /** 덱이 호출된 상태에서 이 버튼을 실행하는 단일 키 (예: "Q"). 없으면 null */
  hotkey: string | null
  display: DisplayMode
}

export interface DeckLayout {
  columns: number
  rows: number
}

export interface Deck {
  id: string
  name: string
  layout: DeckLayout
  buttons: DeckButton[]
}

export const DEFAULT_LAYOUT: DeckLayout = { columns: 4, rows: 3 }
export const DEFAULT_DISPLAY: DisplayMode = 'icon-text'

/**
 * 행/열 허용 범위. 최소 2×1(한 줄 두 칸), 최대 10×6.
 * 기본 실행키 배열(keys.ts)은 키보드 4행이라 5행 이상은 자동 제안이 없다.
 */
export const LAYOUT_LIMITS = { minColumns: 2, maxColumns: 10, minRows: 1, maxRows: 6 } as const

/** 현재 격자 안에 있어 화면에 보이는 버튼들. 격자 밖 버튼은 데이터로만 남아 있다 */
export function visibleButtons(deck: Pick<Deck, 'buttons' | 'layout'>): DeckButton[] {
  return deck.buttons.filter((b) => isInsideLayout(b.position, deck.layout))
}

/** 행/열을 줄여 격자 밖으로 나간 버튼들 (삭제되지 않고 보존된다) */
export function hiddenButtons(deck: Pick<Deck, 'buttons' | 'layout'>): DeckButton[] {
  return deck.buttons.filter((b) => !isInsideLayout(b.position, deck.layout))
}

export function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col
}

export function isInsideLayout(p: Position, layout: DeckLayout): boolean {
  return p.row >= 0 && p.row < layout.rows && p.col >= 0 && p.col < layout.columns
}

export function findButtonAt(deck: Deck, p: Position): DeckButton | undefined {
  return deck.buttons.find((b) => samePosition(b.position, p))
}

/** 이 실행키를 쓰는 버튼. excludeId 는 편집 중인 자기 자신을 빼기 위한 것 */
export function findHotkeyOwner(deck: Deck, hotkey: string, excludeId?: string): DeckButton | undefined {
  const key = hotkey.toUpperCase()
  return deck.buttons.find((b) => b.id !== excludeId && b.hotkey?.toUpperCase() === key)
}

/** 행 우선 순서로 모든 슬롯 위치를 나열한다 */
export function allPositions(layout: DeckLayout): Position[] {
  const out: Position[] = []
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.columns; col++) out.push({ row, col })
  }
  return out
}
