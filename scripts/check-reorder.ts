// P8 버튼 드래그 배치의 순수 로직 검사: move/swap/none, 격자 밖 보존, 중복 위치 방지, 취소 불변, 직렬화, 슬롯 좌표 계산.
// 사용: node --experimental-strip-types --no-warnings scripts/check-reorder.ts
import assert from 'node:assert/strict'
import { DRAG_THRESHOLD_PX, applyDrop, exceedsDragThreshold, planDrop, slotAtPoint } from '../src/features/deck/reorder.ts'
import { hiddenButtons, visibleButtons, type Deck, type DeckButton } from '../src/model/deck.ts'
import { migrate } from '../src/model/appData.ts'

const mk = (id: string, row: number, col: number, extra: Partial<DeckButton> = {}): DeckButton => ({
  id,
  position: { row, col },
  name: id,
  action: { type: 'website', url: `https://${id}.example/`, browser: 'default' },
  icon: { kind: 'auto' },
  hotkey: null,
  display: 'icon-text',
  ...extra,
})

const deck: Deck = {
  id: 'd',
  name: '덱',
  layout: { columns: 4, rows: 3 },
  buttons: [
    mk('edge', 0, 0, { hotkey: 'Q', icon: { kind: 'builtin', name: 'browser' } }),
    mk('chrome', 0, 1, { hotkey: 'W', icon: { kind: 'image', file: 'custom/c_1.png' } }),
    mk('search', 2, 3, { hotkey: 'F', action: { type: 'search', engine: 'google', browser: 'default' } }),
    mk('offgrid', 5, 7, { hotkey: 'Z' }), // 격자를 줄여 보존된 버튼
  ],
}
const snapshot = JSON.stringify(deck)
const noDuplicates = (d: Deck) => {
  const keys = d.buttons.map((b) => `${b.position.row},${b.position.col}`)
  assert.equal(new Set(keys).size, keys.length, '같은 row/col 을 가진 버튼이 없어야 한다')
}

// ── 빈 슬롯으로 이동 ─────────────────────────────────────────────────────
{
  assert.deepEqual(planDrop(deck, 'edge', { row: 1, col: 2 }), { kind: 'move', target: { row: 1, col: 2 } })
  const next = applyDrop(deck, 'edge', { row: 1, col: 2 })!
  assert.ok(next)
  assert.deepEqual(next.buttons.find((b) => b.id === 'edge')!.position, { row: 1, col: 2 })
  assert.deepEqual(next.buttons.find((b) => b.id === 'chrome')!.position, { row: 0, col: 1 }, '다른 버튼은 그대로')
  assert.equal(next.buttons.length, deck.buttons.length)
  assert.deepEqual(next.buttons.map((b) => b.id), deck.buttons.map((b) => b.id), '배열 순서 유지')
  noDuplicates(next)
  assert.equal(JSON.stringify(deck), snapshot, '원본 덱은 바뀌지 않는다')
}

// ── 버튼끼리 교환 ────────────────────────────────────────────────────────
{
  assert.deepEqual(planDrop(deck, 'edge', { row: 0, col: 1 }), { kind: 'swap', target: { row: 0, col: 1 }, withId: 'chrome' })
  const next = applyDrop(deck, 'edge', { row: 0, col: 1 })!
  assert.deepEqual(next.buttons.find((b) => b.id === 'edge')!.position, { row: 0, col: 1 })
  assert.deepEqual(next.buttons.find((b) => b.id === 'chrome')!.position, { row: 0, col: 0 })
  noDuplicates(next)
  // 실행키·아이콘·동작·이름은 위치와 함께 움직이지 않고 버튼에 남는다
  const edge = next.buttons.find((b) => b.id === 'edge')!
  assert.equal(edge.hotkey, 'Q')
  assert.deepEqual(edge.icon, { kind: 'builtin', name: 'browser' })
  assert.equal(next.buttons.find((b) => b.id === 'chrome')!.hotkey, 'W')
  assert.deepEqual(next.buttons.find((b) => b.id === 'chrome')!.icon, { kind: 'image', file: 'custom/c_1.png' })
  // 검색 버튼도 똑같이 교환된다
  const s = applyDrop(deck, 'search', { row: 0, col: 0 })!
  assert.deepEqual(s.buttons.find((b) => b.id === 'search')!.position, { row: 0, col: 0 })
  assert.deepEqual(s.buttons.find((b) => b.id === 'edge')!.position, { row: 2, col: 3 })
  assert.equal(s.buttons.find((b) => b.id === 'search')!.action.type, 'search')
  noDuplicates(s)
}

