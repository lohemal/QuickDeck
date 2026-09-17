import type { Position } from '@/model/deck'
import styles from './deck.module.css'

interface Props {
  position: Position
  onAdd: (position: Position) => void
}

/** 버튼이 없는 자리. 클릭하면 그 위치에 새 버튼을 추가하는 흐름으로 이어진다 */
export function EmptySlot({ position, onAdd }: Props) {
  return (
    <button
      type="button"
      className={styles.empty}
      title={`${position.row + 1}행 ${position.col + 1}열에 버튼 추가`}
      onClick={() => onAdd(position)}
    >
      +
    </button>
  )
}
