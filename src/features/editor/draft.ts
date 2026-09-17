import type { Action, ActionType, BrowserChoice, SystemCommand } from '@/model/action'
import { DEFAULT_DISPLAY, type Deck, type DeckButton, type DisplayMode, type IconRef, type Position } from '@/model/deck'
import { defaultHotkeyFor, isValidHotkey } from '@/model/keys'
import { findHotkeyOwner } from '@/model/deck'
import { SYSTEM_COMMAND_LABELS } from '@/features/actions/registry'
import { normalizeHttpUrl } from '@/lib/url'
import { suggestNameFromPath } from '@/lib/path'
import { newId } from '@/lib/id'

/**
 * 편집 폼의 작업 사본. 동작 종류를 바꿔도 입력이 사라지지 않도록
 * 종류별 필드를 따로 보관하고, 저장할 때 선택된 종류만 Action 으로 뽑는다.
 */
export interface ButtonDraft {
  name: string
  /** 사용자가 이름을 직접 고쳤는지. false 인 동안은 파일명·기능명을 자동으로 채운다 */
  nameEdited: boolean
  actionType: ActionType
  website: { url: string; browser: BrowserChoice }
  program: { path: string }
  file: { path: string }
  folder: { path: string }
  system: { command: SystemCommand | '' }
  search: { engine: string; browser: BrowserChoice }
  /** 빈 문자열 = 실행키 없음 */
  hotkey: string
  display: DisplayMode
  icon: IconRef
}

export type DraftField = 'name' | 'url' | 'path' | 'command' | 'engine' | 'hotkey'
export type DraftErrors = Partial<Record<DraftField, string>>

export function createDraft(position: Position, deck: Deck, defaultBrowser: BrowserChoice, defaultEngine: string): ButtonDraft {
  // 슬롯 기본 실행키를 제안하되, 이미 다른 버튼이 쓰고 있으면 비워 둔다
  const suggested = defaultHotkeyFor(position)
  const hotkey = suggested && !findHotkeyOwner(deck, suggested) ? suggested : ''
  return {
    name: '',
    nameEdited: false,
    actionType: 'website',
    website: { url: '', browser: defaultBrowser },
    program: { path: '' },
    file: { path: '' },
    folder: { path: '' },
    system: { command: '' },
    search: { engine: defaultEngine, browser: defaultBrowser },
    hotkey,
    display: DEFAULT_DISPLAY,
    icon: { kind: 'none' },
  }
}

export function draftFromButton(b: DeckButton, defaultBrowser: BrowserChoice, defaultEngine: string): ButtonDraft {
  const a = b.action
  return {
    name: b.name,
    nameEdited: true,
    actionType: a.type,
    website: a.type === 'website' ? { url: a.url, browser: a.browser } : { url: '', browser: defaultBrowser },
    program: { path: a.type === 'program' ? a.path : '' },
    file: { path: a.type === 'file' ? a.path : '' },
    folder: { path: a.type === 'folder' ? a.path : '' },
    system: { command: a.type === 'system' ? a.command : '' },
    search: a.type === 'search' ? { engine: a.engine, browser: a.browser } : { engine: defaultEngine, browser: defaultBrowser },
    hotkey: b.hotkey ?? '',
    display: b.display,
    icon: b.icon,
  }
}

/** 이름이 자동 상태라면 제안값으로 채운다 */
export function withSuggestedName(d: ButtonDraft, suggestion: string): ButtonDraft {
  return d.nameEdited ? d : { ...d, name: suggestion }
}

export function suggestNameForPath(type: 'program' | 'file' | 'folder', path: string): string {
  // 파일은 확장자를 남겨 "보고서.xlsx" 처럼 무엇인지 보이게, 프로그램·폴더는 뗀다
  return suggestNameFromPath(path, { keepExtension: type === 'file' })
}

export function suggestNameForSystem(command: SystemCommand): string {
  return SYSTEM_COMMAND_LABELS[command]
}

/** 현재 종류의 Action 을 뽑는다. 검증 전에 부르면 빈 값이 들어갈 수 있다 */
export function draftAction(d: ButtonDraft): Action {
  switch (d.actionType) {
    case 'website':
      return { type: 'website', url: normalizeHttpUrl(d.website.url) ?? d.website.url.trim(), browser: d.website.browser }
    case 'program':
      return { type: 'program', path: d.program.path }
    case 'file':
      return { type: 'file', path: d.file.path }
    case 'folder':
      return { type: 'folder', path: d.folder.path }
    case 'system':
      return { type: 'system', command: (d.system.command || 'play-pause') as SystemCommand }
    case 'search':
      return { type: 'search', engine: d.search.engine, browser: d.search.browser }
  }
}

/**
 * 저장 가능 여부. 오류가 없으면 빈 객체.
 * @param excludeId 편집 중인 버튼 id (실행키 중복 검사에서 자기 자신을 뺀다)
 */
export function validateDraft(d: ButtonDraft, deck: Deck, excludeId?: string): DraftErrors {
  const errors: DraftErrors = {}
  if (!d.name.trim()) errors.name = '버튼 이름을 입력하세요'

  switch (d.actionType) {
    case 'website':
      if (!d.website.url.trim()) errors.url = 'URL 을 입력하세요'
      else if (!normalizeHttpUrl(d.website.url)) errors.url = '올바른 주소가 아닙니다 (예: https://example.com)'
      break
    case 'program':
      if (!d.program.path) errors.path = '프로그램을 선택하세요'
      break
    case 'file':
      if (!d.file.path) errors.path = '파일을 선택하세요'
      break
    case 'folder':
      if (!d.folder.path) errors.path = '폴더를 선택하세요'
      break
    case 'system':
      if (!d.system.command) errors.command = '기능을 선택하세요'
      break
    case 'search':
      if (!d.search.engine) errors.engine = '검색엔진을 선택하세요'
      break
  }

  if (d.hotkey) {
    if (!isValidHotkey(d.hotkey)) errors.hotkey = '영문 또는 숫자 한 글자만 가능합니다'
    else {
      const owner = findHotkeyOwner(deck, d.hotkey, excludeId)
      if (owner) errors.hotkey = `'${owner.name}' 버튼이 이미 ${d.hotkey} 키를 사용합니다`
    }
  }
  return errors
}

export function draftToButton(d: ButtonDraft, position: Position, existingId?: string): DeckButton {
  return {
    id: existingId ?? newId(),
    position,
    name: d.name.trim(),
    action: draftAction(d),
    icon: d.icon,
    hotkey: d.hotkey || null,
    display: d.display,
  }
}
