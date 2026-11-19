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
      return `QuickDeck v${phase.version} 업데이트를 설치하는 중입니다… 잠시 종료된 뒤 다시 열립니다.`
    case 'error':
      return phase.message
  }
}

export const CHECK_FAILED_MESSAGE = '업데이트를 확인할 수 없습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
export const INSTALL_FAILED_MESSAGE = '업데이트를 설치하지 못했습니다. 잠시 후 다시 시도하거나 GitHub Releases 에서 설치 파일을 받아 주세요.'
export const FLUSH_FAILED_MESSAGE = '변경 사항을 저장하지 못해 업데이트를 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.'

/** 자동 확인은 앱이 준비된 뒤 이만큼 기다렸다가 한 번만 한다 (시작을 막지 않게) */
export const AUTO_CHECK_DELAY_MS = 5000

/** 사용자가 [업데이트] 를 누른 뒤 끝나거나 실패할 때까지: 덱·설정 변경과 다른 업데이트 동작을 막는다 */
export function isUpdating(phase: UpdatePhase): boolean {
  return phase.kind === 'downloading' || phase.kind === 'installing'
}

export type InstallStage = 'flush' | 'download' | 'install'

export interface InstallFlowDeps {
  setPhase: (phase: UpdatePhase) => void
  /** 새 변경을 받지 않게 한다 (화면·저장 모두). 이미 기다리는 저장은 flush 로 기록된다 */
  freeze: () => void
  /** 실패해서 앱을 계속 쓸 때 되돌린다 */
  thaw: () => void
  flush: () => Promise<void>
  /** 내려받기 + 서명 검증 (플러그인). 진행률(0~100, 모르면 null) */
  download: (onPercent: (percent: number | null) => void) => Promise<void>
  /** 설치 시작. Windows 에서는 성공하면 돌아오지 않는다(앱 종료) */
  install: () => Promise<void>
  logFailure: (stage: InstallStage, error: unknown) => void
}

/**
 * [업데이트] 를 누른 뒤의 순서:
 *   설치 중 상태(입력 차단) → freeze → 기다리던 저장 flush → 내려받기·서명 검증 → 설치
 * freeze 이후의 변경은 화면에도 파일에도 반영되지 않으므로 "flush 뒤 종료 전 변경 유실" 이 생기지 않는다.
 * 앱이 계속 실행되는 실패(저장·내려받기·서명·설치 시작)는 모두 thaw 하고 정상 사용 상태로 돌아간다.
 */
export async function runInstallFlow(version: string, deps: InstallFlowDeps): Promise<'installing' | 'failed'> {
  deps.setPhase({ kind: 'downloading', version, percent: null })
  deps.freeze()
  const fail = (stage: InstallStage, e: unknown, message: string) => {
    deps.logFailure(stage, e)
    deps.thaw()
    deps.setPhase({ kind: 'error', message, duringInstall: true })
    return 'failed' as const
  }
  try {
    await deps.flush()
  } catch (e) {
    return fail('flush', e, FLUSH_FAILED_MESSAGE)
  }
  try {
    await deps.download((percent) => deps.setPhase({ kind: 'downloading', version, percent }))
  } catch (e) {
    return fail('download', e, INSTALL_FAILED_MESSAGE)
  }
  deps.setPhase({ kind: 'installing', version })
  try {
    await deps.install()
  } catch (e) {
    return fail('install', e, INSTALL_FAILED_MESSAGE)
  }
  return 'installing'
}
