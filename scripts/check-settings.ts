// 저장 파일 마이그레이션(v1 → v2)과 검색엔진 입력 검증의 순수 로직 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-settings.ts
import assert from 'node:assert/strict'
import { SCHEMA_VERSION, clampLayout, createDefaultAppData, migrate } from '../src/model/appData.ts'
import { DEFAULT_HOTKEY, createDefaultSettings } from '../src/model/settings.ts'
import { buttonsUsingEngine, validateSearchEngineInput } from '../src/features/actions/search.ts'
import { hiddenButtons, visibleButtons } from '../src/model/deck.ts'

// ── v1 → v2 마이그레이션: 버튼은 그대로, window 는 정리, 새 필드는 기본값 ─────
{
  const v1 = {
    schemaVersion: 1,
    settings: {
      window: { rememberSize: true, rememberPosition: true, alwaysOnTop: true, autoStart: false, hideAfterRun: false, closeToTray: false, lastBounds: null },
      hotkey: { enabled: true, accelerator: 'Alt+Space' },
      defaultBrowser: 'edge',
      defaultSearchEngine: 'naver',
      customSearchEngines: [{ id: 'custom-1', name: 'YouTube', urlTemplate: 'https://www.youtube.com/results?search_query={query}' }],
      animationEnabled: false,
    },
    decks: [
      {
        id: 'd1',
        name: '기본 덱',
        layout: { columns: 4, rows: 3 },
        buttons: [
          { id: 'b1', position: { row: 0, col: 0 }, name: '네이버', action: { type: 'website', url: 'https://naver.com/', browser: 'default' }, icon: { kind: 'none' }, hotkey: '1', display: 'icon-text' },
          { id: 'b2', position: { row: 2, col: 3 }, name: '유튜브 검색', action: { type: 'search', engine: 'custom-1', browser: 'default' }, icon: { kind: 'none' }, hotkey: 'F', display: 'icon' },
        ],
      },
    ],
    activeDeckId: 'd1',
  }
  const m = migrate(structuredClone(v1))
  assert.ok(m, '마이그레이션 결과가 있어야 한다')
  assert.equal(m.schemaVersion, SCHEMA_VERSION)
  assert.equal(SCHEMA_VERSION, 4)
  // 버튼 데이터 보존 (v3 에서 아이콘 none → auto 로 옮겨지는 것 외에는 동일)
  assert.deepEqual(
    m.decks,
    v1.decks.map((d) => ({ ...d, buttons: d.buttons.map((b) => ({ ...b, icon: { kind: 'auto' } })) })),
  )
  assert.equal(m.decks[0]!.buttons[1]!.hotkey, 'F')
  assert.equal(m.decks[0]!.buttons[1]!.display, 'icon')
  assert.equal(m.activeDeckId, 'd1')
  // 기존 값 유지
  assert.equal(m.settings.window.alwaysOnTop, true)
  assert.equal(m.settings.window.hideAfterRun, false)
  assert.equal(m.settings.window.closeToTray, false)
  assert.equal(m.settings.hotkey.accelerator, 'Alt+Space')
  assert.equal(m.settings.defaultBrowser, 'edge')
  assert.equal(m.settings.customSearchEngines.length, 1)
  // 새 필드 기본값, 옛 필드 제거
  assert.equal(m.settings.window.showAt, 'cursor-monitor')
  assert.equal(m.settings.window.lastBounds, null)
  assert.ok(!('rememberSize' in m.settings.window), 'rememberSize 는 제거된다')
  assert.ok(!('rememberPosition' in m.settings.window))

  // v2 파일은 그대로 통과하고, 빠진 필드는 기본값으로 채운다
  const v2 = { ...structuredClone(v1), schemaVersion: 2, settings: { hotkey: { enabled: true, accelerator: '' } } }
  const m2 = migrate(v2)
  assert.ok(m2)
  assert.equal(m2.settings.hotkey.accelerator, DEFAULT_HOTKEY, '빈 단축키는 기본값으로')
  assert.equal(m2.settings.window.closeToTray, true)
  assert.deepEqual(m2.settings.customSearchEngines, [])

  // ── 기본 단축키: 신규 설치는 Ctrl+Shift+Space, 저장된 값은 절대 바꾸지 않는다 ──
  assert.equal(DEFAULT_HOTKEY, 'Ctrl+Shift+Space')
  assert.equal(createDefaultSettings().hotkey.accelerator, 'Ctrl+Shift+Space', '신규 설정 기본값')
  assert.equal(createDefaultAppData().settings.hotkey.accelerator, 'Ctrl+Shift+Space')
  // 기존 v2 사용자의 Ctrl+Space 보존
  const v2old = { ...structuredClone(v1), schemaVersion: 2, settings: { ...createDefaultSettings(), hotkey: { enabled: true, accelerator: 'Ctrl+Space' } } }
  assert.equal(migrate(v2old)!.settings.hotkey.accelerator, 'Ctrl+Space', '기존 사용자의 Ctrl+Space 는 유지된다')
  // 사용자 지정 단축키 보존 (v1 → v2 경로: 위에서 Alt+Space 확인, 여기서는 v2 → v2)
  const v2custom = { ...structuredClone(v1), schemaVersion: 2, settings: { ...createDefaultSettings(), hotkey: { enabled: false, accelerator: 'Ctrl+Alt+Q' } } }
  const mc = migrate(v2custom)!
  assert.equal(mc.settings.hotkey.accelerator, 'Ctrl+Alt+Q')
  assert.equal(mc.settings.hotkey.enabled, false, 'enabled 값도 유지된다')

  // 미래 버전·깨진 데이터는 null
  assert.equal(migrate({ ...v1, schemaVersion: 99 }), null)
  assert.equal(migrate({ schemaVersion: 2, decks: [] }), null)
  assert.equal(migrate('garbage'), null)
}

