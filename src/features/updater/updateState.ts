/**
 * 업데이트 진행 상태와 사용자 문구 (순수 로직 — scripts/check-updater.ts 가 검사한다).
 * 강제 업데이트는 없다: available 이후의 단계는 사용자가 [업데이트] 를 눌렀을 때만 진행된다.
 */
export type UpdatePhase =
  | { kind: 'idle' }
  | { kind: 'checking'; manual: boolean }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number | null }
  | { kind: 'installing'; version: string }
  /** duringInstall: 사용자가 [업데이트] 를 누른 뒤의 실패 → 덱 배너에도 보인다 (확인 실패는 설정 화면에서만) */
  | { kind: 'error'; message: string; duringInstall: boolean }

/** 다운로드 진행률(0~100). 전체 크기를 모르면 null */
export function downloadPercent(received: number, total: number | undefined): number | null {
  if (!total || total <= 0) return null
  return Math.max(0, Math.min(100, Math.floor((received / total) * 100)))
}

/** 설정 화면 정보 영역에 보여줄 한 줄 */
export function describePhase(phase: UpdatePhase): string | null {
  switch (phase.kind) {
    case 'idle':
      return null
    case 'checking':
      return '업데이트를 확인하는 중…'
    case 'latest':
      return '최신 버전입니다.'
    case 'available':
      return `QuickDeck v${phase.version} 업데이트가 있습니다.`
    case 'downloading':
      return `v${phase.version} 내려받는 중…${phase.percent == null ? '' : ` ${phase.percent}%`}`
    case 'installing':
      return `v${phase.version} 설치를 시작합니다. QuickDeck 이 잠시 종료된 뒤 다시 열립니다.`
    case 'error':
      return phase.message
  }
}

export const CHECK_FAILED_MESSAGE = '업데이트를 확인할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
export const INSTALL_FAILED_MESSAGE = '업데이트를 설치하지 못했습니다. 잠시 후 다시 시도하거나 GitHub Releases 에서 설치 파일을 받아 주세요.'
export const FLUSH_FAILED_MESSAGE = '변경 사항을 저장하지 못해 업데이트를 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.'

/** 자동 확인은 앱이 준비된 뒤 이만큼 기다렸다가 한 번만 한다 (시작을 막지 않게) */
export const AUTO_CHECK_DELAY_MS = 5000
