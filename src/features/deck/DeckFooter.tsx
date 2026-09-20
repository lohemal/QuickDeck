import { Settings } from 'lucide-react'
import type { DeckMetrics } from './useDeckMetrics'
import type { SaveStatus } from '@/store/appStore'
import styles from './DeckFooter.module.css'

interface Props {
  /** 덱에 버튼이 하나도 없으면 짧은 안내를 보여준다 (별도 empty screen 대신 슬롯 UX 를 유지) */
  buttonCount: number
  /** 격자 밖에 보존된 버튼 수 (0 이면 표시 안 함) */
  hiddenCount: number
  metrics: DeckMetrics | null
  saveStatus: SaveStatus
  onOpenSettings: () => void
}

/**
 * 덱 아래의 얇은 막대: 설정 진입 버튼과 짧은 상태.
 * 치수·저장 상태 같은 개발 정보는 개발 빌드(import.meta.env.DEV)에서만 보인다.
 */
export function DeckFooter({ buttonCount, hiddenCount, metrics, saveStatus, onOpenSettings }: Props) {
  return (
    <div className={styles.bar}>
      {buttonCount === 0 && <span className={styles.hint}>빈 칸(+)을 눌러 첫 버튼을 추가하세요</span>}
      {hiddenCount > 0 && <span className={styles.info}>격자 밖 버튼 {hiddenCount}개</span>}
      {import.meta.env.DEV && metrics && (
        <span className={styles.info}>
          dev · {window.innerWidth}×{window.innerHeight} · 셀 {metrics.cell}px · 글자 {metrics.fontSize}px{saveStatus === 'error' ? ' · 저장 실패' : ''}
        </span>
      )}
      <span className={styles.spacer} />
      <button type="button" className={styles.settings} onClick={onOpenSettings} title="설정" aria-label="설정">
        <Settings aria-hidden focusable={false} strokeWidth={1.75} />
      </button>
    </div>
  )
}
