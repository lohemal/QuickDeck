import type { DeckButton } from '@/model/deck'
import { definitionOf } from '@/features/actions/registry'
import styles from './deck.module.css'

/**
 * 버튼 아이콘 한 조각. IconRef 의 kind 별로 그리는 방식이 달라진다.
 * 지금은 내장 아이콘 세트와 이미지 저장소가 없으므로 모두 자리표시 글자를 그린다.
 * 이후 단계: builtin → 아이콘 세트 컴포넌트, image/extracted → convertFileSrc 로 <img>.
 */
export function IconView({ button }: { button: DeckButton }) {
  const glyph = definitionOf(button.action).placeholderGlyph
  return (
    <span className={styles.icon} aria-hidden>
      <span className={styles.iconPlaceholder}>{glyph}</span>
    </span>
  )
}
