import type { MouseEvent } from 'react'
import type { DeckButton } from '@/model/deck'
import { definitionOf } from '@/features/actions/registry'
import { IconView } from './IconView'
import { KeyBadge } from './KeyBadge'
import styles from './deck.module.css'

interface Props {
  button: DeckButton
  /** 셀이 텍스트를 그릴 수조차 없을 만큼 작을 때만 true (사용자 표시 방식은 그 외에는 항상 지킨다) */
  compact: boolean
  /** 이 버튼에 팝오버(검색창)가 열려 있는지. 검색 버튼의 aria 상태에 쓴다 */
  popoverOpen?: boolean
  /** 열려 있는 팝오버 요소의 id (aria-controls) */
  popoverId?: string
  onRun: (button: DeckButton, element: HTMLButtonElement) => void
  onContextMenu: (button: DeckButton, e: MouseEvent) => void
}

export function DeckButtonView({ button, compact, popoverOpen, popoverId, onRun, onContextMenu }: Props) {
  const def = definitionOf(button.action)
  const showIcon = button.display !== 'text' || compact
  const showText = !compact && button.display !== 'icon'
  const textOnly = button.display === 'text' && !compact
  const isSearch = button.action.type === 'search'

  return (
    <button
      type="button"
      className={styles.button}
      data-button-id={button.id}
      title={`${button.name}\n${def.label}: ${def.describe(button.action)}`}
      aria-haspopup={isSearch ? 'dialog' : undefined}
      aria-expanded={isSearch ? !!popoverOpen : undefined}
      aria-controls={isSearch && popoverOpen ? popoverId : undefined}
      onClick={(e) => onRun(button, e.currentTarget)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(button, e)
      }}
    >
      {showIcon && <IconView button={button} />}
      {showText && <span className={`${styles.name} ${textOnly ? styles.nameOnly : ''}`}>{button.name}</span>}
      <KeyBadge hotkey={button.hotkey} />
    </button>
  )
}
