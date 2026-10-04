// P10 다중 실행의 순수 로직 검사: 모델·검증·허용/차단 종류·정규화·순차 실행(주입된 실행기)·대기·실패 정책·취소·중복 실행 정책·
// 편집 draft 불변·직렬화·P8/P9 연동·기존 마이그레이션.
// 사용: node --experimental-strip-types --no-warnings scripts/check-multi.ts
import assert from 'node:assert/strict'
import type { Action, MultiAction, MultiStep } from '../src/model/action.ts'
import { SCHEMA_VERSION, migrate, normalizeDeck } from '../src/model/appData.ts'
import type { Deck, DeckButton } from '../src/model/deck.ts'
import {
  MULTI_MAX_DELAY_MS,
  MULTI_MAX_STEPS,
  MULTI_SAFE_SYSTEM_COMMANDS,
  formatDelay,
  isAllowedStepAction,
  isValidDelay,
  normalizeMultiAction,
  stepRejectReason,
  summarizeStepAction,
  validateMultiAction,
} from '../src/features/actions/multi.ts'
import { MultiCancelled, cancellableDelay, runMulti, type MultiRunDeps } from '../src/features/actions/multiRunner.ts'
import { applyDrop } from '../src/features/deck/reorder.ts'
import { applyMoveToFolder } from '../src/features/deck/folders.ts'
import { createDraft, createStep, draftFromButton, draftToButton, moveStep, validateDraft } from '../src/features/editor/draft.ts'
import { autoBuiltinFor, resolveIcon } from '../src/features/icons/auto.ts'
import { ACTION_DEFINITIONS } from '../src/features/actions/registry.ts'

let n = 0
const sid = () => `s${++n}`
const step = (action: Action, delayAfterMs = 0): MultiStep => ({ id: sid(), action: action as MultiStep['action'], delayAfterMs })
const web = (url: string): Action => ({ type: 'website', url, browser: 'default' })
const prog = (path: string): Action => ({ type: 'program', path })
const file = (path: string): Action => ({ type: 'file', path })
const folder = (path: string): Action => ({ type: 'folder', path })
const sys = (command: string): Action => ({ type: 'system', command: command as never })
const multi = (steps: MultiStep[], failurePolicy: MultiAction['failurePolicy'] = 'stop'): MultiAction => ({ type: 'multi', steps, failurePolicy })

const morning = multi([step(prog('C:/Program Files/Edge/msedge.exe'), 1000), step(web('https://portal.example/'), 500), step(web('https://paper.example/')), step(folder('C:/업무')), step(sys('volume-up'))])

