/**
 * 버튼 동작(Action) 모델.
 *
 * 새 동작 종류를 추가하려면:
 *  1. 여기 Action 유니온에 타입을 추가한다.
 *  2. features/actions/registry.ts 의 ACTION_DEFINITIONS 에 표시 정보를 추가한다.
 *  3. Rust 쪽(src-tauri/src/model.rs)에 실행이 필요하면 같은 모양의 variant 를 추가한다.
 */

/** 웹사이트/검색을 열 브라우저 */
export type BrowserChoice = 'default' | 'edge' | 'chrome'

/** 향후 버튼으로 제공할 Windows 시스템 기능 (Rust 의 SystemCommand 와 1:1) */
export type SystemCommand =
  | 'play-pause'
  | 'prev-track'
  | 'next-track'
  | 'volume-up'
  | 'volume-down'
  | 'mute'
  | 'lock-screen'
  | 'sleep'
  | 'log-off'
  | 'restart'
  | 'shutdown'
  | 'file-explorer'
  | 'windows-settings'
  | 'task-manager'
  | 'screen-capture'

/**
 * 실행 전 확인창이 필요한 시스템 기능 — 저장하지 않은 작업이 손실될 수 있는 것들.
 * 확인창 문구는 features/actions/dangerous.ts 에 있다. 이 집합이 단일 기준이다.
 */
export const DANGEROUS_SYSTEM_COMMANDS: ReadonlySet<SystemCommand> = new Set<SystemCommand>([
  'log-off',
  'restart',
  'shutdown',
])

/** 기본 제공 검색엔진 id. 사용자 지정 엔진은 settings.customSearchEngines 의 id 를 쓴다. */
export type PresetSearchEngineId = 'google' | 'naver' | 'bing'

export interface WebsiteAction {
  type: 'website'
  url: string
  browser: BrowserChoice
}

export interface ProgramAction {
  type: 'program'
  /** exe 또는 .lnk 경로 */
  path: string
  args?: string[]
}

export interface FileAction {
  type: 'file'
  path: string
}

export interface FolderAction {
  type: 'folder'
  path: string
}

export interface SystemAction {
  type: 'system'
  command: SystemCommand
}

export interface SearchAction {
  type: 'search'
  /** PresetSearchEngineId 또는 사용자 지정 엔진 id */
  engine: string
  browser: BrowserChoice
}

export type Action =
  | WebsiteAction
  | ProgramAction
  | FileAction
  | FolderAction
  | SystemAction
  | SearchAction

export type ActionType = Action['type']
