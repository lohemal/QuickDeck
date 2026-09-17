import styles from './deck.module.css'

/** 버튼 구석의 작은 키캡. 실행키가 있을 때만 그린다 */
export function KeyBadge({ hotkey }: { hotkey: string | null }) {
  if (!hotkey) return null
  return (
    <span className={styles.badge} aria-label={`실행키 ${hotkey}`}>
      {hotkey}
    </span>
  )
}
