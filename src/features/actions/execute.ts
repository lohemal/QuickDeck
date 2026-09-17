import type { Action } from '@/model/action'
import type { Settings } from '@/model/settings'
import { executeAction } from '@/ipc/actions'
import { buildSearchUrl, findSearchEngine } from './search'

export interface ExecuteContext {
  settings: Settings
  /** 검색 동작일 때 사용자가 입력한 검색어 */
  query?: string
}

export type RunResult =
  /** Rust 실행기가 동작을 수행했다 */
  | { kind: 'done' }
  /** 아직 이 앱에서 제공하지 않는 흐름 (예: 검색 입력창). 오류가 아니라 안내다 */
  | { kind: 'unavailable'; message: string }

/**
 * 버튼 동작 실행의 단일 진입점.
 * 프론트엔드에서만 필요한 해석(검색 URL 만들기 등)을 마친 뒤 Rust 로 넘긴다.
 * 위험 기능 확인창은 호출자(App)가 이 함수를 부르기 전에 처리한다 → dangerous.ts
 * 실패는 예외로 던져지며 ipc/errors.ts 의 toUserError 로 사용자 문구를 얻는다.
 */
export async function runAction(action: Action, ctx: ExecuteContext): Promise<RunResult> {
  if (action.type === 'search') {
    const query = ctx.query?.trim() ?? ''
    // 검색어는 SearchPopover 가 받아 넘긴다. 빈 검색어는 여기까지 오지 않지만 방어적으로 막는다.
    if (!query) return { kind: 'unavailable', message: '검색어를 입력하세요.' }
    const engine = findSearchEngine(action.engine, ctx.settings)
    if (!engine) throw new Error(`알 수 없는 검색엔진: ${action.engine}`)
    // 검색 결과 URL 을 만든 뒤 웹사이트 실행 경로(Rust web::open_url)를 그대로 재사용한다
    await executeAction({ type: 'website', url: buildSearchUrl(engine, query), browser: action.browser })
    return { kind: 'done' }
  }
  await executeAction(action)
  return { kind: 'done' }
}
