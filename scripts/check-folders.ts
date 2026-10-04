// P9 QuickDeck 폴더의 순수 로직 검사: 마이그레이션(v1~v4 → v5, 모두 루트), 컨테이너별 위치·실행키 유일성, 탐색(진입·상위·경로),
// 중첩, cycle·손상 복구, 삭제 정책, 다른 폴더 이동, P8 drag 와의 호환, off-grid 컨테이너별 보존, 직렬화.
// 사용: node --experimental-strip-types --no-warnings scripts/check-folders.ts
import assert from 'node:assert/strict'
import { SCHEMA_VERSION, migrate, normalizeDeck } from '../src/model/appData.ts'
import { findButtonAt, findHotkeyOwner, hiddenButtons, visibleButtons, type Deck, type DeckButton } from '../src/model/deck.ts'
import { findButtonByCode, findButtonForEvent } from '../src/features/hotkeys/keymap.ts'
import { applyDrop, planDrop } from '../src/features/deck/reorder.ts'
import {
  applyMoveToFolder,
  childrenOf,
  describeMoveFailure,
  firstEmptySlot,
  folderOptions,
  folderPath,
  hiddenCountIn,
  isFolderButton,
  isSelfOrDescendant,
  parentFolderId,
  planDelete,
  planMoveToFolder,
  repairHierarchy,
  resolveFolderId,
} from '../src/features/deck/folders.ts'
import { createDraft, draftFromButton, draftToButton, validateDraft } from '../src/features/editor/draft.ts'
import { autoBuiltinFor, resolveIcon } from '../src/features/icons/auto.ts'
import { ACTION_DEFINITIONS } from '../src/features/actions/registry.ts'

const mk = (id: string, row: number, col: number, extra: Partial<DeckButton> = {}): DeckButton => ({
  id,
  parentId: null,
  position: { row, col },
  name: id,
  action: { type: 'website', url: `https://${id}.example/`, browser: 'default' },
  icon: { kind: 'auto' },
  hotkey: null,
  display: 'icon-text',
  ...extra,
})
const folder = (id: string, row: number, col: number, extra: Partial<DeckButton> = {}): DeckButton => mk(id, row, col, { action: { type: 'deck-folder' }, ...extra })

const settings = {
  window: { alwaysOnTop: false, autoStart: false, hideAfterRun: true, closeToTray: true, showAt: 'cursor-monitor', lastBounds: null },
  hotkey: { enabled: true, accelerator: 'Ctrl+Space' },
  defaultBrowser: 'edge',
  defaultSearchEngine: 'naver',
  customSearchEngines: [{ id: 'c1', name: 'YouTube', urlTemplate: 'https://y/{query}' }],
  appearance: { theme: 'dark' },
}

// 예시 덱: 루트 Q=업무포털, W=학교종이, E=📁방과후, R=검색 / 방과후: Q=정산, W=출석부, A=학교종이(같은 이름) / 방과후 › 정산폴더(중첩)
const deck: Deck = {
  id: 'd',
  name: '덱',
  layout: { columns: 4, rows: 3 },
  buttons: [
    mk('portal', 0, 0, { hotkey: 'Q', icon: { kind: 'builtin', name: 'web' } }),
    mk('paper', 0, 1, { hotkey: 'W', action: { type: 'program', path: 'C:/x/paper.exe' }, icon: { kind: 'extracted', file: 'extracted/e_1.png' } }),
    folder('after', 0, 2, { hotkey: 'E', name: '방과후' }),
    mk('search', 0, 3, { hotkey: 'R', action: { type: 'search', engine: 'c1', browser: 'default' } }),
    mk('settle', 0, 0, { parentId: 'after', hotkey: 'Q', action: { type: 'program', path: 'C:/x/settle.exe' } }),
    mk('attend', 0, 1, { parentId: 'after', hotkey: 'W', action: { type: 'file', path: 'C:/x/attend.xlsx' }, icon: { kind: 'image', file: 'custom/c_1.png' } }),
    mk('paper2', 1, 0, { parentId: 'after', hotkey: 'A', name: '학교종이' }),
    folder('settle-folder', 1, 1, { parentId: 'after', hotkey: 'S', name: '정산' }),
    mk('deep', 0, 0, { parentId: 'settle-folder', hotkey: 'Q', action: { type: 'system', command: 'volume-up' } }),
    mk('offgrid', 5, 7, { parentId: 'after', hotkey: 'Z' }),
  ],
}
const snapshot = JSON.stringify(deck)
const ids = (bs: DeckButton[]) => bs.map((b) => b.id)
const noDup = (d: Deck) => {
  const keys = d.buttons.map((b) => `${b.parentId ?? 'root'}|${b.position.row},${b.position.col}`)
  assert.equal(new Set(keys).size, keys.length, '같은 폴더 안에 같은 row/col 이 없어야 한다')
}