// ── 1~11. 모델·검증 ─────────────────────────────────────────────────────
{
  assert.equal(validateMultiAction(morning).ok, true, '1. 다중 실행 생성')
  assert.equal(validateMultiAction(multi([step(web('https://a.b'))])).ok, true, '2. 1 step')
  assert.deepEqual(morning.steps.map((s) => s.action.type), ['program', 'website', 'website', 'folder', 'system'], '3. 순서 유지')
  assert.equal(morning.steps[0]!.delayAfterMs, 1000, '4. delay 저장(ms 정수)')
  assert.equal(isValidDelay(0), true)
  assert.equal(isValidDelay(MULTI_MAX_DELAY_MS), true, '5. 최대 30000')
  assert.equal(isValidDelay(MULTI_MAX_DELAY_MS + 1), false)
  assert.equal(isValidDelay(-1), false, '6. 음수')
  assert.equal(isValidDelay(1.5), false, '6. 정수 아님')
  assert.equal(isValidDelay(Number.NaN), false, '6. NaN')
  assert.equal(isValidDelay('1000' as never), false)
  assert.ok(validateMultiAction(multi([step(web('https://a.b'), -5)])).steps[morning.steps.length ? 's6' : ''] !== undefined || Object.keys(validateMultiAction(multi([step(web('https://a.b'), -5)])).steps).length === 1, '6. invalid delay 차단')
  assert.equal(multi([], 'stop').failurePolicy, 'stop', '7')
  assert.equal(multi([], 'continue').failurePolicy, 'continue', '8')
  assert.ok(validateMultiAction({ ...morning, failurePolicy: 'later' as never }).general.length > 0, '잘못된 정책')
  const dup = multi([{ ...step(web('https://a.b')), id: 'same' }, { ...step(web('https://c.d')), id: 'same' }])
  assert.ok(validateMultiAction(dup).general.some((g) => /중복/.test(g)), '9. step id unique')
  const many = multi(Array.from({ length: MULTI_MAX_STEPS + 1 }, (_, i) => step(web(`https://s${i}.example/`))))
  assert.ok(validateMultiAction(many).general.some((g) => /최대/.test(g)), '10. max step')
  assert.equal(validateMultiAction(multi(Array.from({ length: MULTI_MAX_STEPS }, (_, i) => step(web(`https://s${i}.example/`))))).ok, true, '10. 20개는 허용')
  assert.ok(validateMultiAction(multi([])).general.some((g) => /하나 이상/.test(g)), '11. zero step 차단')
  // 내용 비어 있으면 차단
  assert.ok(Object.values(validateMultiAction(multi([step(web(''))])).steps)[0]?.includes('URL'))
  assert.ok(Object.values(validateMultiAction(multi([step(prog(''))])).steps)[0]?.includes('프로그램'))
}

// ── 12~23. 허용/차단 종류 ────────────────────────────────────────────────
{
  assert.equal(isAllowedStepAction(web('https://a.b')), true, '12. Website')
  assert.equal(isAllowedStepAction(prog('C:/x.exe')), true, '13. Program')
  assert.equal(isAllowedStepAction(file('C:/x.txt')), true, '14. File')
  assert.equal(isAllowedStepAction(folder('C:/x')), true, '15. Windows Folder')
  for (const c of ['play-pause', 'prev-track', 'next-track', 'volume-up', 'volume-down', 'mute', 'file-explorer', 'windows-settings', 'task-manager', 'screen-capture'])
    assert.equal(isAllowedStepAction(sys(c)), true, `16. safe system ${c}`)
  assert.equal(MULTI_SAFE_SYSTEM_COMMANDS.size, 10)
  assert.equal(isAllowedStepAction({ type: 'search', engine: 'google', browser: 'default' }), false, '17. Search 차단')
  assert.match(stepRejectReason({ type: 'search', engine: 'google', browser: 'default' })!, /검색/)
  assert.equal(isAllowedStepAction({ type: 'deck-folder' }), false, '18. deck-folder 차단')
  assert.equal(isAllowedStepAction(multi([step(web('https://a.b'))])), false, '19. nested Multi 차단')
  assert.match(stepRejectReason(multi([]))!, /다중 실행 안에/)
  for (const c of ['shutdown', 'restart', 'log-off', 'sleep', 'lock-screen']) {
    assert.equal(isAllowedStepAction(sys(c)), false, `20~23. ${c} 차단`)
    assert.ok(stepRejectReason(sys(c)), `${c} 사유`)
  }
  // 검증에도 반영
  const bad = multi([step(web('https://a.b')), step(sys('shutdown')), step({ type: 'deck-folder' }), step(multi([step(web('https://x.y'))]))])
  const v = validateMultiAction(bad)
  assert.equal(v.ok, false)
  assert.equal(Object.keys(v.steps).length, 3, '차단 step 3개 모두 보고')
}

