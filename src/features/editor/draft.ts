import type { Action, ActionType, BrowserChoice, SystemCommand } from '@/model/action'
// Node 검사 스크립트(scripts/check-folders.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import { DEFAULT_DISPLAY, DEFAULT_ICON, type Deck, type DeckButton, type DisplayMode, type IconRef, type Position } from '../../model/deck.ts'
import { defaultHotkeyFor, isValidHotkey } from '../../model/keys.ts'
import { findHotkeyOwner } from '../../model/deck.ts'
import { childrenOf, firstEmptySlot, isFolderButton, isSelfOrDescendant } from '../deck/folders.ts'
import { SYSTEM_COMMAND_LABELS } from '../actions/registry.ts'
import { normalizeHttpUrl } from '../../lib/url.ts'
import { suggestNameFromPath } from '../../lib/path.ts'
import { newId } from '../../lib/id.ts'

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
  /** 이 버튼이 들어갈 QuickDeck 폴더 (루트 = null). 편집에서 바꾸면 "다른 폴더로 이동" 이 된다 */
  parentId: string | null
}

export type DraftField = 'name' | 'url' | 'path' | 'command' | 'engine' | 'hotkey' | 'location' | 'actionType'
export type DraftErrors = Partial<Record<DraftField, string>>

export function createDraft(position: Position, deck: Deck, parentId: string | null, defaultBrowser: BrowserChoice, defaultEngine: string): ButtonDraft {
  // 슬롯 기본 실행키를 제안하되, 같은 폴더의 다른 버튼이 이미 쓰고 있으면 비워 둔다
  const suggested = defaultHotkeyFor(position)
  const hotkey = suggested && !findHotkeyOwner(deck, suggested, undefined, parentId) ? suggested : ''
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
    icon: { ...DEFAULT_ICON },
    parentId,
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
    parentId: b.parentId ?? null,
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
    case 'deck-folder':
      return { type: 'deck-folder' }
  }
}

/**
 * 저장 가능 여부. 오류가 없으면 빈 객체.
 * 실행키 중복과 폴더 이동 검사는 d.parentId(저장될 폴더) 안에서 한다.
 * @param excludeId 편집 중인 버튼 id (실행키 중복 검사에서 자기 자신을 뺀다)
 */
export function validateDraft(d: ButtonDraft, deck: Deck, excludeId?: string): DraftErrors {
  const errors: DraftErrors = {}
  if (!d.name.trim()) errors.name = '버튼 이름을 입력하세요'

  const editing = excludeId ? deck.buttons.find((b) => b.id === excludeId) : undefined
  if (editing && isFolderButton(editing) && d.actionType !== 'deck-folder' && childrenOf(deck, editing.id).length > 0) {
    errors.actionType = '버튼이 들어 있는 폴더는 다른 종류로 바꿀 수 없습니다. 먼저 안의 버튼을 옮기거나 지우세요'
  }
  // 다른 폴더로 이동: 대상이 자기 자신·자손이면 cycle, 빈 슬롯이 없으면 불가
  const moving = editing !== undefined && (editing.parentId ?? null) !== d.parentId
  if (moving && d.parentId !== null) {
    const target = deck.buttons.find((b) => b.id === d.parentId)
    if (!target || !isFolderButton(target)) errors.location = '대상 폴더가 없습니다'
    else if (isSelfOrDescendant(deck, d.parentId, excludeId!)) errors.location = '폴더를 자기 자신이나 그 안의 폴더로 옮길 수 없습니다'
  }
  if (moving && !errors.location && !firstEmptySlot(deck, d.parentId)) errors.location = '이 폴더에 빈 슬롯이 없습니다'

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
    case 'deck-folder':
      break
  }

  if (d.hotkey) {
    if (!isValidHotkey(d.hotkey)) errors.hotkey = '영문 또는 숫자 한 글자만 가능합니다'
    else {
      const owner = findHotkeyOwner(deck, d.hotkey, excludeId, d.parentId)
      if (owner) errors.hotkey = `${moving ? '대상 폴더의 ' : ''}'${owner.name}' 버튼이 이미 ${d.hotkey} 키를 사용합니다`
    }
  }
  return errors
}

/**
 * 저장할 버튼. 편집 중 폴더를 바꿨으면(이동) 대상 폴더의 첫 빈 슬롯에 놓는다 (validateDraft 가 빈 슬롯을 보장).
 * @param position 새 버튼의 슬롯 또는 편집 중인 버튼의 현재 슬롯
 */
export function draftToButton(d: ButtonDraft, position: Position, deck: Deck, existingId?: string): DeckButton {
  const existing = existingId ? deck.buttons.find((b) => b.id === existingId) : undefined
  const moved = existing !== undefined && (existing.parentId ?? null) !== d.parentId
  return {
    id: existingId ?? newId(),
    parentId: d.parentId,
    position: moved ? (firstEmptySlot(deck, d.parentId) ?? position) : position,
    name: d.name.trim(),
    action: draftAction(d),
    icon: d.icon,
    hotkey: d.hotkey || null,
    display: d.display,
  }
}