// ── 1. 마이그레이션: v4(그리고 v1~v3) → v5, 기존 버튼은 모두 루트 ─────────
{
  const v4buttons = deck.buttons
    .filter((b) => b.parentId === null)
    .map(({ parentId: _p, ...rest }) => rest) // v4 파일에는 parentId 가 없다
  const v4 = { schemaVersion: 4, settings, decks: [{ id: 'd', name: '덱', layout: { columns: 4, rows: 3 }, buttons: v4buttons }], activeDeckId: 'd' }
  const m = migrate(JSON.parse(JSON.stringify(v4)))!
  assert.equal(SCHEMA_VERSION, 5)
  assert.equal(m.schemaVersion, 5)
  assert.ok(m.decks[0]!.buttons.every((b) => b.parentId === null), '모든 기존 버튼은 루트')
  assert.deepEqual(
    m.decks[0]!.buttons.map((b) => [b.id, b.position, b.hotkey, b.name, b.display, b.icon, b.action]),
    v4buttons.map((b) => [b.id, b.position, b.hotkey, b.name, b.display, b.icon, b.action]),
    'id·위치·실행키·이름·표시·IconRef·Action 보존',
  )
  assert.equal(m.settings.hotkey.accelerator, 'Ctrl+Space')
  assert.deepEqual(m.settings.customSearchEngines, settings.customSearchEngines)
  assert.equal(m.settings.appearance.theme, 'dark')
  assert.deepEqual(m.decks[0]!.layout, { columns: 4, rows: 3 })
  // v1 / v2 / v3 에서도 끝까지 올라오고 모두 루트
  for (const ver of [1, 2, 3]) {
    const old = { ...JSON.parse(JSON.stringify(v4)), schemaVersion: ver }
    if (ver === 1) old.settings = { window: { alwaysOnTop: true }, hotkey: { enabled: true, accelerator: 'Ctrl+Space' } }
    const mm = migrate(old)!
    assert.equal(mm.schemaVersion, 5, `v${ver} → v5`)
    assert.equal(mm.decks[0]!.buttons.length, v4buttons.length, `v${ver}: 버튼 수 보존`)
    assert.ok(mm.decks[0]!.buttons.every((b) => b.parentId === null), `v${ver}: 모두 루트`)
  }
}

// ── 2~5. 컨테이너별 위치·실행키 ────────────────────────────────────────────
{
  assert.equal(findButtonAt(deck, { row: 0, col: 0 })!.id, 'portal', '루트 (0,0)')
  assert.equal(findButtonAt(deck, { row: 0, col: 0 }, 'after')!.id, 'settle', '방과후 (0,0) — 같은 position 허용')
  assert.equal(findButtonAt(deck, { row: 0, col: 0 }, 'settle-folder')!.id, 'deep')
  assert.equal(findHotkeyOwner(deck, 'Q')!.id, 'portal', '루트 Q')
  assert.equal(findHotkeyOwner(deck, 'q', undefined, 'after')!.id, 'settle', '방과후 Q — 같은 hotkey 허용')
  assert.equal(findHotkeyOwner(deck, 'E', undefined, 'after'), undefined, '다른 폴더의 키는 충돌이 아니다')
  // 같은 폴더 안 중복 실행키 금지 (편집기 검증)
  const d1 = draftFromButton(deck.buttons.find((b) => b.id === 'attend')!, 'default', 'google')
  assert.ok(validateDraft({ ...d1, hotkey: 'Q' }, deck, 'attend').hotkey, '방과후 안에서 Q 는 정산이 쓴다')
  assert.equal(validateDraft({ ...d1, hotkey: 'E' }, deck, 'attend').hotkey, undefined, '루트의 E 는 방과후 안에서 자유')
  // 같은 폴더 안 중복 position 금지 (복구 로직이 뒤 버튼을 옮긴다)
  const dup: Deck = { ...deck, buttons: [...deck.buttons, mk('dup', 0, 0, { parentId: 'after' })] }
  const fixed = repairHierarchy(dup)
  assert.equal(fixed.report.repositioned, 1)
  noDup(fixed.deck)
  assert.deepEqual(fixed.deck.buttons.find((b) => b.id === 'dup')!.position, { row: 0, col: 2 }, '방과후의 첫 빈 슬롯 (0,2)')
  assert.deepEqual(fixed.deck.buttons.find((b) => b.id === 'settle')!.position, { row: 0, col: 0 }, '앞 버튼은 그대로')
  // 새 버튼 기본 실행키 제안도 컨테이너 기준
  assert.equal(createDraft({ row: 1, col: 0 }, deck, 'after', 'default', 'google').hotkey, '', '방과후 (1,0) 의 기본키 Q 는 정산이 이미 사용 중')
  assert.equal(createDraft({ row: 1, col: 2 }, deck, 'after', 'default', 'google').hotkey, 'E', '루트가 E 를 써도 방과후에서는 제안된다')
  assert.equal(createDraft({ row: 0, col: 2 }, deck, 'after', 'default', 'google').parentId, 'after')
}

