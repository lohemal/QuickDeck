import { useCallback, useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { allPositions, findButtonAt, samePosition, type Deck, type DeckButton, type Position } from '@/model/deck'
import { DeckButtonView } from './DeckButtonView'
import { EmptySlot } from './EmptySlot'
import { IconView } from './IconView'
import { useDragReorder } from './useDragReorder'
import { metricsToCssVars, useDeckMetrics, type DeckMetrics } from './useDeckMetrics'
import styles from './deck.module.css'

interface Props {
  deck: Deck
  /** 지금 보고 있는 QuickDeck 폴더 (루트 = null). 이 폴더의 버튼만 그린다 */
  folderId: string | null
  onRun: (button: DeckButton, element: HTMLButtonElement) => void
  onAdd: (position: Position) => void
  onButtonContextMenu: (button: DeckButton, e: MouseEvent) => void
  /** 드래그로 놓았을 때 (빈 슬롯이면 이동, 버튼이면 교환). 호출자가 저장한다 */
  onMove: (buttonId: string, target: Position) => void
  /** 드래그가 시작될 때 (팝오버·메뉴를 닫는 용도) */
  onDragStart?: () => void
  /** 다이얼로그·메뉴가 열려 있으면 드래그를 시작하지 않는다 */
  dragDisabled?: boolean
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
 * 드래그 배치(P8)는 useDragReorder 가 담당하고, 여기서는 상태를 data-* 로 내려 CSS 가 그린다.
 */
export function DeckGrid({ deck, folderId, onRun, onAdd, onButtonContextMenu, onMove, onDragStart, dragDisabled = false, popover, menuButtonId, onMetrics }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const metrics = useDeckMetrics(containerRef, deck.layout)
  const { drag, onPointerDown, consumeClick } = useDragReorder({ deck, metrics, gridRef, disabled: dragDisabled, onDrop: onMove, onDragStart })

  useEffect(() => {
    onMetrics?.(metrics)
    // 치수가 실제로 바뀐 경우에만 알린다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics.cell, metrics.fontSize, metrics.compact, onMetrics])

  // 드래그로 끝난 pointerdown 의 click 은 실행/추가로 이어지지 않는다
  const handleRun = useCallback(
    (button: DeckButton, el: HTMLButtonElement) => {
      if (consumeClick()) return
      onRun(button, el)
    },
    [consumeClick, onRun],
  )
  const handleAdd = useCallback(
    (position: Position) => {
      if (consumeClick()) return
      onAdd(position)
    },
    [consumeClick, onAdd],
  )

  const style = {
    ...metricsToCssVars(metrics),
    '--cols': String(deck.layout.columns),
    '--rows': String(deck.layout.rows),
  } as CSSProperties

  const dragSource = drag ? deck.buttons.find((b) => b.id === drag.sourceId) : undefined
  // 폴더가 바뀌면(이동) 격자 치수 계산은 그대로지만 버튼 집합이 달라진다. 드래그 중 폴더가 바뀌는 일은 Esc 가 먼저 취소하므로 없다
  const dropTarget = drag && drag.plan.kind !== 'none' ? drag.plan.target : null

  return (
    <div ref={containerRef} className={styles.container}>
      {metrics.cell > 0 && (
        <div ref={gridRef} className={styles.grid} style={style} role="grid" aria-label={deck.name} data-dragging={drag ? 'true' : undefined}>
          {allPositions(deck.layout).map((pos) => {
            const button = findButtonAt(deck, pos, folderId)
            const key = `${pos.row}-${pos.col}`
            const isTarget = dropTarget !== null && samePosition(dropTarget, pos)
            return button ? (
              <DeckButtonView
                key={button.id}
                button={button}
                compact={metrics.compact}
                popoverOpen={popover?.buttonId === button.id}
                popoverId={popover?.id}
                menuOpen={menuButtonId === button.id}
                dragging={drag?.sourceId === button.id}
                dropState={isTarget && drag?.plan.kind === 'swap' ? 'swap' : null}
                onRun={handleRun}
                onContextMenu={onButtonContextMenu}
                onPointerDown={onPointerDown}
              />
            ) : (
              <EmptySlot key={key} position={pos} dropState={isTarget ? 'move' : null} onAdd={handleAdd} />
            )
          })}
        </div>
      )}
      {drag && dragSource && (
        <div
          className={`${styles.ghost} ${dragSource.display === 'icon' ? styles.iconOnly : ''}`}
          style={{ ...style, left: drag.x, top: drag.y }}
          aria-hidden
        >
          {dragSource.icon.kind !== 'none' && dragSource.display !== 'text' && <IconView button={dragSource} />}
          {!metrics.compact && (dragSource.display !== 'icon' || dragSource.icon.kind === 'none') && (
            <span className={styles.name}>{dragSource.name}</span>
          )}
        </div>
      )}
    </div>
  )
}
