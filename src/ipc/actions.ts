import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Action } from '@/model/action'

/**
 * Rust 가 실제로 실행하는 동작. 프론트엔드 Action 중 'search' 는
 * features/actions/execute.ts 에서 URL 을 만들어 'website' 로 바꿔 보낸다.
 */
export type ExecutableAction = Exclude<Action, { type: 'search' }>

export async function executeAction(action: ExecutableAction): Promise<void> {
  if (!isTauri()) throw new Error('브라우저 미리보기에서는 동작을 실행할 수 없습니다')
  await invoke('execute_action', { action })
}
