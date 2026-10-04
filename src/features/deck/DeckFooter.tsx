import { Settings } from 'lucide-react'
import type { DeckMetrics } from './useDeckMetrics'
import type { SaveStatus } from '@/store/appStore'
import styles from './DeckFooter.module.css'

interface Props {
  /** 보고 있는 폴더(루트 포함)에 버튼이 하나도 없으면 짧은 안내를 보여준다 (별도 empty screen 대신 슬롯 UX 를 유지) */
  buttonCount: number
  /** 루트가 아닌 QuickDeck 폴더를 보고 있으면 true (빈 폴더 안내 문구가 달라진다) */
  inFolder?: boolean
  /** 격자 밖에 보존된 버튼 수 (0 이면 표시 안 함) */
  hiddenCount: number
  metrics: DeckMetrics | null
  saveStatus: SaveStatus
  /** 진행 중인 다중 실행 (없으면 null). 이름 · 진행 · 취소 버튼을 아주 작게 보여준다 */
  multiRun?: { name: string; step: number; total: number } | null
  onCancelMulti?: () => void
  onOpenSettings: () => void
}

/**
 * 덱 아래의 얇은 막대: 설정 진입 버튼과 짧은 상태.
 * 치수·저장 상태 같은 개발 정보는 개발 빌드(import.meta.env.DEV)에서만 보인다.
 */
export function DeckFooter({ buttonCount, inFolder = false, hiddenCount, metrics, saveStatus, multiRun, onCancelMulti, onOpenSettings }: Props) {
  return (
    <div className={styles.bar}>
      {multiRun && (
        <span className={styles.running} role="status">
          <span className={styles.runningDot} aria-hidden />
          <span className={styles.runningText}>
            {multiRun.name} 실행 중 ({multiRun.step}/{multiRun.total})
          </span>
          <button type="button" className={styles.cancel} onClick={onCancelMulti}>
            취소
          </button>
        </span>
      )}
      {buttonCount === 0 && <span className={styles.hint}>{inFolder ? '이 폴더는 비어 있습니다 · 빈 칸(+)을 눌러 버튼을 추가하세요' : '빈 칸(+)을 눌러 첫 버튼을 추가하세요'}</span>}
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
