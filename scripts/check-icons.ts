// 아이콘 시스템의 순수 로직 검사: v2 → v3 마이그레이션, 관리 id, 해석(resolve), 자동 매핑, 참조 수집,
// P8 컬러 팩(이름 유일성·분류·별칭 검색·자산 파일 존재·안전성).
// 사용: node --experimental-strip-types --no-warnings scripts/check-icons.ts
import assert from 'node:assert/strict'
import { SCHEMA_VERSION, migrate, migrateDeckV2toV3, normalizeIcon } from '../src/model/appData.ts'
import { DEFAULT_ICON } from '../src/model/deck.ts'
import { isManagedIconId, managedIconUrl } from '../src/features/icons/managed.ts'
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_ICON_LABELS, BUILTIN_ICON_NAMES, COLOR_ICON_NAMES, COLOR_ICON_PREFIX, isBuiltinIconName } from '../src/features/icons/builtinNames.ts'
import { ICON_ALIASES, ICON_CATALOG, ICON_CATEGORIES, ICON_CATEGORY, ICON_CATEGORY_LABELS, searchIcons } from '../src/features/icons/catalog.ts'
import { SYSTEM_ICON, autoBuiltinFor, autoShellSource, collectIconReferences, fileTypeIcon, resolveIcon } from '../src/features/icons/auto.ts'

const btn = (icon: unknown, action: object, extra: object = {}) => ({ id: 'x', name: 'n', position: { row: 0, col: 0 }, hotkey: null, display: 'icon-text', icon, action, ...extra }) as never

// ── 관리 id ─────────────────────────────────────────────────────────────
{
  assert.equal(isManagedIconId('extracted/e_0123456789abcdef.png'), true)
  assert.equal(isManagedIconId('custom/c_7f3a2b1c9d.png'), true)
  assert.equal(isManagedIconId('custom/../quickdeck.json'), false)
  assert.equal(isManagedIconId('custom/..png'), false, '.. 포함 금지')
  assert.equal(isManagedIconId('other/x.png'), false)
  assert.equal(isManagedIconId('custom/x.jpg'), false)
  assert.equal(isManagedIconId('custom/a b.png'), false)
  assert.equal(isManagedIconId('custom\\x.png'), false)
  assert.equal(isManagedIconId('C:/custom/x.png'), false)
  assert.equal(isManagedIconId(''), false)
  assert.equal(managedIconUrl('custom/c_1.png'), 'http://qdicon.localhost/custom/c_1.png')
}

// ── 내장 이름 ───────────────────────────────────────────────────────────
{
  assert.ok(BUILTIN_ICON_NAMES.length >= 30, '내장 아이콘 30개 이상')
  for (const n of ['web', 'browser', 'program', 'file', 'folder', 'search', 'settings', 'volume-up', 'volume-down', 'mute', 'play', 'pause', 'previous', 'next', 'lock', 'explorer', 'task-manager', 'screenshot', 'sleep', 'logout', 'restart', 'shutdown', 'plus', 'terminal', 'document', 'spreadsheet', 'image', 'video', 'music', 'mail', 'calendar', 'star', 'home'])
    assert.ok(isBuiltinIconName(n), `요구된 내장 아이콘 ${n}`)
  assert.equal(isBuiltinIconName('not-an-icon'), false)
  // 시스템 기능 15종 모두 내장 아이콘에 대응
  for (const [cmd, icon] of Object.entries(SYSTEM_ICON)) assert.ok(isBuiltinIconName(icon), `${cmd} → ${icon}`)
  assert.equal(Object.keys(SYSTEM_ICON).length, 15)
}

