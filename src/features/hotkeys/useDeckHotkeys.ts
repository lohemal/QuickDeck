import { useEffect } from 'react'
import type { Deck, DeckButton } from '@/model/deck'
import { shouldHandleDeckHotkey, type EditableLike } from './guard'
import { findButtonForEvent } from './keymap'

interface Options {
  deck: Deck | null
  /** 편집·확인 다이얼로그가 열려 있으면 실행키를 처리하지 않는다 */
  dialogOpen: boolean
  /** 지금 보고 있는 QuickDeck 폴더(루트 = null). ref 로 받아 폴더 이동 직후의 키 입력에도 즉시 새 매핑이 쓰인다 */
  folderRef: { current: string | null }
  onHotkey: (button: DeckButton) => void
  onEscape: (e: KeyboardEvent) => void
}

/**
 * 덱이 보이는 동안의 키 입력.
 * - Esc 는 항상 onEscape 로 넘긴다 (팝오버·메뉴·덱 숨김의 우선순위는 호출자가 정한다)
 * - 그 외 키는 guard 를 통과했을 때만 실행키로 해석한다: 입력 요소 포커스·IME 조합·수식키 조합·다이얼로그면 무시
 * - 꾹 누르고 있을 때의 반복(repeat)은 무시한다 (연속 실행은 손으로 여러 번)
 */
export function useDeckHotkeys({ deck, dialogOpen, folderRef, onHotkey, onEscape }: Options) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape(e)
        return
      }
      if (!deck || e.repeat) return
      const eventLike = {
        key: e.key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        isComposing: e.isComposing,
        target: e.target as unknown as EditableLike | null,
      }
      if (!shouldHandleDeckHotkey(eventLike, { dialogOpen, activeElement: document.activeElement as unknown as EditableLike | null })) return
      const button = findButtonForEvent(deck, e, folderRef.current)
      if (!button) return
      e.preventDefault()
      onHotkey(button)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deck, dialogOpen, folderRef, onHotkey, onEscape])
}
