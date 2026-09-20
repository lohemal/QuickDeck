// Node 검사 스크립트(scripts/check-reorder.ts)에서도 읽히도록 값 import 는 상대 경로를 쓴다
import { findButtonAt, isInsideLayout, samePosition, type Deck, type DeckLayout, type Position } from '../../model/deck.ts'

/**
 * 버튼 드래그 배치의 순수 로직. DOM 과 무관하며 훅(useDragReorder)이 이 함수들만 호출한다.
 *
 * 규칙
 * - 드래그 대상과 drop 대상은 모두 현재 격자 안의 슬롯이어야 한다 (격자 밖 보존 버튼은 건드리지 않는다)
 * - 빈 슬롯에 놓으면 이동, 다른 버튼 위에 놓으면 두 버튼의 위치를 서로 바꾼다
 * - 같은 슬롯에 놓거나 대상이 유효하지 않으면 아무 변화도 없다 (null)
 * - 결과에서 두 버튼이 같은 row/col 을 갖는 일은 구조적으로 없다 (교환은 두 값을 동시에 바꾼다)
 */

/** 이 거리(CSS px) 이상 움직여야 드래그로 본다. 그 안에서 떼면 일반 클릭(실행)이다 */
export const DRAG_THRESHOLD_PX = 8

export type DropPlan = { kind: 'none' } | { kind: 'move'; target: Position } | { kind: 'swap'; target: Position; withId: string }

export function planDrop(deck: Deck, sourceId: string, target: Position | null): DropPlan {
  if (!target) return { kind: 'none' }
  const source = deck.buttons.find((b) => b.id === sourceId)
  if (!source) return { kind: 'none' }
  if (!isInsideLayout(source.position, deck.layout) || !isInsideLayout(target, deck.layout)) return { kind: 'none' }
  if (!Number.isInteger(target.row) || !Number.isInteger(target.col)) return { kind: 'none' }
  if (samePosition(source.position, target)) return { kind: 'none' }
  const occupant = findButtonAt(deck, target)
  if (occupant && occupant.id !== sourceId) return { kind: 'swap', target, withId: occupant.id }
  return { kind: 'move', target }
}

/**
 * drop 을 적용한 새 덱. 변화가 없으면 null (호출자는 저장하지 않는다).
 * 버튼 배열의 순서와 id·이름·동작·아이콘·실행키·표시 방식은 그대로이고 position 만 바뀐다.
 */
export function applyDrop(deck: Deck, sourceId: string, target: Position | null): Deck | null {
  const plan = planDrop(deck, sourceId, target)
  if (plan.kind === 'none') return null
  const source = deck.buttons.find((b) => b.id === sourceId)!
  const from = source.position
  const to = { row: plan.target.row, col: plan.target.col }
  const buttons = deck.buttons.map((b) => {
    if (b.id === sourceId) return { ...b, position: to }
    if (plan.kind === 'swap' && b.id === plan.withId) return { ...b, position: { ...from } }
    return b
  })
  return { ...deck, buttons }
}

/** 격자 요소의 화면 위치와 셀 치수 */
export interface GridGeometry {
  left: number
  top: number
  cell: number
  gap: number
}

/**
 * 화면 좌표가 가리키는 슬롯. 격자 영역(셀과 셀 사이 간격 포함) 밖이면 null.
 * 간격 위에 있으면 가장 가까운 셀로 붙여 drop 이 답답하지 않게 한다.
 */
export function slotAtPoint(geometry: GridGeometry, layout: DeckLayout, x: number, y: number): Position | null {
  const pitch = geometry.cell + geometry.gap
  if (pitch <= 0) return null
  const width = layout.columns * pitch - geometry.gap
  const height = layout.rows * pitch - geometry.gap
  const dx = x - geometry.left
  const dy = y - geometry.top
  const tolerance = geometry.gap / 2
  if (dx < -tolerance || dy < -tolerance || dx > width + tolerance || dy > height + tolerance) return null
  const col = Math.min(layout.columns - 1, Math.max(0, Math.floor((dx + geometry.gap / 2) / pitch)))
  const row = Math.min(layout.rows - 1, Math.max(0, Math.floor((dy + geometry.gap / 2) / pitch)))
  return { row, col }
}

/** 두 점 사이 거리가 임계값 이상인가 (드래그 시작 판정) */
export function exceedsDragThreshold(startX: number, startY: number, x: number, y: number, threshold = DRAG_THRESHOLD_PX): boolean {
  const dx = x - startX
  const dy = y - startY
  return dx * dx + dy * dy >= threshold * threshold
}