// ── 6~9. 진입 / 상위 / 경로 / 중첩 ───────────────────────────────────────
{
  // 진입: 폴더 버튼의 실행키 → 그 폴더로. 키 매핑은 보고 있는 폴더 안에서만
  const e = findButtonForEvent(deck, { code: 'KeyE', key: 'e' }, null)!
  assert.ok(isFolderButton(e) && e.id === 'after', '루트에서 E 는 방과후 폴더')
  assert.equal(findButtonByCode(deck, 'KeyQ', null)!.id, 'portal')
  assert.equal(findButtonByCode(deck, 'KeyQ', 'after')!.id, 'settle', '방과후에서 Q 는 정산')
  assert.equal(findButtonByCode(deck, 'KeyQ', 'settle-folder')!.id, 'deep', '중첩 폴더에서 Q')
  assert.equal(findButtonByCode(deck, 'KeyE', 'after'), undefined, '방과후 안에 E 없음 (루트 키는 새지 않는다)')
  assert.equal(findButtonByCode(deck, 'KeyZ', 'after'), undefined, '격자 밖 버튼은 실행되지 않는다')
  // 상위
  assert.equal(parentFolderId(deck, 'settle-folder'), 'after')
  assert.equal(parentFolderId(deck, 'after'), null)
  assert.equal(parentFolderId(deck, null), null)
  assert.equal(parentFolderId(deck, 'ghost'), null, '없는 폴더면 루트')
  // 경로(breadcrumb)
  assert.deepEqual(ids(folderPath(deck, null)), [])
  assert.deepEqual(ids(folderPath(deck, 'after')), ['after'])
  assert.deepEqual(ids(folderPath(deck, 'settle-folder')), ['after', 'settle-folder'], '중첩 경로')
  assert.deepEqual(folderOptions(deck).map((o) => o.label), ['QuickDeck', 'QuickDeck › 방과후', 'QuickDeck › 방과후 › 정산'])
  // 보고 있던 폴더가 사라지면 루트
  assert.equal(resolveFolderId(deck, 'after'), 'after')
  assert.equal(resolveFolderId(deck, 'portal'), null, '폴더가 아닌 버튼')
  assert.equal(resolveFolderId(deck, 'ghost'), null)
  // 폴더 안 보이는 버튼 / 자식
  assert.deepEqual(ids(visibleButtons(deck, 'after')), ['settle', 'attend', 'paper2', 'settle-folder'])
  assert.deepEqual(ids(childrenOf(deck, 'after')), ['settle', 'attend', 'paper2', 'settle-folder', 'offgrid'])
}

