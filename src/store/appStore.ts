import { create } from 'zustand'
import { activeDeck, clampLayout, type AppData } from '@/model/appData'
import { resolveLoad } from '@/model/load'
import type { Deck, DeckButton, DeckLayout, Position } from '@/model/deck'
import { isInsideLayout, parentIdOf } from '@/model/deck'
import { applyDrop } from '@/features/deck/reorder'
import { applyMoveToFolder } from '@/features/deck/folders'
import type { CustomSearchEngine, Settings, WindowSettings } from '@/model/settings'
import { backupCorruptAppData, loadAppDataText, saveRawAppData } from '@/ipc/storage'
import { toUserError } from '@/ipc/errors'

/**
 * - protected: 사용자 데이터를 보호하려고 멈춘 상태 (더 새 버전의 파일 / 손상 파일 보존 실패).
 *   data 를 들고 있지 않고 파일·OS 설정을 바꾸는 일을 하지 않는다. 다음 실행에서도 같은 판단을 한다
 */
export type LoadStatus = 'loading' | 'ready' | 'error' | 'protected'
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export type ProtectionReason = 'future' | 'backup-failed'

interface AppStore {
  status: LoadStatus
  saveStatus: SaveStatus
  error: string | null
  data: AppData | null
  /** status 가 protected 일 때 이유 */
  protection: ProtectionReason | null
  /** 불러오면서 사용자에게 한 번 알릴 말 (손상 파일 보존 후 새로 시작 등) */
  loadNotice: string | null

  load: () => Promise<void>
  /** 현재 덱을 갱신한다. 모든 덱 변경은 이 함수를 거친다 */
  updateActiveDeck: (updater: (deck: Deck) => Deck) => void
  upsertButton: (button: DeckButton) => void
  removeButton: (buttonId: string) => void
  /** 드래그 배치: 빈 슬롯이면 이동, 버튼이 있으면 교환. 변화가 없으면 저장하지 않는다 */
  moveButton: (buttonId: string, target: Position) => void
  /** 다른 QuickDeck 폴더(루트 = null)로 옮긴다. 대상의 첫 빈 슬롯. 계획이 실패하면 아무것도 하지 않고 false */
  moveButtonToFolder: (buttonId: string, targetParentId: string | null) => boolean
  /** 행/열 변경. 격자 밖으로 나가는 버튼은 지우지 않고 보존한다(다시 늘리면 돌아온다) */
  setLayout: (layout: DeckLayout) => void
  /** 격자 밖에 보존된 버튼을 사용자가 명시적으로 지울 때 */
  removeHiddenButtons: () => void

  updateSettings: (patch: Partial<Settings>) => void
  updateWindowSettings: (patch: Partial<WindowSettings>) => void
  upsertSearchEngine: (engine: CustomSearchEngine) => void
  removeSearchEngine: (id: string) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  status: 'loading',
  saveStatus: 'idle',
  error: null,
  data: null,
  protection: null,
  loadNotice: null,

  async load() {
    try {
      const outcome = await resolveLoad({ readText: loadAppDataText, backupCorrupt: () => backupCorruptAppData() })
      if (outcome.kind === 'protected') {
        writesBlocked = true
        console.warn('[QuickDeck] 데이터 보호 상태:', outcome.reason, outcome.detail)
        set({ status: 'protected', protection: outcome.reason, data: null, error: null })
        return
      }
      set({ data: outcome.data, status: 'ready', error: null, loadNotice: outcome.notice })
      // 파일이 없었거나(최초 실행) 변환이 일어났거나 손상 파일을 보존하고 새로 시작했으면 현재 스키마로 저장해 둔다
      if (outcome.save) scheduleSave(outcome.data)
    } catch (e) {
      // 파일을 읽지 못함(권한·인코딩 등). 아무것도 쓰지 않는다
      writesBlocked = true
      const err = toUserError(e)
      console.warn('[QuickDeck] 데이터 읽기 실패:', err.detail ?? err.message)
      set({ status: 'error', error: err.message, data: null })
    }
  },

  updateActiveDeck(updater) {
    const { data } = get()
    if (!data) return
    const current = activeDeck(data)
    const next = updater(current)
    const decks = data.decks.map((d) => (d.id === current.id ? next : d))
    const nextData: AppData = { ...data, decks }
    set({ data: nextData })
    scheduleSave(nextData)
  },

