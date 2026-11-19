/**
 * 자동 저장 큐 (변경 후 잠시 뒤 한 번만 기록). appStore 가 쓰고, scripts/check-updater.ts 가 직접 검사한다.
 *
 * - schedule: 최신 데이터를 기다리게 두고 delayMs 뒤 기록한다 (그 사이 새 변경이 오면 다시 기다린다)
 * - flush   : 기다리는 저장과 진행 중인 저장을 지금 끝낸다. 실패하면 reject
 * - block   : 보호·읽기 실패 상태. 이후 어떤 저장도 받지 않는다 (되돌리지 않음)
 * - freeze  : 업데이트 설치 동안. 이미 기다리는 저장은 flush 로 기록할 수 있지만 새 변경은 받지 않는다
 * - thaw    : 업데이트가 실패해 앱을 계속 쓸 때 freeze 를 푼다
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface SaveQueue<T> {
  schedule: (data: T) => void
  flush: () => Promise<void>
  block: () => void
  freeze: () => void
  thaw: () => void
  isFrozen: () => boolean
  /** 받아들이지 않는 상태인지 (block 또는 freeze) */
  isClosed: () => boolean
}

export function createSaveQueue<T>(opts: {
  write: (data: T) => Promise<void>
  onStatus: (status: SaveStatus, error?: unknown) => void
  delayMs: number
}): SaveQueue<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | null = null
  let inflight: Promise<void> | null = null
  let blocked = false
  let frozen = false

  async function writePending(): Promise<void> {
    timer = null
    const data = pending
    pending = null
    if (data == null) return
    opts.onStatus('saving')
    const job = opts.write(data)
    inflight = job
    try {
      await job
      opts.onStatus('saved')
    } catch (e) {
      opts.onStatus('error', e)
      throw e
    } finally {
      if (inflight === job) inflight = null
    }
  }

  return {
    schedule(data) {
      if (blocked || frozen) return
      pending = data
      opts.onStatus('pending')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void writePending().catch(() => {
          /* 상태(error)는 writePending 이 남긴다 */
        })
      }, opts.delayMs)
    },
    async flush() {
      if (inflight) await inflight
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (pending != null) await writePending()
    },
    block() {
      blocked = true
    },
    freeze() {
      frozen = true
    },
    thaw() {
      frozen = false
    },
    isFrozen: () => frozen,
    isClosed: () => blocked || frozen,
  }
}
