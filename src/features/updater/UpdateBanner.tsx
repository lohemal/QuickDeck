import { useUpdateStore } from './updateStore'
import { describePhase } from './updateState'
import styles from './UpdateBanner.module.css'

/**
 * 덱 화면 위쪽의 비차단 업데이트 알림. 새 버전이 있을 때와 사용자가 고른 업데이트가 진행 중일 때만 보인다.
 * 확인 실패·최신 상태는 여기 띄우지 않는다 (설정 → 정보 에서만).
 */
export function UpdateBanner() {
  const phase = useUpdateStore((s) => s.phase)
  const dismissed = useUpdateStore((s) => s.bannerDismissed)
  const install = useUpdateStore((s) => s.install)
  const dismiss = useUpdateStore((s) => s.dismissBanner)
  const retry = useUpdateStore((s) => s.retryInstall)
  const closeError = useUpdateStore((s) => s.closeInstallError)

  if (phase.kind === 'error' && phase.duringInstall) {
    return (
      <div className={styles.bar} role="alert">
        <span className={`${styles.text} ${styles.error}`} title={phase.message}>
          {phase.message}
        </span>
        <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => void retry()}>
          다시 시도
        </button>
        <button type="button" className={`${styles.action} ${styles.ghost}`} onClick={closeError}>
          닫기
        </button>
      </div>
    )
  }

  if (phase.kind === 'available') {
    if (dismissed) return null
    return (
      <div className={styles.bar} role="status">
        <span className={styles.text}>{describePhase(phase)}</span>
        <button type="button" className={`${styles.action} ${styles.primary}`} onClick={() => void install()}>
          업데이트
        </button>
        <button type="button" className={`${styles.action} ${styles.ghost}`} onClick={dismiss}>
          나중에
        </button>
      </div>
    )
  }
  if (phase.kind === 'downloading' || phase.kind === 'installing') {
    // 이 동안 앱 화면은 입력이 막혀 있다(App: inert). 버튼 없이 상태만
    return (
      <div className={styles.bar} role="status" aria-busy="true">
        <span className={styles.spinner} aria-hidden />
        <span className={styles.text}>{describePhase(phase)}</span>
      </div>
    )
  }
  return null
}