// ── 10~13. self-parent / cycle / missing parent / non-folder parent 복구 ──
{
  const broken: Deck = {
    ...deck,
    buttons: [
      ...deck.buttons,
      mk('self', 2, 0, { parentId: 'self' }),
      mk('orphan', 2, 1, { parentId: 'nope' }),
      mk('badparent', 2, 2, { parentId: 'portal' }), // 폴더가 아닌 버튼을 부모로
      folder('cyA', 2, 3, { parentId: 'cyB' }),
      folder('cyB', 2, 0, { parentId: 'cyA' }),
    ],
  }
  // 손상 데이터에서도 경로·자손 검사가 끝난다 (무한 루프 없음)
  assert.ok(folderPath(broken, 'cyA').length <= 2)
  assert.equal(isSelfOrDescendant(broken, 'cyA', 'cyB'), true)
  const { deck: fixed, report } = repairHierarchy(broken)
  assert.equal(report.reparented, 5, 'self, orphan, badparent, cyA, cyB → 루트')
  for (const id of ['self', 'orphan', 'badparent', 'cyA', 'cyB']) assert.equal(fixed.buttons.find((b) => b.id === id)!.parentId, null, `${id} 는 루트로`)
  assert.equal(fixed.buttons.length, broken.buttons.length, '버튼은 버리지 않는다')
  noDup(fixed)
  // 정상 데이터는 손대지 않는다
  const same = repairHierarchy(deck)
  assert.deepEqual(same.report, { reparented: 0, repositioned: 0, hotkeysCleared: 0 })
  assert.equal(same.deck, deck, '변화가 없으면 같은 객체')
  // normalizeDeck 도 같은 결과 (parentId 누락 → null)
  const nd = normalizeDeck({ ...deck, buttons: deck.buttons.map((b) => (b.id === 'portal' ? (({ parentId: _p, ...r }) => r as DeckButton)(b) : b)) })
  assert.equal(nd.buttons.find((b) => b.id === 'portal')!.parentId, null)
  // 같은 폴더 중복 실행키 → 뒤 버튼의 키만 비운다
  const dupKey: Deck = { ...deck, buttons: [...deck.buttons, mk('dupkey', 2, 3, { parentId: 'after', hotkey: 'q' })] }
  const fk = repairHierarchy(dupKey)
  assert.equal(fk.report.hotkeysCleared, 1)
  assert.equal(fk.deck.buttons.find((b) => b.id === 'dupkey')!.hotkey, null)
  assert.equal(fk.deck.buttons.find((b) => b.id === 'settle')!.hotkey, 'Q', '앞 버튼의 키는 유지')
  // self-parent 는 편집기에서도 막힌다 (이동 대상에서 자기 자신·자손은 비활성)
  const opts = folderOptions(deck, 'after')
  assert.equal(opts.find((o) => o.id === 'after')!.disabled, true)
  assert.equal(opts.find((o) => o.id === 'settle-folder')!.disabled, true, '자손 폴더도 비활성')
  assert.equal(opts.find((o) => o.id === null)!.disabled, false)
}

// ── 14~15. 삭제 정책 ────────────────────────────────────────────────────
{
  assert.deepEqual(planDelete(deck, 'after'), { ok: false, reason: 'folder-not-empty', count: 5 }, '내용 있는 폴더 삭제 차단')
  assert.deepEqual(planDelete(deck, 'settle-folder'), { ok: false, reason: 'folder-not-empty', count: 1 })
  const emptyFolderDeck: Deck = { ...deck, buttons: [...deck.buttons, folder('empty', 2, 0)] }
  assert.deepEqual(planDelete(emptyFolderDeck, 'empty'), { ok: true }, '빈 폴더는 삭제 가능')
  assert.deepEqual(planDelete(deck, 'portal'), { ok: true }, '일반 버튼')
  assert.deepEqual(planDelete(deck, 'ghost'), { ok: false, reason: 'not-found' })
}

