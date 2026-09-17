import type { SystemCommand } from '@/model/action'
import type { DeckButton } from '@/model/deck'
import type { Settings } from '@/model/settings'

/**
 * 실행 뒤 덱을 숨길지 정하는 단일 정책 함수.
 *
 * 지금은 (1) 전역 설정 hideAfterRun, (2) 동작 종류 두 가지만 본다.
 * 향후 버튼별 "실행 후 유지/숨김" 옵션이 생기면 이 함수 안에서 button 의 필드를 먼저 보게 하면 된다.
 * UI 컴포넌트는 이 함수의 결과만 쓴다.
 */

/** 연속으로 여러 번 누르는 일이 잦아 실행 후에도 덱을 그대로 두는 시스템 기능 */
export const KEEP_OPEN_SYSTEM_COMMANDS: ReadonlySet<SystemCommand> = new Set<SystemCommand>([
  'play-pause',
  'prev-track',
  'next-track',
  'volume-up',
  'volume-down',
  'mute',
])

export function shouldHideAfterRun(button: Pick<DeckButton, 'action'>, settings: Pick<Settings, 'window'>): boolean {
  if (!settings.window.hideAfterRun) return false
  // 향후: if (button.afterRun === 'keep') return false / 'hide' → true
  const a = button.action
  if (a.type === 'system' && KEEP_OPEN_SYSTEM_COMMANDS.has(a.command)) return false
  return true
}
