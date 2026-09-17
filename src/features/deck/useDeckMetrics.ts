import { useEffect, useState, type RefObject } from 'react'
import type { DeckLayout } from '@/model/deck'

/**
 * 창 크기와 행/열에서 계산한 덱 치수. 모두 px.
 * 버튼·아이콘·글자·간격·키 배지가 이 값 하나(cell)에 비례해 함께 움직인다.
 */
export interface DeckMetrics {
  /** 버튼 한 변의 길이 (정사각형) */
  cell: number
  gap: number
  iconSize: number
  fontSize: number
  badgeFontSize: number
  radius: number
  padding: number
  /**
   * 텍스트를 한 글자도 그릴 수 없는 극단적 크기일 때만 true.
   * 사용자가 고른 표시 방식은 원칙적으로 지키고, 이 경우에만 아이콘만 그린다.
   */
  compact: boolean
}

const RATIO = {
  gap: 0.08,
  icon: 0.42,
  font: 0.13,
  badgeFont: 0.1,
  radius: 0.12,
  padding: 0.08,
} as const

const LIMITS = {
  gap: [4, 20],
  font: [8, 22],
  badgeFont: [7, 14],
  /** 이 아래에서는 아이콘(0.42) + 최소 글자 한 줄 + 여백이 셀에 들어가지 않는다 */
  compactBelow: 34,
} as const

/** 컨테이너 크기와 레이아웃만으로 계산하는 순수 함수 (테스트·재사용 용이) */
export function computeDeckMetrics(width: number, height: number, layout: DeckLayout): DeckMetrics {
  const cols = Math.max(1, layout.columns)
  const rows = Math.max(1, layout.rows)

  // gap 은 cell 에 비례하므로 먼저 비율로 cell 을 구한 뒤 gap 을 한계 안으로 넣고 다시 맞춘다
  const byWidth = width / (cols + RATIO.gap * (cols - 1))
  const byHeight = height / (rows + RATIO.gap * (rows - 1))
  let cell = Math.max(0, Math.min(byWidth, byHeight))
  const gap = clamp(cell * RATIO.gap, LIMITS.gap)
  cell = Math.max(0, Math.min((width - gap * (cols - 1)) / cols, (height - gap * (rows - 1)) / rows))
  cell = Math.floor(cell)

  return {
    cell,
    gap: Math.round(gap),
    iconSize: Math.round(cell * RATIO.icon),
    fontSize: Math.round(clamp(cell * RATIO.font, LIMITS.font)),
    badgeFontSize: Math.round(clamp(cell * RATIO.badgeFont, LIMITS.badgeFont)),
    radius: Math.round(cell * RATIO.radius),
    padding: Math.round(cell * RATIO.padding),
    compact: cell < LIMITS.compactBelow,
  }
}

function clamp(v: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, v))
}

/** 컨테이너 요소 크기를 관찰해 DeckMetrics 를 갱신한다 */
export function useDeckMetrics(ref: RefObject<HTMLElement | null>, layout: DeckLayout): DeckMetrics {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return computeDeckMetrics(size.width, size.height, layout)
}

/** 메트릭을 CSS 변수로 바꿔 격자 요소의 style 에 얹는다 */
export function metricsToCssVars(m: DeckMetrics): Record<string, string> {
  return {
    '--cell': `${m.cell}px`,
    '--gap': `${m.gap}px`,
    '--icon': `${m.iconSize}px`,
    '--font': `${m.fontSize}px`,
    '--badge-font': `${m.badgeFontSize}px`,
    '--radius': `${m.radius}px`,
    '--pad': `${m.padding}px`,
  }
}
