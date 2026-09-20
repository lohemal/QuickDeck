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
  const iconNone = button.icon.kind === 'none'
  // 아이콘 '없음' + 아이콘만 표시면 버튼이 텅 비므로 이름을 대신 보여준다
  const showIcon = !iconNone && (button.display !== 'text' || compact)
  const showText = !compact && (button.display !== 'icon' || iconNone)
  const textOnly = !showIcon

  return (
    <button
      type="button"
      className={`${styles.button} ${button.display === 'icon' && showIcon ? styles.iconOnly : ''}`}
      data-button-id={button.id}
      title={`${button.name}\n${def.label}: ${def.describe(button.action)}`}
      aria-label={button.name}
      aria-haspopup={button.action.type === 'search' ? 'dialog' : undefined}
      aria-expanded={button.action.type === 'search' ? !!popoverOpen : undefined}
      aria-controls={button.action.type === 'search' && popoverOpen ? popoverId : undefined}
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
