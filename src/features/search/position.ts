/**
 * 팝오버 위치 계산 (순수 함수). 화면 좌표(px) 기준.
 *
 * - 기본은 앵커(검색 버튼) 바로 아래, 왼쪽 정렬
 * - 아래 공간이 부족하면 위로 전환
 * - 위·아래 모두 부족하면 더 넓은 쪽에 두고 창 안으로 밀어 넣는다
 * - 좌우는 창 밖으로 나가지 않게 보정한다
 */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export type Placement = 'below' | 'above'

export interface PopoverPosition {
  left: number
  top: number
  placement: Placement
}

export const POPOVER_GAP = 6
export const POPOVER_MARGIN = 6

export function computePopoverPosition(anchor: Rect, popover: Size, viewport: Size, gap = POPOVER_GAP, margin = POPOVER_MARGIN): PopoverPosition {
  const belowTop = anchor.top + anchor.height + gap
  const aboveTop = anchor.top - gap - popover.height
  const fitsBelow = belowTop + popover.height + margin <= viewport.height
  const fitsAbove = aboveTop >= margin

  let placement: Placement
  if (fitsBelow) placement = 'below'
  else if (fitsAbove) placement = 'above'
  else {
    const spaceBelow = viewport.height - (anchor.top + anchor.height)
    const spaceAbove = anchor.top
    placement = spaceBelow >= spaceAbove ? 'below' : 'above'
  }

  const maxTop = Math.max(margin, viewport.height - popover.height - margin)
  const top = clamp(placement === 'below' ? belowTop : aboveTop, margin, maxTop)
  const maxLeft = Math.max(margin, viewport.width - popover.width - margin)
  const left = clamp(anchor.left, margin, maxLeft)

  return { left, top, placement }
}

/** 팝오버 너비: 버튼 너비 이상, 최소 220px, 창 너비를 넘지 않게 */
export function computePopoverWidth(anchorWidth: number, viewportWidth: number, min = 220, margin = POPOVER_MARGIN): number {
  return Math.max(0, Math.min(Math.max(anchorWidth, min), viewportWidth - margin * 2))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
