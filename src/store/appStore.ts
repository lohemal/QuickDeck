import { create } from 'zustand'
import { activeDeck, clampLayout, createDefaultAppData, migrate, type AppData } from '@/model/appData'
import type { Deck, DeckButton, DeckLayout, Position } from '@/model/deck'
import { isInsideLayout } from '@/model/deck'
import { applyDrop } from '@/features/deck/reorder'
import type { CustomSearchEngine, Settings, WindowSettings } from '@/model/settings'
import { loadRawAppData, saveRawAppData } from '@/ipc/storage'

export type LoadStatus = 'loading' | 'ready' | 'error'
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface AppStore {
  status: LoadStatus
  saveStatus: SaveStatus
  error: string | null
  data: AppData | null

  load: () => Promise<void>
  /** 현재 덱을 갱신한다. 모든 덱 변경은 이 함수를 거친다 */
  updateActiveDeck: (updater: (deck: Deck) => Deck) => void
  upsertButton: (button: DeckButton) => void
  removeButton: (buttonId: string) => void
  /** 드래그 배치: 빈 슬롯이면 이동, 버튼이 있으면 교환. 변화가 없으면 저장하지 않는다 */
  moveButton: (buttonId: string, target: Position) => void
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

  async load() {
    try {
      const raw = await loadRawAppData()
      const migrated = raw == null ? null : migrate(raw)
      const data = migrated ?? createDefaultAppData()
      set({ data, status: 'ready', error: null })
      // 파일이 없었거나 마이그레이션이 일어났으면 현재 스키마로 바로 저장해 둔다
      if (migrated == null || (raw as { schemaVersion?: number }).schemaVersion !== data.schemaVersion) {
        scheduleSave(data)
      }
    } catch (e) {
      set({ status: 'error', error: String(e) })
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
      const others = deck.buttons.filter(
        (b) => b.id !== button.id && !(b.position.row === button.position.row && b.position.col === button.position.col),
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

function scheduleSave(data: AppData) {
  useAppStore.setState({ saveStatus: 'pending' })
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    useAppStore.setState({ saveStatus: 'saving' })
    try {
      await saveRawAppData(data)
      useAppStore.setState({ saveStatus: 'saved' })
    } catch (e) {
      useAppStore.setState({ saveStatus: 'error', error: String(e) })
    }
  }, SAVE_DELAY_MS)
}

/** 현재 덱을 편하게 구독하는 셀렉터 */
export function useActiveDeck(): Deck | null {
  return useAppStore((s) => (s.data ? activeDeck(s.data) : null))
}

export function useSettings(): Settings | null {
  return useAppStore((s) => s.data?.settings ?? null)
}
