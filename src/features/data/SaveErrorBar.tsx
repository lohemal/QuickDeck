import { retrySaveNow, useAppStore } from '@/store/appStore'
import styles from './SaveErrorBar.module.css'

/**
 * 저장이 실패했을 때만 보이는 안내 막대 (덱·설정 공통, 팝업 없음).
 * - retrying: 정해진 간격으로 다시 시도하는 중
 * - failed  : 재시도를 모두 실패해 멈춤 → [다시 시도]
 * 저장에 성공하면(saveStatus 가 saved 등으로 바뀌면) 저절로 사라진다. 변경 내용은 메모리에 남아 있다
 */
export function SaveErrorBar() {
  const status = useAppStore((s) => s.saveStatus)
  if (status !== 'retrying' && status !== 'failed') return null
  return (
    <div className={styles.bar} role="alert">
      <span className={styles.text}>
        {status === 'retrying' ? '변경사항을 저장하지 못했습니다. 다시 시도하는 중입니다.' : '변경사항을 저장하지 못했습니다. 변경 내용은 QuickDeck 이 기억하고 있습니다.'}
      </span>
      {status === 'failed' && (
        <button type="button" className={styles.retry} onClick={() => void retrySaveNow().catch(() => {})}>
          다시 시도
        </button>
      )}
    </div>
  )
}