// ── 행/열 범위와 격자 밖 버튼 보존 ────────────────────────────────────────
{
  assert.deepEqual(clampLayout(4, 3), { columns: 4, rows: 3 })
  assert.deepEqual(clampLayout(0, 0), { columns: 2, rows: 1 })
  assert.deepEqual(clampLayout(99, 99), { columns: 10, rows: 6 })
  assert.deepEqual(clampLayout(Number.NaN, 2.6), { columns: 2, rows: 3 })

  const deck = {
    layout: { columns: 2, rows: 2 },
    buttons: [
      { id: 'in', position: { row: 1, col: 1 } },
      { id: 'out-col', position: { row: 0, col: 3 } },
      { id: 'out-row', position: { row: 2, col: 0 } },
    ],
  } as never
  assert.deepEqual(visibleButtons(deck).map((b) => b.id), ['in'])
  assert.deepEqual(hiddenButtons(deck).map((b) => b.id), ['out-col', 'out-row'])
  // 다시 늘리면 돌아온다
  const bigger = { ...(deck as object), layout: { columns: 4, rows: 3 } } as never
  assert.equal(hiddenButtons(bigger).length, 0)
}

// ── 사용자 지정 검색엔진 검증 ──────────────────────────────────────────
{
  const ok = validateSearchEngineInput(' YouTube ', 'https://www.youtube.com/results?search_query={query}')
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.name, 'YouTube')
    assert.equal(ok.urlTemplate, 'https://www.youtube.com/results?search_query={query}')
  }
  const noScheme = validateSearchEngineInput('X', 'duckduckgo.com/?q={query}')
  assert.ok(noScheme.ok && noScheme.urlTemplate === 'https://duckduckgo.com/?q={query}', '스킴이 없으면 https 를 붙인다')

  const noQuery = validateSearchEngineInput('X', 'https://example.com/search?q=')
  assert.ok(!noQuery.ok && noQuery.field === 'urlTemplate' && noQuery.reason.includes('{query}'))
  const badUrl = validateSearchEngineInput('X', 'not a url {query}')
  assert.ok(!badUrl.ok && badUrl.field === 'urlTemplate')
  const ftp = validateSearchEngineInput('X', 'ftp://x.com/{query}')
  assert.ok(!ftp.ok)
  const noName = validateSearchEngineInput('  ', 'https://a.com/{query}')
  assert.ok(!noName.ok && noName.field === 'name')

  const deck = {
    buttons: [
      { id: 'a', name: '유튜브 검색', action: { type: 'search', engine: 'custom-1', browser: 'default' } },
      { id: 'b', name: '구글', action: { type: 'search', engine: 'google', browser: 'default' } },
      { id: 'c', name: '사이트', action: { type: 'website', url: 'https://a.b', browser: 'default' } },
    ],
  } as never
  assert.deepEqual(buttonsUsingEngine(deck, 'custom-1').map((b) => b.name), ['유튜브 검색'])
  assert.equal(buttonsUsingEngine(deck, 'custom-2').length, 0)
}

console.log('check-settings: ok')