// ── 24~29. 순차 실행 러너 (주입된 실행기, 가짜 시계) ─────────────────────
async function harness(action: MultiAction, opts: { failAt?: number[]; cancelAtDelay?: number; cancelAfterStep?: number } = {}) {
  const log: string[] = []
  const controller = new AbortController()
  let t = 0
  const deps: MultiRunDeps = {
    execute: async (a) => {
      const i = log.filter((l) => l.startsWith('run')).length
      log.push(`run:${summarizeStepAction(a).title}@${t}`)
      if (opts.failAt?.includes(i)) throw new Error(`fail-${i}`)
      if (opts.cancelAfterStep === i) controller.abort()
    },
    delay: async (ms, signal) => {
      if (signal.aborted) throw new MultiCancelled()
      if (opts.cancelAtDelay !== undefined && log.filter((l) => l.startsWith('run')).length === opts.cancelAtDelay) {
        log.push(`cancel-during-delay:${ms}`)
        controller.abort()
        throw new MultiCancelled()
      }
      log.push(`wait:${ms}`)
      t += ms
    },
    onProgress: (i, total) => log.push(`progress:${i + 1}/${total}`),
  }
  const result = await runMulti(action, controller.signal, deps)
  return { result, log }
}
{
  const { result, log } = await harness(morning)
  assert.equal(result.status, 'completed', '24')
  assert.deepEqual(
    log.filter((l) => !l.startsWith('progress')),
    ['run:msedge@0', 'wait:1000', 'run:portal.example@1000', 'wait:500', 'run:paper.example@1500', 'run:업무@1500', 'run:볼륨 높이기@1500'],
    '24~25. 실행 → 대기 → 실행 순서, 마지막 뒤 대기 없음, 0ms 대기 생략',
  )
  assert.deepEqual(log.filter((l) => l.startsWith('progress')), ['progress:1/5', 'progress:2/5', 'progress:3/5', 'progress:4/5', 'progress:5/5'])
  assert.equal(result.attempted, 5)
  assert.equal(result.succeeded, 5)

  // 26. stop: 2번(인덱스1) 실패 → 이후 미실행, 실패 step 뒤 대기 없음
  const stop = await harness(morning, { failAt: [1] })
  assert.equal(stop.result.status, 'stopped')
  assert.deepEqual(stop.log.filter((l) => l.startsWith('run')).length, 2, '26. 2개만 실행')
  assert.ok(!stop.log.includes('wait:500'), '실패 step 의 대기 생략')
  assert.equal(stop.result.failures[0]!.index, 1)
  assert.equal(stop.result.failures[0]!.message, 'fail-1')

  // 27. continue: 실패 기록 후 계속, 실패 step 의 대기 생략
  const cont = await harness({ ...morning, failurePolicy: 'continue' }, { failAt: [1] })
  assert.equal(cont.result.status, 'completed-with-errors')
  assert.equal(cont.log.filter((l) => l.startsWith('run')).length, 5, '27. 전부 시도')
  assert.ok(!cont.log.includes('wait:500'), '실패 step(500ms) 대기 생략')
  assert.equal(cont.result.failures.length, 1)
  assert.equal(cont.result.succeeded, 4)

  // 28. delay 중 cancel → 이후 미실행
  const cancelled = await harness(morning, { cancelAtDelay: 1 })
  assert.equal(cancelled.result.status, 'cancelled', '28')
  assert.equal(cancelled.log.filter((l) => l.startsWith('run')).length, 1, '29. 첫 step 만 실행, 이후 미실행')
  assert.equal(cancelled.result.succeeded, 1)
  // 실행 직후 cancel → 다음 step 미실행
  const c2 = await harness(morning, { cancelAfterStep: 2 })
  assert.equal(c2.result.status, 'cancelled')
  assert.equal(c2.log.filter((l) => l.startsWith('run')).length, 3)

  // 검증 실패 Action 은 아무것도 실행하지 않는다 (위험 기능·중첩·검색)
  for (const bad of [multi([step(sys('shutdown'))]), multi([step(multi([step(web('https://a.b'))]))]), multi([step({ type: 'search', engine: 'google', browser: 'default' })]), multi([step({ type: 'deck-folder' })]), multi([])]) {
    const r = await harness(bad)
    assert.equal(r.result.status, 'invalid')
    assert.equal(r.log.filter((l) => l.startsWith('run')).length, 0, '실행 0')
    assert.ok(r.result.invalidReason)
  }
  // 실제 cancellableDelay: abort 시 즉시 거부
  const ac = new AbortController()
  const p = cancellableDelay(5000, ac.signal)
  setTimeout(() => ac.abort(), 5)
  await assert.rejects(p, MultiCancelled, '취소 가능한 대기')
  await cancellableDelay(0, new AbortController().signal)
}