// ── 자동 매핑 ───────────────────────────────────────────────────────────
{
  assert.equal(autoBuiltinFor({ type: 'website', url: 'https://a.b', browser: 'default' }), 'web')
  assert.equal(autoBuiltinFor({ type: 'search', engine: 'google', browser: 'default' }), 'search')
  assert.equal(autoBuiltinFor({ type: 'folder', path: 'C:\\x' }), 'folder')
  assert.equal(autoBuiltinFor({ type: 'program', path: 'C:\\x.exe' }), 'program')
  assert.equal(autoBuiltinFor({ type: 'system', command: 'shutdown' }), 'shutdown')
  assert.equal(autoBuiltinFor({ type: 'system', command: 'play-pause' }), 'play-pause')
  assert.equal(autoBuiltinFor({ type: 'file', path: 'C:\\문서\\보고서.xlsx' }), 'spreadsheet')
  assert.equal(fileTypeIcon('C:\\a\\b.HWPX'), 'document', '대소문자 무시')
  assert.equal(fileTypeIcon('C:\\a\\b.pdf'), 'pdf')
  assert.equal(fileTypeIcon('C:\\a\\b.pptx'), 'presentation')
  assert.equal(fileTypeIcon('C:\\a\\b.mp4'), 'video')
  assert.equal(fileTypeIcon('C:\\a\\b.zip'), 'archive')
  assert.equal(fileTypeIcon('C:\\a\\noext'), 'file')
  assert.equal(fileTypeIcon('C:\\a.b\\noext'), 'file', '폴더 이름의 점은 확장자가 아니다')
  assert.equal(fileTypeIcon('.gitignore'), 'file')

  assert.equal(autoShellSource(btn({ kind: 'auto' }, { type: 'program', path: 'C:\\x.exe' })), 'C:\\x.exe')
  assert.equal(autoShellSource(btn({ kind: 'auto' }, { type: 'file', path: 'C:\\x.txt' })), 'C:\\x.txt')
  assert.equal(autoShellSource(btn({ kind: 'auto' }, { type: 'folder', path: 'C:\\x' })), null, '폴더는 내장 아이콘')
  assert.equal(autoShellSource(btn({ kind: 'auto' }, { type: 'website', url: 'https://a.b', browser: 'default' })), null)
  assert.equal(autoShellSource(btn({ kind: 'builtin', name: 'star' }, { type: 'program', path: 'C:\\x.exe' })), null, '자동이 아니면 추출하지 않는다')
  assert.equal(autoShellSource(btn({ kind: 'auto' }, { type: 'program', path: '' })), null, '경로가 비면 추출하지 않는다')
}

// ── 해석 ────────────────────────────────────────────────────────────────
{
  const web = { type: 'website', url: 'https://a.b', browser: 'default' }
  const prog = { type: 'program', path: 'C:\\x.exe' }
  assert.deepEqual(resolveIcon(btn({ kind: 'none' }, web)), { kind: 'none' })
  assert.deepEqual(resolveIcon(btn({ kind: 'builtin', name: 'star' }, web)), { kind: 'builtin', name: 'star' })
  assert.deepEqual(resolveIcon(btn({ kind: 'builtin', name: 'zzz-unknown' }, web)), { kind: 'builtin', name: 'web' }, '모르는 내장 이름은 동작 기본으로')
  assert.deepEqual(resolveIcon(btn({ kind: 'image', file: 'custom/c_1.png' }, web)), { kind: 'managed', file: 'custom/c_1.png', fallback: 'web' })
  assert.deepEqual(resolveIcon(btn({ kind: 'image', file: '../evil.png' }, web)), { kind: 'builtin', name: 'web' }, '이상한 id 는 폴백')
  assert.deepEqual(resolveIcon(btn({ kind: 'extracted', file: 'extracted/e_1.png' }, prog)), { kind: 'managed', file: 'extracted/e_1.png', fallback: 'program' })
  // auto: 추출 전/실패 → 기본, 추출 후 → 관리 파일 + 폴백
  assert.deepEqual(resolveIcon(btn({ kind: 'auto' }, prog), null), { kind: 'builtin', name: 'program' })
  assert.deepEqual(resolveIcon(btn({ kind: 'auto' }, prog), 'extracted/e_1.png'), { kind: 'managed', file: 'extracted/e_1.png', fallback: 'program' })
  assert.deepEqual(resolveIcon(btn({ kind: 'auto' }, { type: 'file', path: 'C:\\x.pdf' }), null), { kind: 'builtin', name: 'pdf' })
  assert.deepEqual(resolveIcon(btn({ kind: 'auto' }, { type: 'folder', path: 'C:\\x' }), 'extracted/e_1.png'), { kind: 'builtin', name: 'folder' }, '폴더는 추출 결과가 있어도 내장 폴더 아이콘')
  assert.deepEqual(resolveIcon(btn({ kind: 'auto' }, { type: 'system', command: 'mute' })), { kind: 'builtin', name: 'mute' })
}

