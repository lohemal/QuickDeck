// 테마 모델의 순수 로직과 v3 → v4 마이그레이션 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-theme.ts
import assert from 'node:assert/strict'
import { DEFAULT_THEME_MODE, THEME_LABELS, THEME_MODES, isThemeMode, normalizeThemeMode, resolveTheme } from '../src/features/theme/theme.ts'
import { SCHEMA_VERSION, createDefaultAppData, migrate } from '../src/model/appData.ts'
import { createDefaultSettings } from '../src/model/settings.ts'

// ── 모드·해석 ───────────────────────────────────────────────────────────
{
  assert.deepEqual([...THEME_MODES], ['system', 'light', 'dark'])
  assert.equal(DEFAULT_THEME_MODE, 'system')
  for (const m of THEME_MODES) assert.ok(THEME_LABELS[m], `라벨 ${m}`)

  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('System'), false, '대소문자 구분')
  assert.equal(isThemeMode(''), false)
  assert.equal(isThemeMode(undefined), false)

  assert.equal(normalizeThemeMode('dark'), 'dark')
  assert.equal(normalizeThemeMode('blue'), 'system', '모르는 값은 system')
  assert.equal(normalizeThemeMode(null), 'system')
  assert.equal(normalizeThemeMode(42), 'system')

  assert.equal(resolveTheme('light', true), 'light', '명시 선택은 OS 를 무시')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
}

// ── 기본값과 마이그레이션 ─────────────────────────────────────────────────
{
  assert.equal(SCHEMA_VERSION, 5)
  assert.equal(createDefaultSettings().appearance.theme, 'system')
  assert.equal(createDefaultAppData().settings.appearance.theme, 'system')

  const buttons = [
    { id: 'a', position: { row: 0, col: 1 }, name: '네이버', action: { type: 'website', url: 'https://naver.com/', browser: 'edge' }, icon: { kind: 'auto' }, hotkey: '2', display: 'icon-text' },
    { id: 'b', position: { row: 2, col: 3 }, name: '메모장', action: { type: 'program', path: 'C:\\Windows\\System32\\notepad.exe' }, icon: { kind: 'image', file: 'custom/c_1.png' }, hotkey: 'F', display: 'icon' },
  ]
  const settingsV3 = {
    window: { alwaysOnTop: true, autoStart: false, hideAfterRun: false, closeToTray: true, showAt: 'last-position', lastBounds: { x: 10, y: 20, width: 700, height: 500 } },
    hotkey: { enabled: true, accelerator: 'Ctrl+Alt+Q' },
    defaultBrowser: 'edge',
    defaultSearchEngine: 'naver',
    customSearchEngines: [{ id: 'custom-1', name: 'YouTube', urlTemplate: 'https://www.youtube.com/results?search_query={query}' }],
    animationEnabled: false,
  }
  const v3 = { schemaVersion: 3, settings: settingsV3, decks: [{ id: 'd', name: '덱', layout: { columns: 5, rows: 4 }, buttons }], activeDeckId: 'd' }

  // v3 → v4: appearance 만 추가되고 나머지는 그대로
  const m = migrate(structuredClone(v3))!
  assert.ok(m)
  assert.equal(m.schemaVersion, 5)
  assert.deepEqual(m.settings.appearance, { theme: 'system' }, 'v3 사용자는 theme=system 으로 시작')
  assert.deepEqual(m.decks[0]!.buttons, buttons.map((b) => ({ ...b, parentId: null })), '버튼·위치·실행키·IconRef 보존 (v5: 모두 루트)')
  assert.deepEqual(m.decks[0]!.layout, { columns: 5, rows: 4 })
  assert.equal(m.settings.hotkey.accelerator, 'Ctrl+Alt+Q', '전역 단축키 보존')
  assert.deepEqual(m.settings.customSearchEngines, settingsV3.customSearchEngines, '검색엔진 보존')
  assert.deepEqual(m.settings.window, settingsV3.window, '창 설정 보존')
  assert.equal(m.settings.defaultBrowser, 'edge')

  // v4 저장 → 다시 읽기 → 동일 (재시작 동등)
  const again = migrate(structuredClone(m))!
  assert.deepEqual(again, m)

  // v4 에서 이상한 theme 는 system 으로, 명시 선택은 유지
  const bad = { ...structuredClone(m), settings: { ...m.settings, appearance: { theme: 'neon' } } }
  assert.equal(migrate(bad)!.settings.appearance.theme, 'system')
  const dark = { ...structuredClone(m), settings: { ...m.settings, appearance: { theme: 'dark' } } }
  assert.equal(migrate(dark)!.settings.appearance.theme, 'dark')
  const noAppearance = { ...structuredClone(m), settings: { ...m.settings, appearance: undefined } }
  assert.equal(migrate(noAppearance)!.settings.appearance.theme, 'system')

  // v1 / v2 → v4 도 theme=system, 데이터 보존
  const v2 = { schemaVersion: 2, settings: { ...settingsV3 }, decks: [{ id: 'd', name: '덱', layout: { columns: 4, rows: 3 }, buttons: [{ ...buttons[0], icon: { kind: 'none' } }] }], activeDeckId: 'd' }
  const m2 = migrate(structuredClone(v2))!
  assert.equal(m2.schemaVersion, 5)
  assert.equal(m2.settings.appearance.theme, 'system')
  assert.deepEqual(m2.decks[0]!.buttons[0]!.icon, { kind: 'auto' }, 'v2 none → auto 도 그대로 적용')
  assert.equal(m2.decks[0]!.buttons[0]!.hotkey, '2')
  const v1 = { schemaVersion: 1, settings: { window: { rememberSize: true, rememberPosition: true, alwaysOnTop: false, autoStart: true, hideAfterRun: true, closeToTray: true, lastBounds: null }, hotkey: { enabled: true, accelerator: 'Ctrl+Space' } }, decks: v2.decks, activeDeckId: 'd' }
  const m1 = migrate(structuredClone(v1))!
  assert.equal(m1.schemaVersion, 5)
  assert.equal(m1.settings.appearance.theme, 'system')
  assert.equal(m1.settings.window.autoStart, true)
  assert.equal(m1.settings.hotkey.accelerator, 'Ctrl+Space', 'v1 사용자의 단축키 보존')
  assert.equal(m1.decks[0]!.buttons.length, 1)
}

console.log('check-theme: ok')
