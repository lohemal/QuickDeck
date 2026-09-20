import type { Position } from '@/model/deck'
import styles from './deck.module.css'

interface Props {
  position: Position
  /** 드래그 중 이 슬롯이 놓일 자리면 'move' (시각 강조만) */
  dropState?: 'move' | null
  onAdd: (position: Position) => void
}

/** 버튼이 없는 자리. 클릭하면 그 위치에 새 버튼을 추가하는 흐름으로 이어진다. 드래그 중에는 drop 대상이 된다 */
export function EmptySlot({ position, dropState, onAdd }: Props) {
  return (
    <button
      type="button"
      className={styles.empty}
      data-slot={`${position.row}-${position.col}`}
      data-drop={dropState ?? undefined}
      title={`${position.row + 1}행 ${position.col + 1}열에 버튼 추가`}
      onClick={() => onAdd(position)}
    >
      +
    </button>
  )
}