// ── 참조 수집 (공유 참조는 한 번만) ────────────────────────────────────
{
  const decks = [
    {
      buttons: [
        btn({ kind: 'image', file: 'custom/c_1.png' }, { type: 'website', url: 'https://a', browser: 'default' }),
        btn({ kind: 'image', file: 'custom/c_1.png' }, { type: 'website', url: 'https://b', browser: 'default' }),
        btn({ kind: 'extracted', file: 'extracted/e_9.png' }, { type: 'program', path: 'C:\\p.exe' }),
        btn({ kind: 'auto' }, { type: 'program', path: 'C:\\notepad.exe' }),
        btn({ kind: 'auto' }, { type: 'program', path: 'C:\\notepad.exe' }),
        btn({ kind: 'auto' }, { type: 'file', path: 'C:\\a.xlsx' }),
        btn({ kind: 'auto' }, { type: 'folder', path: 'C:\\f' }),
        btn({ kind: 'builtin', name: 'star' }, { type: 'website', url: 'https://c', browser: 'default' }),
        btn({ kind: 'image', file: 'bad/../x.png' }, { type: 'website', url: 'https://d', browser: 'default' }),
      ],
    },
  ]
  const refs = collectIconReferences(decks as never)
  assert.deepEqual(refs.files, ['custom/c_1.png', 'extracted/e_9.png'])
  assert.deepEqual(refs.paths, ['C:\\notepad.exe', 'C:\\a.xlsx'])
}

