// 실행키 ↔ 물리 키 대응과 실행 후 숨김 정책의 순수 로직 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-hotkeys.ts
import assert from 'node:assert/strict'
import { codeForHotkey, findButtonByCode, findButtonForEvent, hotkeyFromCode, hotkeyFromEvent, matchesHotkey } from '../src/features/hotkeys/keymap.ts'
import { KEEP_OPEN_SYSTEM_COMMANDS, shouldHideAfterRun } from '../src/features/actions/policy.ts'
import { acceleratorFromEvent, displayAccelerator, formatAccelerator, validateAccelerator } from '../src/features/hotkeys/accelerator.ts'

// ── 키 대응 ─────────────────────────────────────────────────────────────
{
  assert.equal(hotkeyFromCode('KeyQ'), 'Q')
  assert.equal(hotkeyFromCode('Digit1'), '1')
  assert.equal(hotkeyFromCode('Numpad4'), '4')
  assert.equal(hotkeyFromCode('Escape'), null)
  assert.equal(hotkeyFromCode('Space'), null)
  assert.equal(hotkeyFromCode('F1'), null)

  assert.equal(codeForHotkey('q'), 'KeyQ')
  assert.equal(codeForHotkey(' E '), 'KeyE')
  assert.equal(codeForHotkey('1'), 'Digit1')
  assert.equal(codeForHotkey('ㅂ'), null, '한글 자모는 실행키가 아니다')
  assert.equal(codeForHotkey('QW'), null)

  // 대소문자 무시, IME 상태와 무관 (code 만 본다)
  assert.equal(matchesHotkey('q', 'KeyQ'), true)
  assert.equal(matchesHotkey('Q', 'KeyQ'), true)
  assert.equal(matchesHotkey('1', 'Numpad1'), true)
  assert.equal(matchesHotkey('1', 'KeyQ'), false)
  assert.equal(matchesHotkey(null, 'KeyQ'), false)
  assert.equal(matchesHotkey('', 'KeyQ'), false)

  const deck = {
    layout: { columns: 4, rows: 3 },
    buttons: [
      { id: 'a', hotkey: 'Q', position: { row: 0, col: 0 } },
      { id: 'b', hotkey: 'z', position: { row: 1, col: 1 } }, // 사용자 지정 실행키 (프리셋 밖)
      { id: 'c', hotkey: null, position: { row: 2, col: 2 } },
      { id: 'd', hotkey: '7', position: { row: 2, col: 3 } },
      { id: 'hidden', hotkey: 'X', position: { row: 5, col: 0 } }, // 격자 밖에 보존된 버튼
    ],
  } as never
  assert.equal(findButtonByCode(deck, 'KeyX'), undefined, '격자 밖 버튼은 실행키로 실행되지 않는다')
  assert.equal(findButtonByCode(deck, 'KeyQ')?.id, 'a')
  assert.equal(findButtonByCode(deck, 'KeyZ')?.id, 'b', '저장된 사용자 지정 키로 찾아야 한다')
  assert.equal(findButtonByCode(deck, 'Digit7')?.id, 'd')
  assert.equal(findButtonByCode(deck, 'Numpad7')?.id, 'd')
  assert.equal(findButtonByCode(deck, 'KeyW'), undefined, '프리셋 위치라도 저장된 키가 없으면 실행하지 않는다')

  // code 우선, IME 로 한글이 들어와도 code 로 판정
  assert.equal(hotkeyFromEvent({ code: 'KeyQ', key: 'ㅂ' }), 'Q')
  // 스캔코드 없는 주입 입력(code=""): key 가 영문/숫자면 대체
  assert.equal(hotkeyFromEvent({ code: '', key: 'q' }), 'Q')
  assert.equal(hotkeyFromEvent({ code: '', key: '7' }), '7')
  assert.equal(hotkeyFromEvent({ code: '', key: 'ㅂ' }), null, 'code 가 없고 한글이면 실행하지 않는다')
  assert.equal(hotkeyFromEvent({ code: 'Space', key: ' ' }), null)
  assert.equal(findButtonForEvent(deck, { code: '', key: 'z' })?.id, 'b')
  assert.equal(findButtonForEvent(deck, { code: 'KeyQ', key: 'ㅂ' })?.id, 'a')
}