// ── 같은 슬롯 / 유효하지 않은 대상 / 취소 → 변화 없음 ──────────────────────
{
  assert.deepEqual(planDrop(deck, 'edge', { row: 0, col: 0 }), { kind: 'none' })
  assert.equal(applyDrop(deck, 'edge', { row: 0, col: 0 }), null)
  assert.equal(applyDrop(deck, 'edge', null), null, '격자 밖 drop(취소)')
  assert.equal(applyDrop(deck, 'edge', { row: 3, col: 0 }), null, '행 범위 밖')
  assert.equal(applyDrop(deck, 'edge', { row: 0, col: 4 }), null, '열 범위 밖')
  assert.equal(applyDrop(deck, 'edge', { row: -1, col: 0 }), null)
  assert.equal(applyDrop(deck, 'edge', { row: 0.5, col: 1 }), null, '정수가 아닌 위치')
  assert.equal(applyDrop(deck, 'nope', { row: 1, col: 1 }), null, '없는 버튼')
  assert.equal(JSON.stringify(deck), snapshot, '취소·실패 시 데이터 불변')
}

// ── 격자 밖 버튼은 드래그 대상도, 교환 상대도 아니다 ─────────────────────
{
  assert.equal(applyDrop(deck, 'offgrid', { row: 1, col: 1 }), null, '격자 밖 버튼은 끌 수 없다')
  assert.equal(hiddenButtons(deck).length, 1)
  const next = applyDrop(deck, 'edge', { row: 1, col: 1 })!
  assert.deepEqual(next.buttons.find((b) => b.id === 'offgrid')!.position, { row: 5, col: 7 }, '격자 밖 버튼은 그대로 보존')
  assert.equal(hiddenButtons(next).length, 1)
  assert.equal(visibleButtons(next).length, 3)
  // 격자를 줄인 뒤 드래그해도, 다시 늘리면 보존된 버튼이 원래 자리로 돌아온다
  const small: Deck = { ...next, layout: { columns: 2, rows: 1 } }
  assert.equal(visibleButtons(small).length, 1, 'chrome(0,1) 만 보인다')
  assert.equal(applyDrop(small, 'edge', { row: 0, col: 0 }), null, '격자 밖으로 나간 버튼은 끌 수 없다')
  const moved = applyDrop(small, 'chrome', { row: 0, col: 0 })!
  const restored: Deck = { ...moved, layout: { columns: 8, rows: 6 } }
  assert.deepEqual(restored.buttons.find((b) => b.id === 'offgrid')!.position, { row: 5, col: 7 })
  assert.deepEqual(restored.buttons.find((b) => b.id === 'edge')!.position, { row: 1, col: 1 })
  assert.equal(visibleButtons(restored).length, 4)
  noDuplicates(restored)
}

// ── 연속 조작에서도 중복 위치가 생기지 않는다 (무작위 drop) ────────────────
{
  let d = deck
  let seed = 7
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  for (let i = 0; i < 500; i++) {
    const src = d.buttons[rnd(d.buttons.length)]!.id
    const target = rnd(10) === 0 ? null : { row: rnd(4) - 1, col: rnd(6) - 1 }
    const r = applyDrop(d, src, target)
    if (r) d = r
    noDuplicates(d)
    assert.equal(d.buttons.length, 4)
    assert.deepEqual(d.buttons.find((b) => b.id === 'offgrid')!.position, { row: 5, col: 7 })
  }
}