// ── v2 → v3 마이그레이션 ────────────────────────────────────────────────
{
  assert.equal(SCHEMA_VERSION, 4)
  const deckV2 = {
    id: 'd',
    name: '덱',
    layout: { columns: 4, rows: 3 },
    buttons: [
      btn({ kind: 'none' }, { type: 'website', url: 'https://a', browser: 'default' }, { id: 'a', hotkey: '1', position: { row: 0, col: 0 } }),
      btn({ kind: 'builtin', name: 'star' }, { type: 'website', url: 'https://b', browser: 'default' }, { id: 'b', hotkey: 'Q', position: { row: 1, col: 0 } }),
    ],
  }
  const m3 = migrateDeckV2toV3(deckV2 as never)
  assert.deepEqual(m3.buttons[0]!.icon, DEFAULT_ICON, 'v2 의 none 은 auto 로')
  assert.deepEqual(m3.buttons[1]!.icon, { kind: 'builtin', name: 'star' }, '다른 종류는 그대로')
  assert.equal(m3.buttons[0]!.hotkey, '1')
  assert.deepEqual(m3.buttons[0]!.position, { row: 0, col: 0 })

  const fileV2 = {
    schemaVersion: 2,
    settings: { hotkey: { enabled: true, accelerator: 'Ctrl+Space' }, window: { alwaysOnTop: true, closeToTray: false, hideAfterRun: true, autoStart: false, showAt: 'last-position', lastBounds: { x: 1, y: 2, width: 3, height: 4 } } },
    decks: [deckV2],
    activeDeckId: 'd',
  }
  const m = migrate(structuredClone(fileV2))!
  assert.ok(m)
  assert.equal(m.schemaVersion, SCHEMA_VERSION)
  assert.equal(m.decks[0]!.buttons.length, 2, '버튼 개수 보존')
  assert.deepEqual(m.decks[0]!.buttons[0]!.icon, { kind: 'auto' })
  assert.equal(m.decks[0]!.buttons[0]!.name, 'n')
  assert.equal(m.settings.hotkey.accelerator, 'Ctrl+Space', '설정 보존')
  assert.equal(m.settings.window.alwaysOnTop, true)
  assert.deepEqual(m.settings.window.lastBounds, { x: 1, y: 2, width: 3, height: 4 })
  assert.equal(m.activeDeckId, 'd')

  // v3 파일에서 none 은 진짜 없음이라 유지된다
  const fileV3 = { ...structuredClone(fileV2), schemaVersion: 3 }
  const m3b = migrate(fileV3)!
  assert.deepEqual(m3b.decks[0]!.buttons[0]!.icon, { kind: 'none' }, 'v3 의 none 은 유지')

  // 깨진 아이콘 필드는 auto 로 (버튼은 유지)
  assert.deepEqual(normalizeIcon(undefined), { kind: 'auto' })
  assert.deepEqual(normalizeIcon({ kind: 'image' }), { kind: 'auto' }, 'file 없는 image')
  assert.deepEqual(normalizeIcon({ kind: 'builtin', name: '' }), { kind: 'auto' })
  assert.deepEqual(normalizeIcon({ kind: 'weird' }), { kind: 'auto' })
  assert.deepEqual(normalizeIcon({ kind: 'extracted', file: 'extracted/e_1.png' }), { kind: 'extracted', file: 'extracted/e_1.png' })
  const broken = { ...structuredClone(fileV3) }
  ;(broken.decks[0] as { buttons: Array<{ icon: unknown }> }).buttons[1]!.icon = 'garbage'
  const mb = migrate(broken)!
  assert.equal(mb.decks[0]!.buttons.length, 2)
  assert.deepEqual(mb.decks[0]!.buttons[1]!.icon, { kind: 'auto' })
}