// ── 실행 후 숨김 정책 ──────────────────────────────────────────────────
{
  const on = { window: { hideAfterRun: true } } as never
  const off = { window: { hideAfterRun: false } } as never
  const btn = (action: object) => ({ action }) as never

  assert.equal(shouldHideAfterRun(btn({ type: 'website', url: 'https://a.b', browser: 'default' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'program', path: 'x.exe' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'file', path: 'x.txt' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'folder', path: 'C:\\' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'search', engine: 'google', browser: 'default' }), on), true)
  for (const c of KEEP_OPEN_SYSTEM_COMMANDS) {
    assert.equal(shouldHideAfterRun(btn({ type: 'system', command: c }), on), false, `${c} 는 덱을 유지해야 한다`)
  }
  assert.equal(shouldHideAfterRun(btn({ type: 'system', command: 'lock-screen' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'system', command: 'file-explorer' }), on), true)
  assert.equal(shouldHideAfterRun(btn({ type: 'website', url: 'https://a.b', browser: 'default' }), off), false, '전역 설정이 꺼지면 숨기지 않는다')
}

// ── 전역 단축키 문자열 ─────────────────────────────────────────────────
{
  const ev = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
    code,
    key: '',
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
  })
  assert.equal(acceleratorFromEvent(ev('Space', { ctrl: true })), 'Ctrl+Space')
  assert.equal(acceleratorFromEvent(ev('Space', { ctrl: true, shift: true })), 'Ctrl+Shift+Space')
  assert.equal(acceleratorFromEvent(ev('KeyQ', { alt: true })), 'Alt+Q')
  assert.equal(acceleratorFromEvent(ev('Digit1', { ctrl: true, alt: true })), 'Ctrl+Alt+1')
  assert.equal(acceleratorFromEvent(ev('F12')), 'F12')
  assert.equal(acceleratorFromEvent(ev('ControlLeft', { ctrl: true })), null, '수식키만 눌린 상태는 조합이 아니다')
  assert.equal(acceleratorFromEvent(ev('ShiftRight', { shift: true })), null)
  assert.equal(acceleratorFromEvent(ev('Escape', { ctrl: true })), null, '지원하지 않는 키')

  assert.deepEqual(validateAccelerator('Ctrl+Space'), { ok: true })
  assert.deepEqual(validateAccelerator('Ctrl+Shift+Space'), { ok: true })
  assert.deepEqual(validateAccelerator('Alt+Q'), { ok: true })
  assert.deepEqual(validateAccelerator('F9'), { ok: true }, '기능키는 단독 허용')
  assert.equal(validateAccelerator('Shift+A').ok, false, 'Shift 만은 타이핑과 충돌')
  assert.equal(validateAccelerator('Q').ok, false, '수식키 없는 글자 금지')
  assert.equal(validateAccelerator('Alt+F4').ok, false, 'Windows 예약')
  assert.equal(validateAccelerator('Ctrl+Alt+Delete').ok, false)
  assert.equal(validateAccelerator('Super+L').ok, false)

  assert.equal(formatAccelerator('Shift+Ctrl+Space'), 'Ctrl+Shift+Space', '수식키 순서 정규화')
  assert.equal(formatAccelerator('CommandOrControl+Q'), 'Ctrl+Q')
  assert.equal(displayAccelerator('Ctrl+Shift+Space'), 'Ctrl + Shift + Space')
  assert.equal(displayAccelerator('Super+Alt+K'), 'Alt + Win + K')
}

console.log('check-hotkeys: ok')
