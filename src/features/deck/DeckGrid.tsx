import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { allPositions, findButtonAt, type Deck, type DeckButton, type Position } from '@/model/deck'
import { DeckButtonView } from './DeckButtonView'
import { EmptySlot } from './EmptySlot'
import { metricsToCssVars, useDeckMetrics, type DeckMetrics } from './useDeckMetrics'
import styles from './deck.module.css'

interface Props {
  deck: Deck
  onRun: (button: DeckButton, element: HTMLButtonElement) => void
  onAdd: (position: Position) => void
  onButtonContextMenu: (button: DeckButton, e: MouseEvent) => void
  /** 검색 팝오버가 열린 버튼 id 와 팝오버 요소 id (aria 연결용) */
  popover?: { buttonId: string; id: string } | null
  /** 우클릭 메뉴가 열린 버튼 id (그 버튼을 강조) */
  menuButtonId?: string | null
  /** 개발용 상태 표시 등에서 현재 치수를 보고 싶을 때 */
  onMetrics?: (m: DeckMetrics) => void
}

/**
 * 덱 격자. 컨테이너 크기를 관찰해 셀 크기를 계산하고 CSS 변수로 자식에게 전달한다.
 * 버튼·빈 슬롯은 CSS 변수만 보고 그리므로 창 크기가 바뀌면 모두 함께 움직인다.
 */
export function DeckGrid({ deck, onRun, onAdd, onButtonContextMenu, popover, menuButtonId, onMetrics }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const metrics = useDeckMetrics(containerRef, deck.layout)

  useEffect(() => {
    onMetrics?.(metrics)
    // 치수가 실제로 바뀐 경우에만 알린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics.cell, metrics.fontSize, metrics.compact, onMetrics])

  const style = {
    ...metricsToCssVars(metrics),
    '--cols': String(deck.layout.columns),
    '--rows': String(deck.layout.rows),
  } as CSSProperties

  return (
    <div ref={containerRef} className={styles.container}>
      {metrics.cell > 0 && (
        <div className={styles.grid} style={style} role="grid" aria-label={deck.name}>
          {allPositions(deck.layout).map((pos) => {
            const button = findButtonAt(deck, pos)
            const key = `${pos.row}-${pos.col}`
            return button ? (
              <DeckButtonView
                key={button.id}
                button={button}
                compact={metrics.compact}
                popoverOpen={popover?.buttonId === button.id}
                popoverId={popover?.id}
                menuOpen={menuButtonId === button.id}
                onRun={onRun}
                onContextMenu={onButtonContextMenu}
              />
            ) : (
              <EmptySlot key={key} position={pos} onAdd={onAdd} />
            )
          })}
        </div>
      )}
    </div>
  )
}
