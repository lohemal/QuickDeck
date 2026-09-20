import type { Action, ActionType, SystemCommand } from '@/model/action'

/**
 * 동작 종류별 표시 정보. 새 동작 종류를 추가하면 여기에 한 항목을 더한다.
 * 아이콘은 features/icons/auto.ts 가 동작 종류·내용으로 정한다 (여기서는 다루지 않는다).
 */
export interface ActionDefinition<T extends Action = Action> {
  type: T['type']
  label: string
  /** 버튼 아래 부제·툴팁 등에 쓸 짧은 설명 */
  describe: (action: T) => string
}

export const SYSTEM_COMMAND_LABELS: Record<SystemCommand, string> = {
  'play-pause': '재생/일시정지',
  'prev-track': '이전 곡',
  'next-track': '다음 곡',
  'volume-up': '볼륨 높이기',
  'volume-down': '볼륨 낮추기',
  mute: '음소거',
  'lock-screen': '화면 잠금',
  sleep: '절전',
  'log-off': '로그아웃',
  restart: '다시 시작',
  shutdown: '컴퓨터 종료',
  'file-explorer': '파일 탐색기',
  'windows-settings': 'Windows 설정',
  'task-manager': '작업 관리자',
  'screen-capture': '캡처 도구',
}

type Definitions = { [K in ActionType]: ActionDefinition<Extract<Action, { type: K }>> }

export const ACTION_DEFINITIONS: Definitions = {
  website: {
    type: 'website',
    label: '웹사이트',
    describe: (a) => a.url,
  },
  program: {
    type: 'program',
    label: '프로그램',
    describe: (a) => a.path,
  },
  file: {
    type: 'file',
    label: '파일',
    describe: (a) => a.path,
  },
  folder: {
    type: 'folder',
    label: '폴더',
    describe: (a) => a.path,
  },
  system: {
    type: 'system',
    label: '시스템',
    describe: (a) => SYSTEM_COMMAND_LABELS[a.command],
  },
  search: {
    type: 'search',
    label: '검색',
    describe: (a) => `${a.engine} 검색`,
  },
}

export function definitionOf<A extends Action>(action: A): ActionDefinition<A> {
  return ACTION_DEFINITIONS[action.type] as unknown as ActionDefinition<A>
}