// ── 30~31. 중복 실행 정책 (App 과 같은 규칙을 순수 함수로) ───────────────
{
  const policy = (running: { buttonId: string; name: string } | null, button: { id: string }) =>
    !running ? 'start' : running.buttonId === button.id ? 'same-running' : 'other-running'
  assert.equal(policy(null, { id: 'a' }), 'start')
  assert.equal(policy({ buttonId: 'a', name: '출근' }, { id: 'a' }), 'same-running', '30. 같은 Multi 재실행 차단')
  assert.equal(policy({ buttonId: 'a', name: '출근' }, { id: 'b' }), 'other-running', '31. 다른 Multi 동시 실행 차단 (한 번에 하나)')
}

// ── 32. 편집 draft: 취소하면 원본 불변 ──────────────────────────────────
const deck: Deck = {
  id: 'd',
  name: '덱',
  layout: { columns: 4, rows: 3 },
  buttons: [
    { id: 'm1', parentId: null, position: { row: 0, col: 0 }, name: '출근 준비', action: morning, icon: { kind: 'builtin', name: 'color-coffee' }, hotkey: 'Q', display: 'icon-text' },
    { id: 'f1', parentId: null, position: { row: 0, col: 1 }, name: '방과후', action: { type: 'deck-folder' }, icon: { kind: 'auto' }, hotkey: 'E', display: 'icon-text' },
    { id: 'w1', parentId: null, position: { row: 0, col: 2 }, name: '웹', action: web('https://w.example/'), icon: { kind: 'auto' }, hotkey: 'W', display: 'icon-text' },
  ],
}
const snapshot = JSON.stringify(deck)
{
  const original = deck.buttons[0]!
  const d = draftFromButton(original, 'default', 'google')
  assert.equal(d.actionType, 'multi')
  assert.equal(d.multi.steps.length, 5)
  // draft 를 마음껏 바꾼다
  d.multi.steps = moveStep(d.multi.steps, 0, 1)
  d.multi.steps = d.multi.steps.filter((_, i) => i !== 2)
  d.multi.steps[0] = { ...d.multi.steps[0]!, delayAfterMs: 3000 }
  d.multi.steps.push(createStep('website', 'default'))
  d.multi.failurePolicy = 'continue'
  assert.equal(JSON.stringify(deck), snapshot, '32. 원본 덱·Action 불변 (취소 = 아무 일도 없음)')
  assert.deepEqual((original.action as MultiAction).steps.map((s) => s.action.type), ['program', 'website', 'website', 'folder', 'system'])
  // 저장: 빈 step 이 있으면 차단
  const errs = validateDraft(d, deck, 'm1')
  assert.ok(errs.steps && Object.keys(errs.steps).length === 1, '빈 URL step 차단')
  d.multi.steps.pop()
  assert.deepEqual(validateDraft(d, deck, 'm1'), {}, '정리하면 저장 가능')
  const saved = draftToButton(d, original.position, deck, 'm1')
  const a = saved.action as MultiAction
  assert.deepEqual(a.steps.map((s) => s.action.type), ['website', 'program', 'folder', 'system'], '순서 변경·삭제 반영')
  assert.equal(a.steps[0]!.delayAfterMs, 3000)
  assert.equal(a.failurePolicy, 'continue')
  assert.equal(saved.id, 'm1')
  assert.equal(saved.hotkey, 'Q')
  assert.deepEqual(saved.icon, { kind: 'builtin', name: 'color-coffee' })
  // 새 버튼 draft: 다중 실행 종류로 바꾸고 step 없이 저장하면 차단
  const nd = { ...createDraft({ row: 1, col: 0 }, deck, null, 'default', 'google'), name: '테스트', actionType: 'multi' as const }
  assert.match(validateDraft(nd, deck).multi!, /하나 이상/)
  nd.multi = { steps: [createStep('system', 'default')], failurePolicy: 'stop' }
  assert.ok(validateDraft(nd, deck).steps, '기능 미선택 차단')
  nd.multi.steps[0] = { ...nd.multi.steps[0]!, action: sys('mute') as never }
  assert.deepEqual(validateDraft(nd, deck), {})
  // 웹사이트 URL 은 저장 시 https:// 보정
  const nd2 = { ...nd, multi: { steps: [{ ...createStep('website', 'default'), action: { type: 'website' as const, url: 'example.com/x', browser: 'default' as const } }], failurePolicy: 'stop' as const } }
  const b2 = draftToButton(nd2, { row: 1, col: 0 }, deck)
  assert.equal(((b2.action as MultiAction).steps[0]!.action as { url: string }).url, 'https://example.com/x')
}