// ── 16~19. 다른 폴더로 이동 ────────────────────────────────────────────────
{
  // 루트 버튼(검색, R) → 방과후: 첫 빈 슬롯 (0,2)
  const plan = planMoveToFolder(deck, 'search', 'after')
  assert.deepEqual(plan, { ok: true, position: { row: 0, col: 2 } })
  const moved = applyMoveToFolder(deck, 'search', 'after')!
  const s = moved.buttons.find((b) => b.id === 'search')!
  assert.equal(s.parentId, 'after')
  assert.deepEqual(s.position, { row: 0, col: 2 })
  assert.equal(s.hotkey, 'R', '실행키 유지')
  assert.deepEqual(s.action, { type: 'search', engine: 'c1', browser: 'default' }, '동작 유지')
  assert.deepEqual(s.icon, { kind: 'auto' })
  assert.equal(moved.buttons.length, deck.buttons.length)
  noDup(moved)
  assert.equal(findButtonAt(moved, { row: 0, col: 3 }), undefined, '루트 (0,3) 은 비었다')
  // 17. hotkey 충돌 차단: 루트 Q(업무포털) → 방과후 (Q=정산)
  const conflict = planMoveToFolder(deck, 'portal', 'after')
  assert.ok(!conflict.ok && conflict.reason === 'hotkey-conflict' && conflict.owner.id === 'settle')
  assert.match(describeMoveFailure(conflict as never), /settle.*Q/)
  assert.equal(applyMoveToFolder(deck, 'portal', 'after'), null)
  // 18. 꽉 찬 폴더 차단
  const fullDeck: Deck = { ...deck, layout: { columns: 2, rows: 2 } } // 방과후: (0,0)(0,1)(1,0)(1,1) 모두 참
  assert.equal(firstEmptySlot(fullDeck, 'after'), null)
  const full = planMoveToFolder(fullDeck, 'search', 'after')
  assert.deepEqual(full, { ok: false, reason: 'full' })
  assert.equal(describeMoveFailure(full as never), '이 폴더에 빈 슬롯이 없습니다.')
  // 같은 폴더 / cycle / 없는 대상
  assert.deepEqual(planMoveToFolder(deck, 'settle', 'after'), { ok: false, reason: 'same-folder' })
  assert.deepEqual(planMoveToFolder(deck, 'after', 'settle-folder'), { ok: false, reason: 'cycle' }, '폴더를 자손 안으로')
  assert.deepEqual(planMoveToFolder(deck, 'after', 'after'), { ok: false, reason: 'cycle' }, '자기 자신 안으로')
  assert.deepEqual(planMoveToFolder(deck, 'settle', 'portal'), { ok: false, reason: 'target-missing' }, '폴더가 아닌 버튼 안으로')
  // 폴더를 루트로 (자식은 따라온다 — parentId 가 폴더 id 라 변하지 않는다)
  const up = applyMoveToFolder(deck, 'settle-folder', null)!
  assert.equal(up.buttons.find((b) => b.id === 'settle-folder')!.parentId, null)
  assert.equal(up.buttons.find((b) => b.id === 'deep')!.parentId, 'settle-folder', '자식 관계 유지')
  assert.deepEqual(up.buttons.find((b) => b.id === 'settle-folder')!.position, { row: 1, col: 0 }, '루트 첫 빈 슬롯')
  // 편집기 경로: 위치를 바꿔 저장하면 첫 빈 슬롯 + 대상 폴더의 실행키 충돌 검사
  const d = draftFromButton(deck.buttons.find((b) => b.id === 'search')!, 'default', 'google')
  assert.deepEqual(validateDraft({ ...d, parentId: 'after' }, deck, 'search'), {})
  const saved = draftToButton({ ...d, parentId: 'after' }, { row: 0, col: 3 }, deck, 'search')
  assert.equal(saved.parentId, 'after')
  assert.deepEqual(saved.position, { row: 0, col: 2 })
  assert.equal(saved.id, 'search', 'id 유지')
  const dp = draftFromButton(deck.buttons.find((b) => b.id === 'portal')!, 'default', 'google')
  assert.match(validateDraft({ ...dp, parentId: 'after' }, deck, 'portal').hotkey!, /대상 폴더의 'settle'/)
  assert.equal(validateDraft({ ...dp, parentId: 'after' }, fullDeck, 'portal').location, '이 폴더에 빈 슬롯이 없습니다')
  const df = draftFromButton(deck.buttons.find((b) => b.id === 'after')!, 'default', 'google')
  assert.match(validateDraft({ ...df, parentId: 'settle-folder' }, deck, 'after').location!, /자기 자신/)
  assert.match(validateDraft({ ...df, actionType: 'website', website: { url: 'https://a.b', browser: 'default' } }, deck, 'after').actionType!, /다른 종류로/)
  // 편집 시 위치를 그대로 두면 position 도 그대로
  const same = draftToButton(d, { row: 0, col: 3 }, deck, 'search')
  assert.deepEqual(same.position, { row: 0, col: 3 })
  assert.equal(same.parentId, null)
}

