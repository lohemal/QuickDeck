import { DANGEROUS_SYSTEM_COMMANDS, type Action, type SystemCommand } from '@/model/action'
import { SYSTEM_COMMAND_LABELS } from './registry'

export interface DangerPrompt {
  title: string
  message: string
  /** 확인 버튼 이름 (동작에 맞춤: 로그아웃 / 다시 시작 / 종료) */
  confirmLabel: string
}

const MESSAGES: Partial<Record<SystemCommand, string>> = {
  'log-off': '로그아웃하시겠습니까?',
  restart: '컴퓨터를 다시 시작하시겠습니까?',
  shutdown: '컴퓨터를 종료하시겠습니까?',
}

const CONFIRM_LABELS: Partial<Record<SystemCommand, string>> = {
  'log-off': '로그아웃',
  restart: '다시 시작',
  shutdown: '종료',
}

/** 실행 전 확인이 필요한 동작이면 확인창 문구를, 아니면 null 을 돌려준다 */
export function dangerPromptFor(action: Action): DangerPrompt | null {
  if (action.type !== 'system' || !DANGEROUS_SYSTEM_COMMANDS.has(action.command)) return null
  const label = SYSTEM_COMMAND_LABELS[action.command]
  return {
    title: label,
    message: `${MESSAGES[action.command] ?? `${label}을(를) 실행하시겠습니까?`}\n저장하지 않은 작업이 손실될 수 있습니다.`,
    confirmLabel: CONFIRM_LABELS[action.command] ?? label,
  }
}