// ── 33~37. 직렬화 / restart / IconRef·parentId·hotkey 보존 / 정규화 ─────
{
  const settings = { window: {}, hotkey: { enabled: true, accelerator: 'Ctrl+Shift+Space' }, defaultBrowser: 'default', defaultSearchEngine: 'google', customSearchEngines: [], appearance: { theme: 'system' } }
  const fileData = { schemaVersion: 5, settings, decks: [deck], activeDeckId: 'd' }
  const m = migrate(JSON.parse(JSON.stringify(fileData)))!
  assert.equal(SCHEMA_VERSION, 5, '35. 스키마 v5 유지 (migration 불필요)')
  assert.deepEqual(m.decks[0]!.buttons, deck.buttons, '33~34. v5 round-trip 완전 동일 (steps·delay·policy·IconRef·parentId·hotkey)')
  // 정규화: 깨진 모양을 고치되 버튼은 버리지 않는다
  const raw = {
    type: 'multi',
    steps: [
      { id: 'a', action: web('https://a.b'), delayAfterMs: 999999 },
      { id: 'a', action: prog('C:/x.exe'), delayAfterMs: -3 },
      { action: folder('C:/f'), delayAfterMs: 'soon' },
      { action: sys('shutdown'), delayAfterMs: 1.6 },
      'garbage',
      { id: 'noaction' },
    ],
    failurePolicy: 'whatever',
  }
  const norm = normalizeMultiAction(raw, (() => { let k = 0; return () => `n${++k}` })())
  assert.equal(norm.steps.length, 4, '객체가 아니거나 action 없는 step 만 제거')
  assert.deepEqual(norm.steps.map((s) => s.delayAfterMs), [MULTI_MAX_DELAY_MS, 0, 0, 2], 'delay 범위·정수 보정')
  assert.equal(new Set(norm.steps.map((s) => s.id)).size, 4, 'id 유일')
  assert.equal(norm.failurePolicy, 'stop')
  assert.equal(norm.steps[3]!.action.type, 'system', '허용되지 않는 step 은 데이터로 남긴다 (편집기 저장 차단·runner 거부)')
  assert.equal(validateMultiAction(norm).ok, false)
  // normalizeDeck 을 통과해도 버튼 수는 그대로
  const nd = normalizeDeck({ ...deck, buttons: [...deck.buttons, { id: 'bad', parentId: null, position: { row: 2, col: 2 }, name: '깨짐', action: raw as never, icon: { kind: 'auto' }, hotkey: null, display: 'icon-text' }] })
  assert.equal(nd.buttons.length, 4)
  assert.equal((nd.buttons[3]!.action as MultiAction).steps.length, 4)
  assert.equal(normalizeMultiAction({ steps: 'nope' }, sid).steps.length, 0)
}

