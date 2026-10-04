// Node 검사 스크립트(scripts/check-multi.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import type { Action, MultiAction, MultiFailurePolicy, MultiStep, MultiStepAction, SystemCommand } from '../../model/action.ts'
import { SYSTEM_COMMAND_LABELS } from './registry.ts'
import { basename, stem } from '../../lib/path.ts'

/**
 * 다중 실행(Multi Action)의 순수 로직: 허용 범위, 검증, 정규화, 표시용 요약.
 *
 * P10 범위: "기존 Action 여러 개를 순서대로 실행" 만. 조건·반복·변수·화면 자동화는 없다.
 * step 은 다른 버튼을 참조하지 않고 Action 값을 그대로 저장한다(스냅샷) — 원본 버튼 삭제·폴더 이동과 무관.
 */

export const MULTI_MIN_STEPS = 1
export const MULTI_MAX_STEPS = 20
export const MULTI_MIN_DELAY_MS = 0
export const MULTI_MAX_DELAY_MS = 30_000
export const MULTI_DEFAULT_DELAY_MS = 0
export const MULTI_FAILURE_POLICIES: readonly MultiFailurePolicy[] = ['stop', 'continue']
export const MULTI_FAILURE_POLICY_LABELS: Record<MultiFailurePolicy, string> = { stop: '실행 중단', continue: '다음 동작 계속' }

/** UI 에서 고르는 대기 시간 보기 (저장은 항상 ms 정수) */
export const MULTI_DELAY_PRESETS_MS: readonly number[] = [0, 500, 1000, 2000, 3000, 5000, 10_000]

/** step 으로 허용되는 Action 종류 */
export const MULTI_STEP_TYPES: ReadonlyArray<MultiStepAction['type']> = ['website', 'program', 'file', 'folder', 'system']

/**
 * step 으로 허용되는 시스템 기능: 즉시 실행되고 세션을 끝내거나 잠그지 않는 것만.
 * sleep / log-off / restart / shutdown / lock-screen 은 이후 step 의 의미가 없어지므로 제외한다.
 * 단일 버튼에서는 기존 확인창 정책 그대로 쓸 수 있다.
 */
export const MULTI_SAFE_SYSTEM_COMMANDS: ReadonlySet<SystemCommand> = new Set<SystemCommand>([
  'play-pause',
  'prev-track',
  'next-track',
  'volume-up',
  'volume-down',
  'mute',
  'file-explorer',
  'windows-settings',
  'task-manager',
  'screen-capture',
])

export function isMultiAction(action: Action): action is MultiAction {
  return action.type === 'multi'
}

/** 이 Action 을 step 으로 넣을 수 있는가 (종류·시스템 기능 안전성). 내용(URL·경로) 검증은 validateMultiAction 에서 */
export function isAllowedStepAction(action: Action): action is MultiStepAction {
  switch (action.type) {
    case 'website':
    case 'program':
    case 'file':
    case 'folder':
      return true
    case 'system':
      return MULTI_SAFE_SYSTEM_COMMANDS.has(action.command)
    case 'search':
    case 'deck-folder':
    case 'multi':
      return false
  }
}

export function isValidDelay(ms: unknown): ms is number {
  return typeof ms === 'number' && Number.isInteger(ms) && ms >= MULTI_MIN_DELAY_MS && ms <= MULTI_MAX_DELAY_MS
}

/** 왜 step 으로 쓸 수 없는지 (허용되면 null) */
export function stepRejectReason(action: Action): string | null {
  switch (action.type) {
    case 'search':
      return '검색은 검색어 입력이 필요해 다중 실행에 넣을 수 없습니다'
    case 'deck-folder':
      return 'QuickDeck 폴더는 실행이 아니라 이동이라 다중 실행에 넣을 수 없습니다'
    case 'multi':
      return '다중 실행 안에 다중 실행을 넣을 수 없습니다'
    case 'system':
      // 아직 기능을 고르지 않은 step 은 '거부' 가 아니라 '내용 없음' (stepContentError 가 안내한다)
      if (!action.command) return null
      return MULTI_SAFE_SYSTEM_COMMANDS.has(action.command) ? null : `'${SYSTEM_COMMAND_LABELS[action.command]}' 은(는) 다중 실행에 넣을 수 없습니다`
    default:
      return null
  }
}

export interface MultiValidation {
  /** 전체에 대한 오류 (step 수·정책) */
  general: string[]
  /** step id → 오류 문구 */
  steps: Record<string, string>
  ok: boolean
}

/**
 * 저장·실행 전 검증. 손상 데이터도 여기서 걸러진다(runner 는 ok 가 아니면 아무것도 실행하지 않는다).
 * step 내용(빈 URL·경로·기능)도 본다.
 */
