// 검색 URL 생성·팝오버 위치·실행키 가드의 순수 로직 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-search.ts
import assert from 'node:assert/strict'
import { PRESET_SEARCH_ENGINES, buildSearchUrl } from '../src/features/actions/search.ts'
import { computePopoverPosition, computePopoverWidth } from '../src/features/search/position.ts'
import { isEditableElement, shouldHandleDeckHotkey } from '../src/features/hotkeys/guard.ts'

// ── 검색 URL ────────────────────────────────────────────────────────────
{
  const q = '방과후학교 3학년 지원금'
  const enc = encodeURIComponent(q)
  assert.equal(buildSearchUrl(PRESET_SEARCH_ENGINES.google, q), `https://www.google.com/search?q=${enc}`)
  assert.equal(buildSearchUrl(PRESET_SEARCH_ENGINES.naver, q), `https://search.naver.com/search.naver?query=${enc}`)
  assert.equal(buildSearchUrl(PRESET_SEARCH_ENGINES.bing, q), `https://www.bing.com/search?q=${enc}`)
  // 디코딩하면 원문이 그대로 나와야 한다 (한글·공백 보존)
  assert.equal(decodeURIComponent(new URL(buildSearchUrl(PRESET_SEARCH_ENGINES.google, q)).searchParams.get('q')!), q)

  const special = 'C++ & Rust? #tag 100% "quote" a/b'
  const url = new URL(buildSearchUrl(PRESET_SEARCH_ENGINES.google, special))
  assert.equal(url.searchParams.get('q'), special)
  assert.ok(!buildSearchUrl(PRESET_SEARCH_ENGINES.google, special).includes(' '), '공백이 남아 있으면 안 된다')
  assert.ok(!buildSearchUrl(PRESET_SEARCH_ENGINES.google, special).includes('#'), '# 는 fragment 가 되므로 인코딩되어야 한다')

  // 사용자 지정 엔진 템플릿도 같은 함수로 처리된다
  assert.equal(buildSearchUrl({ id: 'x', name: 'X', urlTemplate: 'https://x.test/s?k={query}&l=ko' }, 'a b'), 'https://x.test/s?k=a%20b&l=ko')
}

// ── 팝오버 위치 ─────────────────────────────────────────────────────────
{
  const vp = { width: 640, height: 480 }
  const pop = { width: 220, height: 40 }
  // 맨 위 행: 아래에 붙는다
  let p = computePopoverPosition({ left: 100, top: 10, width: 120, height: 120 }, pop, vp)
  assert.equal(p.placement, 'below')
  assert.equal(p.top, 10 + 120 + 6)
  assert.equal(p.left, 100)
  // 맨 아래 행: 아래 공간 부족 → 위로
  p = computePopoverPosition({ left: 100, top: 350, width: 120, height: 120 }, pop, vp)
  assert.equal(p.placement, 'above')
  assert.equal(p.top, 350 - 6 - 40)
  // 오른쭉 끝: 창 안으로 밀린다
  p = computePopoverPosition({ left: 560, top: 10, width: 70, height: 70 }, pop, vp)
  assert.equal(p.left, 640 - 220 - 6)
  // 왼쪽 끝(음수 좌표라도): margin 이상
  p = computePopoverPosition({ left: -5, top: 10, width: 70, height: 70 }, pop, vp)
  assert.equal(p.left, 6)
  // 위·아래 모두 부족한 아주 낮은 창: 더 넓은 쪽에 두고 창 안으로 clamp
  const tiny = { width: 200, height: 100 }
  p = computePopoverPosition({ left: 10, top: 40, width: 40, height: 40 }, { width: 180, height: 40 }, tiny)
  assert.ok(p.top >= 6 && p.top + 40 <= 100 - 6, `top=${p.top} 이 창 안이어야 한다`)
  // 너비: 버튼보다 좁아지지 않고, 최소 220, 창 너비 초과 금지
  assert.equal(computePopoverWidth(120, 640), 220)
  assert.equal(computePopoverWidth(300, 640), 300)
  assert.equal(computePopoverWidth(120, 200), 200 - 12)
}

// ── 실행키 가드 ─────────────────────────────────────────────────────────
{
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, getAttribute: () => null, ...extra })
  assert.equal(isEditableElement(el('INPUT')), true)
  assert.equal(isEditableElement(el('INPUT', { type: 'search' })), true)
  assert.equal(isEditableElement(el('INPUT', { type: 'number' })), true)
  assert.equal(isEditableElement(el('INPUT', { type: 'button' })), false)
  assert.equal(isEditableElement(el('INPUT', { type: 'checkbox' })), false)
  assert.equal(isEditableElement(el('TEXTAREA')), true)
  assert.equal(isEditableElement(el('SELECT')), true)
  assert.equal(isEditableElement(el('DIV', { isContentEditable: true })), true)
  assert.equal(isEditableElement({ tagName: 'DIV', getAttribute: (n: string) => (n === 'role' ? 'textbox' : null) }), true)
  assert.equal(isEditableElement(el('BUTTON')), false)
  assert.equal(isEditableElement(null), false)

  const base = { key: 'Q', ctrlKey: false, altKey: false, metaKey: false }
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('BUTTON') }), true)
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('INPUT', { type: 'search' }) }), false, '검색 입력창에 포커스면 실행키 금지')
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('BODY'), isComposing: true }), false, 'IME 조합 중 금지')
  assert.equal(shouldHandleDeckHotkey({ ...base, ctrlKey: true, target: el('BODY') }), false, 'Ctrl 조합은 실행키 아님')
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('BODY') }, { dialogOpen: true }), false, '다이얼로그 열림 시 금지')
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('BODY') }, { activeElement: el('INPUT') }), false)
  assert.equal(shouldHandleDeckHotkey({ ...base, target: el('BODY') }, { activeElement: el('BUTTON') }), true)
}

console.log('check-search: ok')
