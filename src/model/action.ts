/**
 * 버튼 동작(Action) 모델.
 *
 * 새 동작 종류를 추가하려면:
 *  1. 여기 Action 유니온에 타입을 추가한다.
 *  2. features/actions/registry.ts 의 ACTION_DEFINITIONS 에 표시 정보를 추가한다.
 *  3. Rust 쪽(src-tauri/src/model.rs)에 실행이 필요하면 같은 모양의 variant 를 추가한다.
 *     (search 와 deck-folder 처럼 프론트에서만 처리하는 종류는 Rust 로 보내지 않는다 → features/actions/execute.ts)
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

/**
 * QuickDeck 폴더: 다른 버튼들을 담는 그룹. 누르면 실행이 아니라 그 폴더 안으로 "이동"한다 (프론트 navigation).
 * Windows 폴더를 여는 FolderAction 과는 다른 개념이며 Rust 실행기로 보내지 않는다.
 * 자식은 DeckButton.parentId 가 이 버튼의 id 인 버튼들이다.
 */
export interface DeckFolderAction {
  type: 'deck-folder'
}

/**
 * 다중 실행(P10, UI 명칭 "다중 실행"): 등록된 동작을 위에서 아래 순서로 실행한다.
 * step 은 다른 버튼을 참조하지 않고 Action 값을 그대로 저장한다(스냅샷). 허용 종류·범위는 features/actions/multi.ts.
 * 조건·반복·변수·화면 자동화는 없다 — 기존 Action 을 순서대로 실행하는 것뿐이다.
 */
export type MultiStepAction = WebsiteAction | ProgramAction | FileAction | FolderAction | SystemAction

export interface MultiStep {
  id: string
  action: MultiStepAction
  /** 이 step 실행 요청이 성공한 뒤 다음 step 까지 기다리는 시간 (ms 정수, 0~30000). 마지막 step 뒤에는 쓰지 않는다 */
  delayAfterMs: number
}

/** 어떤 step 이 실패했을 때: 중단 | 실패를 기록하고 (그 step 의 대기는 생략한 채) 다음 step 계속 */
export type MultiFailurePolicy = 'stop' | 'continue'

export interface MultiAction {
  type: 'multi'
  steps: MultiStep[]
  failurePolicy: MultiFailurePolicy
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
  | DeckFolderAction
  | MultiAction

export type ActionType = Action['type']