  upsertButton(button) {
    get().updateActiveDeck((deck) => {
      if (!isInsideLayout(button.position, deck.layout)) return deck
      // 같은 폴더(parentId) 안에서만 위치가 겹치는 버튼을 밀어낸다. 다른 폴더의 같은 row/col 은 다른 슬롯이다
      const others = deck.buttons.filter(
        (b) =>
          b.id !== button.id &&
          !(parentIdOf(b) === parentIdOf(button) && b.position.row === button.position.row && b.position.col === button.position.col),
      )
      return { ...deck, buttons: [...others, button] }
    })
  },

  removeButton(buttonId) {
    get().updateActiveDeck((deck) => ({ ...deck, buttons: deck.buttons.filter((b) => b.id !== buttonId) }))
  },

  moveButton(buttonId, target) {
    const { data } = get()
    if (!data) return
    const next = applyDrop(activeDeck(data), buttonId, target)
    if (next) get().updateActiveDeck(() => next)
  },

  moveButtonToFolder(buttonId, targetParentId) {
    const { data } = get()
    if (!data) return false
    const next = applyMoveToFolder(activeDeck(data), buttonId, targetParentId)
    if (!next) return false
    get().updateActiveDeck(() => next)
    return true
  },

  setLayout(layout) {
    const clamped = clampLayout(layout.columns, layout.rows)
    get().updateActiveDeck((deck) => ({ ...deck, layout: clamped }))
  },

  removeHiddenButtons() {
    get().updateActiveDeck((deck) => ({ ...deck, buttons: deck.buttons.filter((b) => isInsideLayout(b.position, deck.layout)) }))
  },

  updateSettings(patch) {
    const { data } = get()
    if (!data) return
    const nextData: AppData = { ...data, settings: { ...data.settings, ...patch } }
    set({ data: nextData })
    scheduleSave(nextData)
  },

  updateWindowSettings(patch) {
    const { data } = get()
    if (!data) return
    get().updateSettings({ window: { ...data.settings.window, ...patch } })
  },

  upsertSearchEngine(engine) {
    const { data } = get()
    if (!data) return
    const list = data.settings.customSearchEngines
    const next = list.some((e) => e.id === engine.id) ? list.map((e) => (e.id === engine.id ? engine : e)) : [...list, engine]
    get().updateSettings({ customSearchEngines: next })
  },

  removeSearchEngine(id) {
    const { data } = get()
    if (!data) return
    get().updateSettings({ customSearchEngines: data.settings.customSearchEngines.filter((e) => e.id !== id) })
  },
}))

// ── 자동 저장 (변경 후 잠시 뒤 한 번만 기록) ─────────────────────────────
const SAVE_DELAY_MS = 400
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** 보호·오류 상태에서는 어떤 경로로도 파일에 쓰지 않는다 (data 가 null 이라 막히지만 한 번 더 막는다) */
let writesBlocked = false

/** 아직 기록하지 않은 최신 데이터 */
let pendingData: AppData | null = null
/** 지금 기록 중인 저장 */
let inflight: Promise<void> | null = null

function scheduleSave(data: AppData) {
  if (writesBlocked) return
  pendingData = data
  useAppStore.setState({ saveStatus: 'pending' })
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void writePending().catch(() => {
      /* 상태(saveStatus: error)는 writePending 이 남긴다 */
    })
  }, SAVE_DELAY_MS)
}

async function writePending(): Promise<void> {
  saveTimer = null
  const data = pendingData
  pendingData = null
  if (!data) return
  useAppStore.setState({ saveStatus: 'saving' })
  const job = saveRawAppData(data)
  inflight = job
  try {
    await job
    useAppStore.setState({ saveStatus: 'saved' })
  } catch (e) {
    useAppStore.setState({ saveStatus: 'error', error: toUserError(e).message })
    throw e
  } finally {
    if (inflight === job) inflight = null
  }
}

/**
 * 기다리는 저장(400ms 지연)과 진행 중인 저장을 지금 끝낸다. 하나라도 실패하면 reject.
 * 업데이트 설치 직전에 쓴다 — Windows 에서 설치가 시작되면 앱이 바로 종료되어 지연 저장이 사라지기 때문
 */
export async function flushPendingSave(): Promise<void> {
  if (inflight) await inflight
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (pendingData) await writePending()
}

/** 현재 덱을 편하게 구독하는 셀렉터 */
export function useActiveDeck(): Deck | null {
  return useAppStore((s) => (s.data ? activeDeck(s.data) : null))
}

export function useSettings(): Settings | null {
  return useAppStore((s) => s.data?.settings ?? null)
}
