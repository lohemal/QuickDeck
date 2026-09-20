import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { Deck, DeckButton, Position } from '@/model/deck'
import type { DeckMetrics } from './useDeckMetrics'
import { exceedsDragThreshold, planDrop, slotAtPoint, type DropPlan } from './reorder'

/**
 * 버튼 드래그 배치 (Pointer Events, 자체 구현).
 *
 * 왜 HTML5 drag/drop 이 아니라 Pointer Events 인가
 * - 클릭(실행)과 드래그를 "이동 거리" 로 나눠야 하는데 native DnD 는 dragstart 시점을 우리가 정할 수 없다
 * - native 의 반투명 스크린샷 드래그 이미지 대신 덱과 같은 표면의 미리보기를 그리려면 어차피 직접 그려야 한다
 * - WebView2 에서 native DnD 는 OS 드래그 세션을 열어 창 포커스·hover 상태가 어긋나는 경우가 있다
 *
 * 흐름
 *  pointerdown(왼쪽 버튼) → 후보 기억(아직 아무것도 안 함, 클릭이면 그대로 click 이 실행된다)
 *  pointermove 로 DRAG_THRESHOLD_PX 이상 이동 → 드래그 시작: pointer capture, 미리보기, 대상 슬롯 계산
 *  pointerup → 대상 슬롯에 drop (move/swap) 을 한 번 호출. 격자 밖이면 취소
 *  Esc / pointercancel / 창 blur → 취소 (데이터 변화 없음)
 *
 * 드래그가 있었던 pointerdown 의 click 은 무시한다 (드래그 후 실행/검색창/추가가 열리지 않도록).
 * 플래그는 click 이 소비하거나 다음 pointerdown 이 지우므로, click 이 안 오더라도 다음 클릭을 잡아먹지 않는다.
 */

export interface DragState {
  sourceId: string
  /** 현재 포인터가 가리키는 슬롯 (격자 밖이면 null) */
  over: Position | null
  plan: DropPlan
  /** 미리보기 위치 (뷰포트 px, 셀의 왼쪽 위) */
  x: number
  y: number
}

interface Options {
  deck: Deck
  metrics: DeckMetrics
  gridRef: RefObject<HTMLElement | null>
  /** 다이얼로그·메뉴가 열려 있으면 드래그를 시작하지 않는다 */
  disabled: boolean
  onDrop: (sourceId: string, target: Position) => void
  /** 드래그가 실제로 시작될 때 (호출자는 팝오버·메뉴를 닫는다) */
  onDragStart?: () => void
}

interface Pending {
  button: DeckButton
  pointerId: number
  element: HTMLElement
  startX: number
  startY: number
  /** 포인터가 버튼 안 어디를 잡았는지 (미리보기가 그 지점을 따라가도록) */
  offsetX: number
  offsetY: number
  active: boolean
}

export function useDragReorder({ deck, metrics, gridRef, disabled, onDrop, onDragStart }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const ignoreNextClick = useRef(false)
  const latest = useRef({ deck, metrics, disabled, onDrop, onDragStart })
  latest.current = { deck, metrics, disabled, onDrop, onDragStart }

  const geometry = useCallback(() => {
    const el = gridRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const { cell, gap } = latest.current.metrics
    return { left: r.left, top: r.top, cell, gap }
  }, [gridRef])

  const finish = useCallback((commit: boolean) => {
    const p = pendingRef.current
    pendingRef.current = null
    if (!p) return
    if (p.active) {
      ignoreNextClick.current = true
      try {
        if (p.element.hasPointerCapture(p.pointerId)) p.element.releasePointerCapture(p.pointerId)
      } catch {
        /* 이미 해제됨 */
      }
    }
    setDrag((cur) => {
      if (commit && cur && p.active && cur.plan.kind !== 'none' && cur.over) latest.current.onDrop(cur.sourceId, cur.over)
      return null
    })
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current
      if (!p || e.pointerId !== p.pointerId) return
      if (!p.active) {
        if (!exceedsDragThreshold(p.startX, p.startY, e.clientX, e.clientY)) return
        if (latest.current.disabled) {
          pendingRef.current = null
          return
        }
        p.active = true
        try {
          p.element.setPointerCapture(p.pointerId)
        } catch {
          /* 캡처가 안 되면 window 리스너만으로 진행 */
        }
        latest.current.onDragStart?.()
      }
      const g = geometry()
      const over = g ? slotAtPoint(g, latest.current.deck.layout, e.clientX, e.clientY) : null
      setDrag({
        sourceId: p.button.id,
        over,
        plan: planDrop(latest.current.deck, p.button.id, over),
        x: e.clientX - p.offsetX,
        y: e.clientY - p.offsetY,
      })
    }
    const onUp = (e: PointerEvent) => {
      const p = pendingRef.current
      if (!p || e.pointerId !== p.pointerId) return
      finish(true)
    }
    const onCancel = (e: PointerEvent) => {
      const p = pendingRef.current
      if (!p || e.pointerId !== p.pointerId) return
      finish(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !pendingRef.current?.active) return
      e.preventDefault()
      e.stopPropagation() // 덱의 Esc(숨김) 보다 먼저: 드래그 취소만 한다
      finish(false)
    }
    const onBlur = () => {
      if (pendingRef.current) finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [geometry, finish])

  // 덱이 바뀌면(삭제·편집·격자 변경) 진행 중인 드래그는 의미가 없으므로 취소
  useEffect(() => {
    if (pendingRef.current?.active) finish(false)
  }, [deck, finish])

  /** 버튼의 onPointerDown 에 연결한다 */
  const onPointerDown = useCallback((button: DeckButton, e: ReactPointerEvent<HTMLElement>) => {
    ignoreNextClick.current = false
    if (e.button !== 0 || latest.current.disabled) return
    if (pendingRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      button,
      pointerId: e.pointerId,
      element: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      active: false,
    }
  }, [])

  /** click 핸들러가 먼저 부른다. 방금 드래그였다면 true (실행하지 않는다) */
  const consumeClick = useCallback(() => {
    if (!ignoreNextClick.current) return false
    ignoreNextClick.current = false
    return true
  }, [])

  return { drag, onPointerDown, consumeClick }
}
