import { useEffect, useReducer } from 'react'
import { extractIcon } from '@/ipc/icons'

/**
 * 셸 아이콘 추출 결과의 메모리 캐시. 경로마다 한 번만 Rust 를 부르고(디스크 캐시는 Rust 가 관리),
 * 렌더링마다 추출하지 않는다. 실패는 기억해 두어 반복 시도하지 않는다 (앱을 다시 켜면 다시 시도).
 */
type Entry = { status: 'pending' } | { status: 'ok'; file: string } | { status: 'failed' }

const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

/** 추출을 요청한다(이미 요청했으면 아무것도 안 함) */
export function requestExtract(path: string): void {
  if (!path || cache.has(path)) return
  cache.set(path, { status: 'pending' })
  extractIcon(path)
    .then((r) => cache.set(path, { status: 'ok', file: r.file }))
    .catch(() => cache.set(path, { status: 'failed' }))
    .finally(notify)
}

/** 캐시 무효화 (다시 등록할 때 등) */
export function forgetExtract(path: string): void {
  cache.delete(path)
  notify()
}

export function getExtracted(path: string | null): string | null {
  if (!path) return null
  const e = cache.get(path)
  return e && e.status === 'ok' ? e.file : null
}

/** 경로의 추출된 관리 id. 아직이면 null 이고 완료되면 다시 렌더된다 */
export function useExtractedIcon(path: string | null): string | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!path) return
    listeners.add(rerender)
    requestExtract(path)
    return () => {
      listeners.delete(rerender)
    }
  }, [path])
  return getExtracted(path)
}
