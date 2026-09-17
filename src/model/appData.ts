// Node 검사 스크립트(scripts/check-*.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import { DEFAULT_LAYOUT, LAYOUT_LIMITS, type Deck } from './deck.ts'
import { createDefaultSettings, createDefaultWindowSettings, type Settings } from './settings.ts'
import { newId } from '../lib/id.ts'

/**
 * 로컬에 저장되는 전체 데이터. 파일 하나(quickdeck.json)로 저장된다.
 * 구조가 바뀌면 SCHEMA_VERSION 을 올리고 migrate() 에 변환 단계를 추가한다.
 *
 * 버전 기록
 *  1  최초 (P0)
 *  2  settings.window 정리: rememberSize/rememberPosition 제거, showAt 추가, lastBounds 단위 정의 (P5 설정 화면)
 */
export const SCHEMA_VERSION = 2

export interface AppData {
  schemaVersion: number
  settings: Settings
  /** 지금은 덱 하나만 쓰지만 향후 여러 덱(프로필)을 위해 배열로 둔다 */
  decks: Deck[]
  activeDeckId: string
}

export function createDefaultAppData(): AppData {
  const deck: Deck = {
    id: newId(),
    name: '기본 덱',
    layout: { ...DEFAULT_LAYOUT },
    buttons: [],
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: createDefaultSettings(),
    decks: [deck],
    activeDeckId: deck.id,
  }
}

type Raw = Record<string, unknown>

/**
 * 저장된 JSON 을 현재 스키마로 끌어올린다.
 * 알 수 없는 버전이나 깨진 데이터면 null 을 돌려주어 호출자가 기본값으로 시작하게 한다.
 * 버튼 데이터(decks)는 어떤 단계에서도 버리지 않는다.
 */
export function migrate(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null
  const data = { ...(raw as Raw) }
  if (typeof data.schemaVersion !== 'number') return null
  if (data.schemaVersion > SCHEMA_VERSION) return null
  if (!Array.isArray(data.decks) || data.decks.length === 0) return null

  if (data.schemaVersion === 1) {
    data.settings = migrateSettingsV1toV2(data.settings)
    data.schemaVersion = 2
  }

  const decks = data.decks as Deck[]
  const settings = normalizeSettings(data.settings)
  const activeDeckId = decks.some((d) => d.id === data.activeDeckId) ? (data.activeDeckId as string) : decks[0]!.id

  return { schemaVersion: SCHEMA_VERSION, settings, decks, activeDeckId }
}

/** v1 → v2: window 블록만 바뀐다. 다른 설정은 그대로 넘긴다 */
function migrateSettingsV1toV2(settings: unknown): Raw {
  const s = (settings ?? {}) as Raw
  const w = (s.window ?? {}) as Raw
  const next: Raw = { ...s }
  next.window = {
    ...createDefaultWindowSettings(),
    ...pick(w, ['alwaysOnTop', 'autoStart', 'hideAfterRun', 'closeToTray']),
    // v1 의 lastBounds 는 기록된 적이 없고 단위 정의도 없었으므로 버린다
    lastBounds: null,
  }
  return next
}

/** 현재 버전 데이터에 빠진 필드를 기본값으로 채우고 범위를 맞춘다 (버전 증가 없이 필드가 추가된 경우 대비) */
function normalizeSettings(settings: unknown): Settings {
  const defaults = createDefaultSettings()
  const s = (settings ?? {}) as Raw
  const merged: Settings = {
    ...defaults,
    ...(s as Partial<Settings>),
    window: { ...defaults.window, ...((s.window ?? {}) as Partial<Settings['window']>) },
    hotkey: { ...defaults.hotkey, ...((s.hotkey ?? {}) as Partial<Settings['hotkey']>) },
    customSearchEngines: Array.isArray(s.customSearchEngines) ? (s.customSearchEngines as Settings['customSearchEngines']) : [],
  }
  if (merged.window.showAt !== 'cursor-monitor' && merged.window.showAt !== 'last-position') merged.window.showAt = 'cursor-monitor'
  if (!merged.hotkey.accelerator) merged.hotkey.accelerator = defaults.hotkey.accelerator
  return merged
}

function pick(obj: Raw, keys: string[]): Raw {
  const out: Raw = {}
  for (const k of keys) if (k in obj) out[k] = obj[k]
  return out
}

export function activeDeck(data: AppData): Deck {
  return data.decks.find((d) => d.id === data.activeDeckId) ?? data.decks[0]!
}

/** 레이아웃 값을 허용 범위로 맞춘다 */
export function clampLayout(columns: number, rows: number): { columns: number; rows: number } {
  return {
    columns: Math.min(LAYOUT_LIMITS.maxColumns, Math.max(LAYOUT_LIMITS.minColumns, Math.round(columns) || LAYOUT_LIMITS.minColumns)),
    rows: Math.min(LAYOUT_LIMITS.maxRows, Math.max(LAYOUT_LIMITS.minRows, Math.round(rows) || LAYOUT_LIMITS.minRows)),
  }
}