export function validateMultiAction(action: MultiAction): MultiValidation {
  const general: string[] = []
  const steps: Record<string, string> = {}
  if (!Array.isArray(action.steps)) return { general: ['동작 목록이 없습니다'], steps, ok: false }
  if (action.steps.length < MULTI_MIN_STEPS) general.push('동작을 하나 이상 추가하세요')
  if (action.steps.length > MULTI_MAX_STEPS) general.push(`동작은 최대 ${MULTI_MAX_STEPS}개까지입니다`)
  if (!MULTI_FAILURE_POLICIES.includes(action.failurePolicy)) general.push('실패 시 정책이 올바르지 않습니다')
  const ids = new Set<string>()
  action.steps.forEach((s, i) => {
    const key = typeof s?.id === 'string' && s.id ? s.id : `#${i}`
    if (ids.has(key)) {
      general.push(`${i + 1}번 동작의 id 가 중복됩니다`)
      return
    }
    ids.add(key)
    if (!s || typeof s !== 'object' || !s.action || typeof s.action !== 'object') {
      steps[key] = '동작 내용이 없습니다'
      return
    }
    const reject = stepRejectReason(s.action as Action)
    if (reject) {
      steps[key] = reject
      return
    }
    const content = stepContentError(s.action)
    if (content) {
      steps[key] = content
      return
    }
    if (!isValidDelay(s.delayAfterMs)) steps[key] = `대기 시간은 0~${MULTI_MAX_DELAY_MS / 1000}초 사이의 값이어야 합니다`
  })
  return { general, steps, ok: general.length === 0 && Object.keys(steps).length === 0 }
}

/** step 의 내용이 비어 있으면 안내 문구 */
export function stepContentError(action: MultiStepAction): string | null {
  switch (action.type) {
    case 'website':
      return action.url?.trim() ? null : 'URL 을 입력하세요'
    case 'program':
      return action.path ? null : '프로그램을 선택하세요'
    case 'file':
      return action.path ? null : '파일을 선택하세요'
    case 'folder':
      return action.path ? null : '폴더를 선택하세요'
    case 'system':
      return action.command ? null : '기능을 선택하세요'
  }
}

/**
 * 저장 파일에서 읽은 multi Action 의 모양을 고친다 (버튼은 버리지 않는다).
 * - steps 가 배열이 아니면 빈 배열, step 이 객체가 아니면 제거
 * - delay 가 숫자가 아니거나 범위 밖이면 범위 안으로 (NaN → 0)
 * - id 가 없거나 중복이면 새로 부여
 * - failurePolicy 가 이상하면 'stop'
 * 허용되지 않는 종류의 step 은 그대로 둔다 → 편집기가 저장을 막고 runner 가 실행을 거부한다 (사용자 데이터를 임의로 지우지 않기 위해)
 */
export function normalizeMultiAction(raw: unknown, newId: () => string): MultiAction {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { steps?: unknown; failurePolicy?: unknown }
  const seen = new Set<string>()
  const steps: MultiStep[] = (Array.isArray(r.steps) ? r.steps : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && !!(s as { action?: unknown }).action && typeof (s as { action?: unknown }).action === 'object')
    .map((s) => {
      let id = typeof s.id === 'string' && s.id ? s.id : newId()
      if (seen.has(id)) id = newId()
      seen.add(id)
      const d = s.delayAfterMs
      const delay = typeof d === 'number' && Number.isFinite(d) ? Math.min(MULTI_MAX_DELAY_MS, Math.max(MULTI_MIN_DELAY_MS, Math.round(d))) : MULTI_DEFAULT_DELAY_MS
      return { id, action: s.action as MultiStepAction, delayAfterMs: delay }
    })
  const failurePolicy: MultiFailurePolicy = r.failurePolicy === 'continue' ? 'continue' : 'stop'
  return { type: 'multi', steps, failurePolicy }
}

// ── 표시용 요약 ─────────────────────────────────────────────────────────

export interface ActionSummary {
  /** 카드 제목: 프로그램·파일·폴더 이름, 웹사이트 호스트, 기능 이름 */
  title: string
  /** 보조 텍스트: 전체 경로·URL (없으면 '') */
  detail: string
  /** 종류 라벨 */
  kind: string
}

const KIND_LABELS: Record<MultiStepAction['type'], string> = {
  website: '웹사이트',
  program: '프로그램',
  file: '파일',
  folder: 'Windows 폴더',
  system: '시스템',
}

export function summarizeStepAction(action: MultiStepAction): ActionSummary {
  switch (action.type) {
    case 'website': {
      const url = action.url?.trim() ?? ''
      let host = url
      try {
        host = new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '')
      } catch {
        /* 호스트를 못 뽑으면 URL 그대로 */
      }
      return { title: host || '(URL 없음)', detail: url, kind: KIND_LABELS.website }
    }
    case 'program':
      return { title: action.path ? stem(basename(action.path)) : '(프로그램 없음)', detail: action.path, kind: KIND_LABELS.program }
    case 'file':
      return { title: action.path ? basename(action.path) : '(파일 없음)', detail: action.path, kind: KIND_LABELS.file }
    case 'folder':
      return { title: action.path ? basename(action.path) || action.path : '(폴더 없음)', detail: action.path, kind: KIND_LABELS.folder }
    case 'system':
      return { title: action.command ? SYSTEM_COMMAND_LABELS[action.command] : '(기능 없음)', detail: '', kind: KIND_LABELS.system }
  }
}

/** 대기 시간 표시: 0 → '없음', 500 → '0.5초', 1000 → '1초' */
export function formatDelay(ms: number): string {
  if (ms <= 0) return '없음'
  const s = ms / 1000
  return `${Number.isInteger(s) ? s : s.toFixed(1)}초`
}

/** 다중 실행 버튼의 한 줄 설명 */
export function describeMulti(action: MultiAction): string {
  const n = Array.isArray(action.steps) ? action.steps.length : 0
  return `${n}개 동작을 순서대로 실행`
}