// ── 직렬화: 위치 변경 후 저장 → 마이그레이션 → 동일 ───────────────────────
{
  const next = applyDrop(deck, 'edge', { row: 0, col: 1 })!
  const file = {
    schemaVersion: 4,
    settings: { window: {}, hotkey: { enabled: true, accelerator: 'Ctrl+Shift+Space' }, defaultBrowser: 'default', defaultSearchEngine: 'google', customSearchEngines: [], appearance: { theme: 'system' } },
    decks: [next],
    activeDeckId: 'd',
  }
  const m = migrate(JSON.parse(JSON.stringify(file)))!
  assert.equal(m.schemaVersion, 4, '스키마 변경 없음')
  assert.deepEqual(m.decks[0]!.buttons.map((b) => [b.id, b.position.row, b.position.col, b.hotkey]), [
    ['edge', 0, 1, 'Q'],
    ['chrome', 0, 0, 'W'],
    ['search', 2, 3, 'F'],
    ['offgrid', 5, 7, 'Z'],
  ])
  assert.deepEqual(m.decks[0]!.buttons[1]!.icon, { kind: 'image', file: 'custom/c_1.png' }, 'IconRef 보존')
}

// ── 슬롯 좌표 계산 ────────────────────────────────────────────────────────
{
  const g = { left: 100, top: 50, cell: 80, gap: 8 }
  const layout = { columns: 4, rows: 3 }
  assert.deepEqual(slotAtPoint(g, layout, 100, 50), { row: 0, col: 0 })
  assert.deepEqual(slotAtPoint(g, layout, 179, 129), { row: 0, col: 0 }, '셀 오른쪽 아래 끝')
  assert.deepEqual(slotAtPoint(g, layout, 188, 50), { row: 0, col: 1 }, '두 번째 셀 시작')
  assert.deepEqual(slotAtPoint(g, layout, 183, 50), { row: 0, col: 0 }, '간격 앞 절반은 앞 셀')
  assert.deepEqual(slotAtPoint(g, layout, 185, 50), { row: 0, col: 1 }, '간격 뒤 절반은 뒤 셀')
  assert.deepEqual(slotAtPoint(g, layout, 100 + 3 * 88 + 79, 50 + 2 * 88 + 79), { row: 2, col: 3 }, '마지막 셀')
  assert.equal(slotAtPoint(g, layout, 100 + 4 * 88, 50), null, '오른쪽 밖')
  assert.equal(slotAtPoint(g, layout, 90, 50), null, '왼쪽 밖 (허용 오차 밖)')
  assert.deepEqual(slotAtPoint(g, layout, 97, 47), { row: 0, col: 0 }, '허용 오차(간격 절반) 안')
  assert.equal(slotAtPoint(g, layout, 100, 50 + 3 * 88 + 10), null, '아래 밖')
  assert.equal(slotAtPoint({ ...g, cell: 0, gap: 0 }, layout, 100, 50), null, '치수 없음')
  assert.deepEqual(slotAtPoint({ ...g, gap: 0 }, layout, 100 + 80, 50), { row: 0, col: 1 }, '간격 0')
}

// ── 드래그 시작 임계값 ────────────────────────────────────────────────────
{
  assert.equal(DRAG_THRESHOLD_PX, 8)
  assert.equal(exceedsDragThreshold(10, 10, 10, 10), false)
  assert.equal(exceedsDragThreshold(10, 10, 15, 14), false, '약 6.4px — 클릭 흔들림')
  assert.equal(exceedsDragThreshold(10, 10, 18, 10), true, '정확히 8px')
  assert.equal(exceedsDragThreshold(10, 10, 4, 4), true, '대각선 약 8.5px')
  assert.equal(exceedsDragThreshold(0, 0, 3, 3, 5), false)
}

console.log('check-reorder: ok')
