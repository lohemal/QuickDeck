/**
 * 자동 저장 큐 (변경 후 잠시 뒤 한 번만 기록). appStore 가 쓰고, scripts/check-updater.ts 가 직접 검사한다.
 *
 * - schedule : 최신 데이터를 기다리게 두고 delayMs 뒤 기록한다 (그 사이 새 변경이 오면 다시 기다린다)
 * - flush    : 기다리는 저장과 진행 중인 저장을 지금 끝낸다. 실패하면 reject (실패한 데이터는 남는다)
 * - block    : 보호·읽기 실패 상태. 이후 어떤 저장도 시도하지 않는다 (되돌리지 않음)
 * - freeze   : 업데이트 설치 동안. 이미 기다리는 저장은 flush 로 기록할 수 있지만 새 변경은 받지 않는다
 * - thaw     : 업데이트가 실패해 앱을 계속 쓸 때 freeze 를 푼다
 * - retryNow : 사용자가 [다시 시도] 를 눌렀을 때 바로 한 번 기록한다
 *
 * 기록에 실패하면:
 *  - 실패한 데이터를 버리지 않는다. 그 사이 더 새 변경이 오면 새 변경을 기록한다 (최신 상태 유지)
 *  - retryDelaysMs 간격으로 몇 번만 다시 시도한다 (무한 재시도·유휴 중 잦은 디스크 접근 없음).
 *    새 변경이 오면 처음 간격부터 다시 센다. 모두 실패하면 'failed' 로 멈추고 사용자의 [다시 시도]·다음 변경을 기다린다
 *  - 성공하면 'saved' 로 실패 상태가 풀린다
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying' | 'failed'

export interface SaveQueue<T> {
  schedule: (data: T) => void
  flush: () => Promise<void>
  block: () => void
  freeze: () => void
  thaw: () => void
  retryNow: () => Promise<void>
  isFrozen: () => boolean
  /** 받아들이지 않는 상태인지 (block 또는 freeze) */
  isClosed: () => boolean
  /** 아직 파일에 기록되지 않은 변경이 있는지 (기다리는 중·기록 중·실패 후 남음) */
  hasUnsaved: () => boolean
}

export function createSaveQueue<T>(opts: {
  write: (data: T) => Promise<void>
  onStatus: (status: SaveStatus, error?: unknown) => void
  delayMs: number
  retryDelaysMs: readonly number[]
}): SaveQueue<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | null = null
  let inflight: Promise<void> | null = null
  let blocked = false
  let frozen = false
  /** 연속 실패 횟수 = 재시도 간격 위치 (성공하거나 새 변경이 오면 0) */
  let failures = 0
  /** 마지막 기록이 실패했고 아직 성공하지 못함. 이 동안 안내가 깜빡이지 않게 pending·saving 을 retrying 으로 알린다 */
  let failing = false

  function emit(status: SaveStatus, error?: unknown) {
    opts.onStatus(failing && (status === 'pending' || status === 'saving') ? 'retrying' : status, error)
  }

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function arm(ms: number) {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void writePending().catch(() => {
        /* 상태는 writePending 이 남긴다 */
      })
    }, ms)
  }

  /** 실패 뒤 다음 재시도를 잡는다. 업데이트 중(freeze)이면 잡지 않는다 — flush 실패 뒤 thaw 가 다시 잡는다 */
  function armRetry(error: unknown) {
    const delay = opts.retryDelaysMs[failures - 1]
    if (delay === undefined || blocked) {
      emit('failed', error)
      return
    }
    emit('retrying', error)
    if (!frozen) arm(delay)
  }

  async function writePending(): Promise<void> {
    clearTimer()
    // 기록은 한 번에 하나씩. 앞선 기록이 끝난 뒤 그때의 최신 데이터를 기록한다
    // (겹치면 느린 옛 기록이 실패해 되살아나 새 기록을 덮을 수 있다)
    while (inflight) await inflight.catch(() => {})
    clearTimer()
    const data = pending
    pending = null
    if (data == null || blocked) return
    emit('saving')
    const job = opts.write(data)
    inflight = job
    try {
      await job
      failures = 0
      failing = false
      emit(pending == null ? 'saved' : 'pending')
    } catch (e) {
      failing = true
      if (pending == null) {
        pending = data
        failures++
        armRetry(e)
      } else {
        // 그 사이 더 새 변경이 와서 이미 기록이 예약됨 → 옛 실패는 재시도 횟수에 넣지 않는다
        emit('retrying', e)
      }
      throw e
    } finally {
      if (inflight === job) inflight = null
    }
  }

  return {
    schedule(data) {
      if (blocked || frozen) return
      pending = data
      failures = 0
      emit('pending')
      arm(opts.delayMs)
    },
    async flush() {
      if (inflight) await inflight.catch(() => {})
      clearTimer()
      if (pending != null) await writePending()
    },
    block() {
      blocked = true
      clearTimer()
    },
    freeze() {
      frozen = true
    },
    thaw() {
      frozen = false
      // 업데이트 전 저장(flush)이 실패해 남은 변경은 처음 간격부터 다시 시도한다
      if (pending != null && !blocked && !timer && !inflight) {
        failures = Math.min(failures, 1)
        arm(failures > 0 ? opts.retryDelaysMs[0]! : opts.delayMs)
      }
    },
    async retryNow() {
      if (blocked || frozen) return
      failures = 0
      if (inflight) await inflight.catch(() => {})
      if (pending != null) await writePending()
    },
    isFrozen: () => frozen,
    isClosed: () => blocked || frozen,
    hasUnsaved: () => pending != null || inflight != null,
  }
}