// ── 38~39. P9 폴더 이동 / P8 swap 후 steps 보존 ─────────────────────────
{
  const moved = applyMoveToFolder(deck, 'm1', 'f1')!
  const mb = moved.buttons.find((b) => b.id === 'm1')!
  assert.equal(mb.parentId, 'f1', '38. 폴더 이동')
  assert.deepEqual(mb.action, morning, '38. steps 그대로')
  assert.equal(mb.hotkey, 'Q')
  const swapped = applyDrop(deck, 'm1', { row: 0, col: 2 })!
  assert.deepEqual(swapped.buttons.find((b) => b.id === 'm1')!.position, { row: 0, col: 2 }, '39. P8 swap')
  assert.deepEqual(swapped.buttons.find((b) => b.id === 'm1')!.action, morning, '39. steps 그대로')
  assert.deepEqual(swapped.buttons.find((b) => b.id === 'w1')!.position, { row: 0, col: 0 })
  assert.equal(JSON.stringify(deck), snapshot)
}

// ── 40. 기존 v1~v5 마이그레이션 ─────────────────────────────────────────
{
  const buttons = [{ id: 'b1', position: { row: 0, col: 0 }, name: '네이버', action: web('https://naver.com/'), icon: { kind: 'none' }, hotkey: '1', display: 'icon-text' }]
  for (const ver of [1, 2, 3, 4, 5]) {
    const f = {
      schemaVersion: ver,
      settings: ver === 1 ? { window: { alwaysOnTop: true }, hotkey: { enabled: true, accelerator: 'Ctrl+Space' } } : { window: {}, hotkey: { enabled: true, accelerator: 'Ctrl+Space' }, defaultBrowser: 'edge', defaultSearchEngine: 'naver', customSearchEngines: [] },
      decks: [{ id: 'd', name: '덱', layout: { columns: 4, rows: 3 }, buttons: buttons.map((b) => ({ ...b, ...(ver >= 5 ? { parentId: null } : {}) })) }],
      activeDeckId: 'd',
    }
    const m = migrate(JSON.parse(JSON.stringify(f)))!
    assert.equal(m.schemaVersion, 5, `40. v${ver} → v5`)
    assert.equal(m.decks[0]!.buttons[0]!.hotkey, '1')
    assert.equal(m.decks[0]!.buttons[0]!.parentId, null)
    assert.equal(m.settings.hotkey.accelerator, 'Ctrl+Space')
  }
}

// ── 표시·아이콘·등록 ─────────────────────────────────────────────────────
{
  assert.deepEqual(summarizeStepAction(prog('C:/Program Files/Microsoft/Edge/msedge.exe') as never), { title: 'msedge', detail: 'C:/Program Files/Microsoft/Edge/msedge.exe', kind: '프로그램' })
  assert.equal(summarizeStepAction(web('https://www.portal.example/path?q=1') as never).title, 'portal.example')
  assert.equal(summarizeStepAction(web('portal.example') as never).title, 'portal.example')
  assert.equal(summarizeStepAction(file('C:/a/보고서.xlsx') as never).title, '보고서.xlsx')
  assert.equal(summarizeStepAction(folder('C:/업무/방과후 자료/') as never).title, '방과후 자료')
  assert.equal(summarizeStepAction(sys('mute') as never).title, '음소거')
  assert.equal(formatDelay(0), '없음')
  assert.equal(formatDelay(500), '0.5초')
  assert.equal(formatDelay(1000), '1초')
  assert.equal(formatDelay(2500), '2.5초')
  assert.equal(autoBuiltinFor(morning), 'zap', '자동 아이콘')
  assert.deepEqual(resolveIcon({ icon: { kind: 'auto' }, action: morning }), { kind: 'builtin', name: 'zap' })
  assert.equal(ACTION_DEFINITIONS.multi.label, '다중 실행')
  assert.equal(ACTION_DEFINITIONS.multi.describe(morning), '5개 동작을 순서대로 실행')
}

console.log('check-multi: ok')