// ── 20~21. P8 move / swap 은 같은 폴더 안에서만 ──────────────────────────
{
  // 방과후 안: 정산(0,0) → 빈 (0,2)
  const mv = applyDrop(deck, 'settle', { row: 0, col: 2 })!
  assert.deepEqual(mv.buttons.find((b) => b.id === 'settle')!.position, { row: 0, col: 2 })
  assert.deepEqual(mv.buttons.find((b) => b.id === 'portal')!.position, { row: 0, col: 0 }, '루트 (0,0) 업무포털은 무관')
  noDup(mv)
  // 방과후 안 swap: 정산(0,0) ↔ 출석부(0,1) — 루트의 (0,1) 학교종이는 건드리지 않는다
  assert.deepEqual(planDrop(deck, 'settle', { row: 0, col: 1 }), { kind: 'swap', target: { row: 0, col: 1 }, withId: 'attend' })
  const sw = applyDrop(deck, 'settle', { row: 0, col: 1 })!
  assert.deepEqual(sw.buttons.find((b) => b.id === 'settle')!.position, { row: 0, col: 1 })
  assert.deepEqual(sw.buttons.find((b) => b.id === 'attend')!.position, { row: 0, col: 0 })
  assert.deepEqual(sw.buttons.find((b) => b.id === 'paper')!.position, { row: 0, col: 1 }, '루트 학교종이 그대로')
  assert.equal(sw.buttons.find((b) => b.id === 'settle')!.parentId, 'after', 'parentId 유지')
  noDup(sw)
  // 루트에서 (0,0) 으로 drop 하면 루트의 업무포털과 교환 (방과후의 정산이 아니라)
  assert.deepEqual(planDrop(deck, 'paper', { row: 0, col: 0 }), { kind: 'swap', target: { row: 0, col: 0 }, withId: 'portal' })
  // 폴더 버튼도 같은 규칙으로 움직인다
  const fm = applyDrop(deck, 'after', { row: 1, col: 3 })!
  assert.deepEqual(fm.buttons.find((b) => b.id === 'after')!.position, { row: 1, col: 3 })
  assert.equal(fm.buttons.find((b) => b.id === 'settle')!.parentId, 'after', '자식은 따라온다')
  assert.equal(JSON.stringify(deck), snapshot, '원본 불변')
}

// ── 22. off-grid 컨테이너별 보존 ─────────────────────────────────────────
{
  assert.equal(hiddenCountIn(deck, 'after'), 1, '방과후의 격자 밖 1개(offgrid)')
  assert.equal(hiddenCountIn(deck, null), 0)
  assert.equal(hiddenButtons(deck).length, 1, '전체 집계(설정 화면)')
  const small: Deck = { ...deck, layout: { columns: 2, rows: 1 } }
  assert.deepEqual(ids(visibleButtons(small, null)), ['portal', 'paper'])
  assert.deepEqual(ids(visibleButtons(small, 'after')), ['settle', 'attend'])
  assert.equal(hiddenCountIn(small, 'after'), 3, 'paper2, settle-folder, offgrid')
  assert.equal(hiddenCountIn(small, null), 2, 'after, search')
  assert.equal(hiddenButtons(small).length, 5, '전체 집계: 루트 2 + 방과후 3 (정산폴더의 deep (0,0) 은 보임)')
  // 다시 넓히면 전부 복원, 다른 폴더와 섞이지 않음
  const restored: Deck = { ...small, layout: { columns: 8, rows: 6 } }
  assert.equal(hiddenButtons(restored).length, 0)
  assert.deepEqual(ids(visibleButtons(restored, 'after')), ['settle', 'attend', 'paper2', 'settle-folder', 'offgrid'])
  assert.equal(findButtonByCode(restored, 'KeyZ', 'after')!.id, 'offgrid', '복원되면 실행키도 살아난다')
  assert.equal(findButtonByCode(small, 'KeyE', null), undefined, '격자 밖으로 나간 폴더는 열 수 없다')
}

// ── 23~26. 직렬화/재시작: 폴더·parentId·IconRef·Action·id 보존 ────────────
{
  const file = { schemaVersion: 5, settings, decks: [deck], activeDeckId: 'd' }
  const m = migrate(JSON.parse(JSON.stringify(file)))!
  assert.equal(m.schemaVersion, 5)
  assert.deepEqual(m.decks[0]!.buttons, deck.buttons, 'v5 → v5 round-trip 은 완전히 같다')
  assert.deepEqual(JSON.parse(JSON.stringify(m)).decks[0].buttons, deck.buttons)
  assert.deepEqual(ids(folderPath(m.decks[0]!, 'settle-folder')), ['after', 'settle-folder'])
}

// ── 아이콘·등록 정보 ────────────────────────────────────────────────────
{
  assert.equal(autoBuiltinFor({ type: 'deck-folder' }), 'folder', 'QuickDeck 폴더 자동 아이콘 = 내장 folder')
  assert.deepEqual(resolveIcon({ icon: { kind: 'auto' }, action: { type: 'deck-folder' } }), { kind: 'builtin', name: 'folder' })
  assert.deepEqual(resolveIcon({ icon: { kind: 'builtin', name: 'color-coffee' }, action: { type: 'deck-folder' } }), { kind: 'builtin', name: 'color-coffee' })
  assert.equal(ACTION_DEFINITIONS['deck-folder'].label, 'QuickDeck 폴더')
  assert.equal(ACTION_DEFINITIONS.folder.label, 'Windows 폴더', 'Windows 폴더와 구분')
}

console.log('check-folders: ok')
