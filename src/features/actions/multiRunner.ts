// Node 검사 스크립트(scripts/check-multi.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import type { MultiAction, MultiStep, MultiStepAction } from '../../model/action.ts'
import { isAllowedStepAction, validateMultiAction } from './multi.ts'

/**
 * 다중 실행 러너. 한 단계씩 `await` 로 진행한다 (setTimeout 을 미리 여러 개 예약하지 않는다).
 *
 *   step 1 실행 → delayAfter → step 2 실행 → delayAfter → … → 마지막 step 실행 (마지막 delay 는 기다리지 않는다)
 *
 * - "실행 완료" 는 Windows 에 실행 요청이 전달된 시점이다 (프로그램 로딩·페이지 로딩을 기다리지 않는다)
 * - 실패: stop 이면 즉시 끝, continue 면 실패를 기록하고 그 step 의 delay 는 생략한 채 다음 step
 * - 취소(AbortSignal): 아직 실행하지 않은 step 을 실행하지 않는다. delay 중에도 즉시 깨어난다. 이미 실행된 것은 되돌리지 않는다
 * - 검증을 통과하지 못한 Action(허용되지 않는 step, 중첩 multi, 위험 기능 …)은 아무 step 도 실행하지 않는다
 *
 * 실행·대기·시각은 주입받으므로 테스트에서 실제 프로그램을 열지 않고 검사할 수 있다.
 */

export interface StepFailure {
  /** 0 부터 */
  index: number
  step: MultiStep
  message: string
}

export type MultiRunStatus = 'completed' | 'completed-with-errors' | 'stopped' | 'cancelled' | 'invalid'

export interface MultiRunResult {
  status: MultiRunStatus
  /** 실행을 시도한 step 수 */
  attempted: number
  /** 성공한 step 수 */
  succeeded: number
  failures: StepFailure[]
  /** status === 'invalid' 일 때 이유 */
  invalidReason?: string
}

export interface MultiRunDeps {
  /** step 하나를 실행한다 (기존 runAction 경로). 실패는 예외로 */
  execute: (action: MultiStepAction) => Promise<void>
  /** 취소 가능한 대기 */
  delay?: (ms: number, signal: AbortSignal) => Promise<void>
  /** 진행 보고 (UI 표시용). index 는 지금 실행하려는 step 의 0 기반 번호 */
  onProgress?: (index: number, total: number) => void
  /** 오류 문구 변환 (기존 toUserError 등) */
  describeError?: (e: unknown) => string
}

export class MultiCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'MultiCancelled'
  }
}

/** signal 이 켜지면 즉시 거부되는 대기 */
export function cancellableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new MultiCancelled())
    if (ms <= 0) return resolve()
    const t = setTimeout(done, ms)
    function done() {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    function onAbort() {
      clearTimeout(t)
      signal.removeEventListener('abort', onAbort)
      reject(new MultiCancelled())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runMulti(action: MultiAction, signal: AbortSignal, deps: MultiRunDeps): Promise<MultiRunResult> {
  const delay = deps.delay ?? cancellableDelay
  const describe = deps.describeError ?? ((e: unknown) => (e instanceof Error ? e.message : String(e)))
  const validation = validateMultiAction(action)
  if (!validation.ok) {
    const first = validation.general[0] ?? Object.values(validation.steps)[0] ?? '다중 실행 데이터가 올바르지 않습니다'
    return { status: 'invalid', attempted: 0, succeeded: 0, failures: [], invalidReason: first }
  }

  const failures: StepFailure[] = []
  let attempted = 0
  let succeeded = 0
  const total = action.steps.length

  for (let i = 0; i < total; i++) {
    if (signal.aborted) return { status: 'cancelled', attempted, succeeded, failures }
    const step = action.steps[i]!
    deps.onProgress?.(i, total)
    // 검증을 통과했어도 실행 직전에 한 번 더: 허용되지 않는 종류는 절대 실행하지 않는다 (재귀·위험 기능 방어)
    if (!isAllowedStepAction(step.action)) {
      failures.push({ index: i, step, message: '허용되지 않는 동작이라 실행하지 않았습니다' })
      if (action.failurePolicy === 'stop') return { status: 'stopped', attempted, succeeded, failures }
      continue
    }
    attempted++
    let ok = true
    try {
      await deps.execute(step.action)
      succeeded++
    } catch (e) {
      ok = false
      failures.push({ index: i, step, message: describe(e) })
      if (action.failurePolicy === 'stop') return { status: 'stopped', attempted, succeeded, failures }
    }
    // 실패한 step 의 대기는 생략, 마지막 step 뒤에도 기다리지 않는다
    if (ok && i < total - 1 && step.delayAfterMs > 0) {
      try {
        await delay(step.delayAfterMs, signal)
      } catch (e) {
        if (e instanceof MultiCancelled || signal.aborted) return { status: 'cancelled', attempted, succeeded, failures }
        throw e
      }
    }
  }
  if (signal.aborted) return { status: 'cancelled', attempted, succeeded, failures }
  return { status: failures.length === 0 ? 'completed' : 'completed-with-errors', attempted, succeeded, failures }
}