// ── P8: 내장 이름 유일성·컬러 팩 자산·분류·검색 ─────────────────────────
{
  const names = BUILTIN_ICON_NAMES
  assert.equal(new Set(names).size, names.length, '이름 중복 없음')
  for (const n of names) assert.match(n, /^[a-z0-9-]+$/, `이름 형식 ${n}`)
  assert.equal(names.length, 70 + 43, 'Lucide 70 + 컬러 43')
  assert.equal(COLOR_ICON_NAMES.length, 43)
  for (const n of COLOR_ICON_NAMES) assert.ok(n.startsWith(COLOR_ICON_PREFIX) && isBuiltinIconName(n))

  // 자산 파일: 이름마다 정확히 한 파일, 파일마다 정확히 한 이름 (고아 자산·깨진 참조 없음)
  const dir = path.resolve(import.meta.dirname, '../src/assets/icons/color')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))
  assert.deepEqual([...files].sort(), COLOR_ICON_NAMES.map((n) => `${n}.svg`).sort(), '자산 파일 ↔ 이름 1:1')
  for (const f of files) {
    const svg = fs.readFileSync(path.join(dir, f), 'utf8')
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'), `정리된 헤더 ${f}`)
    assert.ok(svg.trimEnd().endsWith('</svg>'), `닫힘 ${f}`)
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|<style|<filter|href=|url\(|<!--|<\?xml/i, `안전하지 않은 내용 없음 ${f}`)
    assert.doesNotMatch(svg, /#(333333|45484c|2f2f33|303033|ffffff)/i, `고정 회색·흰색 없음(테마 추종) ${f}`)
    assert.match(svg, /fill="currentColor"/, `윤곽은 currentColor ${f}`)
    assert.ok(Buffer.byteLength(svg) < 5000, `파일 크기 ${f}`)
  }
  // 라벨: 컬러 팩은 "(컬러)" 로 구분되어 같은 이름의 선 아이콘과 헷갈리지 않는다
  for (const n of COLOR_ICON_NAMES) assert.ok(BUILTIN_ICON_LABELS[n].endsWith('(컬러)'), `라벨 ${n}`)
  // 깨진 참조: 없는 컬러 이름은 내장 이름이 아니므로 동작 기본 아이콘으로 해석된다
  assert.equal(isBuiltinIconName('color-nope'), false)
  assert.deepEqual(resolveIcon(btn({ kind: 'builtin', name: 'color-nope' }, { type: 'folder', path: 'C:/x' })), { kind: 'builtin', name: 'folder' })
  assert.deepEqual(resolveIcon(btn({ kind: 'builtin', name: 'color-coffee' }, { type: 'folder', path: 'C:/x' })), { kind: 'builtin', name: 'color-coffee' })

  // 분류: 모든 이름에 분류가 있고 분류 값은 정의된 것
  for (const n of names) assert.ok(ICON_CATEGORY[n] in ICON_CATEGORY_LABELS && ICON_CATEGORY[n] !== 'all', `분류 ${n}`)
  assert.equal(Object.keys(ICON_CATEGORY).length, names.length, '분류에 남는 이름 없음')
  assert.equal(ICON_CATALOG.length, names.length)
  assert.equal(ICON_CATEGORIES[0], 'all')
  for (const k of Object.keys(ICON_ALIASES)) assert.ok(isBuiltinIconName(k), `별칭의 이름 ${k}`)

  // 검색: 한국어·영어·별칭·대소문자, 분류 필터, 빈 결과
  const has = (q: string, n: string, c?: never) => searchIcons(q, c).some((e) => e.name === n)
  assert.ok(has('폴더', 'folder') && has('folder', 'folder') && has('FOLDER', 'folder') && has('Folder ', 'folder'))
  assert.ok(has('커피', 'color-coffee') && has('coffee', 'color-coffee') && has('카페', 'color-coffee'))
  assert.ok(has('달력', 'calendar') && has('달력', 'color-calendar'), '같은 뜻의 선·컬러가 함께 나온다')
  assert.ok(has('메모', 'color-record') && has('메모', 'pen'))
  assert.ok(has('컬러', 'color-gift') && !has('컬러', 'star'), '"(컬러)" 라벨로 팩만 거를 수 있다')
  assert.ok(has('생활 커피', 'color-coffee'), '여러 단어는 모두 포함해야 한다')
  assert.equal(searchIcons('zzzz-no-such-icon').length, 0)
  assert.equal(searchIcons('').length, names.length, '빈 검색은 전체')
  assert.ok(searchIcons('', 'life').every((e) => e.category === 'life') && searchIcons('', 'life').length > 0)
  assert.equal(searchIcons('폴더', 'life').length, 0, '분류 밖이면 안 나온다')

  // 직렬화: 컬러 내장 아이콘을 가진 v4 파일은 그대로 유지된다
  const v4 = {
    schemaVersion: 4,
    settings: { window: {}, hotkey: { enabled: true, accelerator: 'Ctrl+Shift+Space' }, defaultBrowser: 'default', defaultSearchEngine: 'google', customSearchEngines: [], appearance: { theme: 'dark' } },
    decks: [{ id: 'd', name: 'n', layout: { columns: 4, rows: 3 }, buttons: [btn({ kind: 'builtin', name: 'color-coffee' }, { type: 'folder', path: 'C:/x' }, { hotkey: 'Q' })] }],
    activeDeckId: 'd',
  }
  const m4 = migrate(JSON.parse(JSON.stringify(v4)))!
  assert.deepEqual(m4.decks[0]!.buttons[0]!.icon, { kind: 'builtin', name: 'color-coffee' })
  assert.equal(m4.decks[0]!.buttons[0]!.hotkey, 'Q')
  assert.deepEqual(JSON.parse(JSON.stringify(m4)).decks[0].buttons[0].icon, { kind: 'builtin', name: 'color-coffee' })
}

console.log('check-icons: ok')
