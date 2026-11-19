import { create } from 'zustand'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { flushPendingSave, freezeSaves, thawSaves } from '@/store/appStore'
import { toUserError } from '@/ipc/errors'
import { CHECK_FAILED_MESSAGE, downloadPercent, isUpdating, runInstallFlow, type InstallStage, type UpdatePhase } from './updateState'

/**
 * GitHub Releases 자동 업데이트 (tauri-plugin-updater 2.12).
 * - 확인: tauri.conf.json plugins.updater.endpoints 의 latest.json 하나만 요청한다 (사용자 데이터는 보내지 않는다)
 * - 서명: 플러그인이 내장 공개키로 검증한다 (끌 수 없음)
 * - 설치: 사용자가 [업데이트] 를 눌렀을 때만. 입력 차단·freeze → 저장 flush → 내려받기 → 설치
 *   (Windows: 앱 종료 후 NSIS 가 다시 실행). 순서는 updateState.ts runInstallFlow
 */
interface UpdateStore {
  phase: UpdatePhase
  /** 배너 [나중에]: 이번 실행 동안 배너만 숨긴다 (설정 화면에는 계속 보인다) */
  bannerDismissed: boolean
  /** 앱 시작 후 자동 확인. 실패해도 아무것도 띄우지 않는다 */
  autoCheck: () => Promise<void>
  /** 설정 화면 [업데이트 확인] */
  manualCheck: () => Promise<void>
  install: () => Promise<void>
  dismissBanner: () => void
  /** 설치 실패 뒤: 다시 시도 / 닫기(새 버전 있음 상태로 돌아가고 배너는 숨김) */
  retryInstall: () => Promise<void>
  closeInstallError: () => void
}

/** 내려받기·설치에 쓸 확인 결과. 상태(zustand)에는 직렬화 가능한 값만 둔다 */
let found: Update | null = null

export const useUpdateStore = create<UpdateStore>((set, get) => ({
  phase: { kind: 'idle' },
  bannerDismissed: false,

  async autoCheck() {
    if (get().phase.kind !== 'idle') return
    await runCheck(false)
  },

  async manualCheck() {
    const phase = get().phase
    if (phase.kind === 'checking' || isUpdating(phase)) return
    await runCheck(true)
  },

  async install() {
    const phase = get().phase
    // 상태 확인과 전환(runInstallFlow 첫 줄)이 같은 틱이라 연속 클릭해도 한 번만 진행된다
    if (phase.kind !== 'available' || !found) return
    const update = found
    await runInstallFlow(phase.version, {
      setPhase: (p) => set({ phase: p }),
      freeze: freezeSaves,
      thaw: thawSaves,
      flush: flushPendingSave,
      download: async (onPercent) => {
        let total: number | undefined
        let received = 0
        await update.download((e) => {
          if (e.event === 'Started') total = e.data.contentLength
          else if (e.event === 'Progress') {
            received += e.data.chunkLength
            onPercent(downloadPercent(received, total))
          }
        })
      },
      install: () => update.install(),
      logFailure,
    })
  },

  dismissBanner() {
    set({ bannerDismissed: true })
  },

  async retryInstall() {
    if (!found || get().phase.kind !== 'error') return
    set({ phase: { kind: 'available', version: found.version } })
    await get().install()
  },

  closeInstallError() {
    if (get().phase.kind !== 'error') return
    set(found ? { phase: { kind: 'available', version: found.version }, bannerDismissed: true } : { phase: { kind: 'idle' } })
  },
}))

/** 업데이트 실패 원인을 콘솔과 앱 로그 파일(%LOCALAPPDATA%\kr.lohemal.quickdeck\logs) 양쪽에 남긴다 */
function logFailure(stage: InstallStage, e: unknown) {
  const err = toUserError(e)
  const detail = err.detail ?? err.message
  console.warn(`[QuickDeck] 업데이트 실패(${stage}):`, detail)
  if (isTauri()) void invoke('log_update_failure', { stage, detail }).catch(() => {})
}

async function runCheck(manual: boolean) {
  const set = useUpdateStore.setState
  if (!isTauri()) {
    if (manual) set({ phase: { kind: 'error', message: '브라우저 미리보기에서는 업데이트를 확인할 수 없습니다.', duringInstall: false } })
    return
  }
  set({ phase: { kind: 'checking', manual } })
  try {
    const update = await check()
    if (found && found !== update) void found.close().catch(() => {})
    found = update
    set(update ? { phase: { kind: 'available', version: update.version }, bannerDismissed: false } : { phase: { kind: 'latest' } })
  } catch (e) {
    // 릴리스가 없거나(404) 오프라인·GitHub 장애. 자동 확인이면 조용히 처음 상태로 돌아간다 (반복 팝업 없음)
    console.warn('[QuickDeck] 업데이트 확인 실패:', toUserError(e).detail ?? toUserError(e).message)
    set({ phase: manual ? { kind: 'error', message: CHECK_FAILED_MESSAGE, duringInstall: false } : { kind: 'idle' } })
  }
}
