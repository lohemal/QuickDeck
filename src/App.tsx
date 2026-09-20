import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { DeckButton, Position } from '@/model/deck'
import { hiddenButtons } from '@/model/deck'
import { useActiveDeck, useAppStore } from '@/store/appStore'
import { DeckGrid } from '@/features/deck/DeckGrid'
import { DeckFooter } from '@/features/deck/DeckFooter'
import { ContextMenu } from '@/features/deck/ContextMenu'
import type { DeckMetrics } from '@/features/deck/useDeckMetrics'
import { ButtonEditor, type EditorTarget } from '@/features/editor/ButtonEditor'
import { SearchPopover } from '@/features/search/SearchPopover'
import { SettingsScreen, type SettingsActions } from '@/features/settings/SettingsScreen'
import { useDeckHotkeys } from '@/features/hotkeys/useDeckHotkeys'
import { isTextInputFocused } from '@/features/hotkeys/guard'
import { runAction } from '@/features/actions/execute'
import { dangerPromptFor, type DangerPrompt } from '@/features/actions/dangerous'
import { shouldHideAfterRun } from '@/features/actions/policy'
import { findSearchEngine } from '@/features/actions/search'
import { toUserError } from '@/ipc/errors'
import { applyHotkey, applyWindowPrefs, hideDeck, launchInfo, onDeckBounds, onDeckVisibility, showDeck } from '@/ipc/window'
import { isAutostartEnabled, setAutostart } from '@/ipc/autostart'
import { cleanupIcons } from '@/ipc/icons'
import { collectIconReferences } from '@/features/icons/auto'
import { useTheme } from '@/features/theme/useTheme'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Notice, type NoticeMessage } from '@/components/Notice'

interface MenuState {
  button: DeckButton
  x: number
  y: number
}

interface PendingRun {
  button: DeckButton
  prompt: DangerPrompt
}

interface OpenSearch {
  button: DeckButton
  anchor: HTMLButtonElement
}

type View = 'deck' | 'settings'

const SEARCH_POPOVER_ID = 'deck-search-popover'

export default function App() {
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const saveStatus = useAppStore((s) => s.saveStatus)
  const load = useAppStore((s) => s.load)
  const deck = useActiveDeck()
  const settings = useAppStore((s) => s.data?.settings ?? null)

  const [view, setView] = useState<View>('deck')
  // 테마: 설정의 모드 → <html data-theme>. 설정을 읽기 전에는 CSS 의 OS 폴백이 쓰인다
  useTheme(settings?.appearance.theme)
  const [metrics, setMetrics] = useState<DeckMetrics | null>(null)
  const [notice, setNotice] = useState<NoticeMessage | null>(null)
  const [editor, setEditor] = useState<EditorTarget | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [deleting, setDeleting] = useState<DeckButton | null>(null)
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null)
  const [search, setSearch] = useState<OpenSearch | null>(null)
  const [autostartRegistered, setAutostartRegistered] = useState<boolean | null>(null)

  const dialogOpen = editor !== null || deleting !== null || pendingRun !== null
  /** 설정 화면이 열려 있으면 덱 실행키를 막는다 (다이얼로그와 같은 취급) */
  const hotkeysBlocked = dialogOpen || view !== 'deck'

  const dismiss = useCallback(() => setNotice(null), [])
  const closeMenu = useCallback(() => setMenu(null), [])
  const closeSearch = useCallback(() => setSearch(null), [])

  useEffect(() => {
    void load()
  }, [load])

  // ── 설정 → Rust (전역 단축키). 설정이 바뀌면 다시 적용된다 ──
  const hotkeyEnabled = settings?.hotkey.enabled
  const hotkeyAccel = settings?.hotkey.accelerator
  useEffect(() => {
    if (hotkeyEnabled === undefined || hotkeyAccel === undefined) return
    applyHotkey({ enabled: hotkeyEnabled, accelerator: hotkeyAccel }).catch((e) =>
      setNotice({ kind: 'error', text: toUserError(e).message }),
    )
  }, [hotkeyEnabled, hotkeyAccel])

  // ── 설정 → Rust (항상 위, X 버튼, 호출 위치, 마지막 bounds) ──
  const windowSettings = settings?.window
  useEffect(() => {
    if (!windowSettings) return
    applyWindowPrefs(windowSettings).catch((e) => console.warn('[QuickDeck] 창 설정 적용 실패:', toUserError(e).detail))
  }, [windowSettings])

  // ── 첫 표시: 창은 숨김 상태로 시작한다. 설정(크기·위치)을 Rust 에 넘긴 뒤, 자동 시작이 아니면 보여준다 ──
  const shownOnce = useRef(false)
  useEffect(() => {
    if (!windowSettings || shownOnce.current) return
    shownOnce.current = true
    void (async () => {
      try {
        await applyWindowPrefs(windowSettings)
        const info = await launchInfo()
        if (!info.autostart) await showDeck()
      } catch (e) {
        console.warn('[QuickDeck] 첫 표시 실패:', toUserError(e).detail)
      }
    })()
  }, [windowSettings])

  // ── 자동 실행: 설정값이 기준. 시작 시 실제 등록 상태와 다르면 설정값으로 맞춘다 ──
  const autoStartSetting = settings?.window.autoStart
  const autostartSynced = useRef(false)
  useEffect(() => {
    if (autoStartSetting === undefined || autostartSynced.current) return
    autostartSynced.current = true
    void (async () => {
      try {
        const registered = await isAutostartEnabled()
        setAutostartRegistered(registered)
        if (registered !== autoStartSetting) {
          await setAutostart(autoStartSetting)
          setAutostartRegistered(autoStartSetting)
        }
      } catch (e) {
        console.warn('[QuickDeck] 자동 실행 상태 확인 실패:', toUserError(e).detail)
      }
    })()
  }, [autoStartSetting])

  // ── Rust 이벤트: 숨김이면 팝오버·메뉴 정리, 표시면 WebView 포커스 확보 / 창 이동·크기 변경 기억 ──
  useEffect(
    () =>
      onDeckVisibility((visible) => {
        if (visible) {
          window.focus()
          if (isTextInputFocused()) (document.activeElement as HTMLElement | null)?.blur()
        } else {
          setSearch(null)
          setMenu(null)
        }
      }),
    [],
  )
  useEffect(() => onDeckBounds((bounds) => useAppStore.getState().updateWindowSettings({ lastBounds: bounds })), [])

  // 덱에서 버튼이 사라지거나 바뀌면(삭제·편집) 열려 있던 검색창도 닫는다
  useEffect(() => {
    if (search && !deck?.buttons.some((b) => b.id === search.button.id && b.action.type === 'search')) setSearch(null)
  }, [deck, search])

  /** 확인이 끝난(또는 필요 없는) 버튼을 실제로 실행한다. 성공하면 조용히(정책에 따라 숨김), 실패하면 오류 안내 후 유지 */
  const execute = useCallback(
    async (button: DeckButton, query?: string) => {
      if (!settings) return
      let ok = false
      try {
        const result = await runAction(button.action, { settings, query })
        if (result.kind === 'unavailable') setNotice({ kind: 'info', text: result.message })
        else ok = true
      } catch (e) {
        const err = toUserError(e)
        console.warn(`[QuickDeck] '${button.name}' 실행 실패:`, err.detail ?? err.message)
        setNotice({ kind: 'error', text: `${button.name}: ${err.message}` })
      }
      if (ok && shouldHideAfterRun(button, settings)) {
        hideDeck().catch((e) => console.warn('[QuickDeck] 숨기기 실패:', toUserError(e).detail))
      }
    },
    [settings],
  )

  /** 버튼 실행 진입점 (마우스 클릭·실행키 공통). anchor 는 검색 팝오버가 붙을 요소 */
  const handleRun = useCallback(
    (button: DeckButton, anchor: HTMLButtonElement) => {
      if (button.action.type === 'search') {
        setSearch((cur) => (cur?.button.id === button.id ? null : { button, anchor }))
        return
      }
      setSearch(null)
      const prompt = dangerPromptFor(button.action)
      if (prompt) setPendingRun({ button, prompt })
      else void execute(button)
    },
    [execute],
  )

  // ── 실행키 / Esc ──
  const handleHotkey = useCallback(
    (button: DeckButton) => {
      const el = document.querySelector<HTMLButtonElement>(`[data-button-id="${button.id}"]`)
      if (el) handleRun(button, el)
    },
    [handleRun],
  )

  const handleEscape = useCallback(() => {
    if (dialogOpen) return // 다이얼로그는 자기 Esc 로 닫힌다. 덱은 유지
    if (isTextInputFocused()) {
      ;(document.activeElement as HTMLElement | null)?.blur()
      return
    }
    if (view === 'settings') {
      setView('deck') // 설정에서 Esc 는 덱으로 복귀 (창은 숨기지 않음)
      return
    }
    if (search) {
      setSearch(null)
      return
    }
    if (menu) {
      setMenu(null)
      return
    }
    hideDeck().catch((e) => console.warn('[QuickDeck] 숨기기 실패:', toUserError(e).detail))
  }, [dialogOpen, view, search, menu])

  useDeckHotkeys({ deck, dialogOpen: hotkeysBlocked, onHotkey: handleHotkey, onEscape: handleEscape })

  const submitSearch = useCallback(
    (query: string) => {
      const target = search
      setSearch(null)
      if (target) void execute(target.button, query)
    },
    [search, execute],
  )

  const confirmRun = useCallback(() => {
    const run = pendingRun
    setPendingRun(null)
    if (run) void execute(run.button)
  }, [pendingRun, execute])

  const handleAdd = useCallback((position: Position) => {
    setSearch(null)
    setEditor({ mode: 'create', position })
  }, [])

  const handleContextMenu = useCallback((button: DeckButton, e: MouseEvent) => {
    setSearch(null)
    setMenu({ button, x: e.clientX, y: e.clientY })
  }, [])

  const handleSave = useCallback((button: DeckButton) => {
    useAppStore.getState().upsertButton(button)
    setEditor(null)
  }, [])

  const confirmDelete = useCallback(() => {
    if (deleting) useAppStore.getState().removeButton(deleting.id)
    setDeleting(null)
  }, [deleting])

  const openSettings = useCallback(() => {
    setSearch(null)
    setMenu(null)
    setView('settings')
  }, [])

  // ── 설정 화면 동작 ──
  const settingsActions = useMemo<SettingsActions>(
    () => ({
      async changeHotkey(accelerator) {
        const cur = useAppStore.getState().data?.settings.hotkey
        if (!cur) return
        // 먼저 등록해 보고(실패하면 Rust 가 기존 단축키를 되살린다), 성공했을 때만 저장한다
        try {
          await applyHotkey({ enabled: cur.enabled, accelerator })
        } catch (e) {
          throw new Error(toUserError(e).message)
        }
        useAppStore.getState().updateSettings({ hotkey: { ...cur, accelerator } })
      },
      updateWindow(patch) {
        useAppStore.getState().updateWindowSettings(patch)
      },
      async setAutoStart(on) {
        try {
          await setAutostart(on)
        } catch (e) {
          throw new Error(`자동 실행 설정을 바꾸지 못했습니다. ${toUserError(e).message}`)
        }
        setAutostartRegistered(on)
        useAppStore.getState().updateWindowSettings({ autoStart: on })
      },
      setLayout(columns, rows) {
        useAppStore.getState().setLayout({ columns, rows })
      },
      removeHiddenButtons() {
        useAppStore.getState().removeHiddenButtons()
      },
      async cleanupIcons() {
        const data = useAppStore.getState().data
        const refs = collectIconReferences(data?.decks ?? [])
        try {
          return await cleanupIcons(refs.files, refs.paths)
        } catch (e) {
          throw new Error(`아이콘을 정리하지 못했습니다. ${toUserError(e).message}`)
        }
      },
      setTheme(mode) {
        const cur = useAppStore.getState().data?.settings.appearance
        useAppStore.getState().updateSettings({ appearance: { ...(cur ?? { theme: 'system' }), theme: mode } })
      },
      upsertSearchEngine(engine) {
        useAppStore.getState().upsertSearchEngine(engine)
      },
      removeSearchEngine(id) {
        useAppStore.getState().removeSearchEngine(id)
      },
    }),
    [],
  )

  if (status === 'loading') return <Centered>불러오는 중…</Centered>
  if (status === 'error' || !deck || !settings) return <Centered>데이터를 불러오지 못했습니다. {error}</Centered>

  if (view === 'settings') {
    return (
      <>
        <SettingsScreen settings={settings} deck={deck} autostartRegistered={autostartRegistered} actions={settingsActions} onClose={() => setView('deck')} />
        <Notice message={notice} onDismiss={dismiss} />
      </>
    )
  }

  const searchEngineName =
    search && search.button.action.type === 'search' ? (findSearchEngine(search.button.action.engine, settings)?.name ?? search.button.action.engine) : ''

  return (
    <>
      <DeckGrid
        deck={deck}
        onRun={handleRun}
        onAdd={handleAdd}
        onButtonContextMenu={handleContextMenu}
        popover={search ? { buttonId: search.button.id, id: SEARCH_POPOVER_ID } : null}
        menuButtonId={menu?.button.id ?? null}
        onMetrics={setMetrics}
      />
      <DeckFooter
        buttonCount={deck.buttons.length}
        hiddenCount={hiddenButtons(deck).length}
        metrics={metrics}
        saveStatus={saveStatus}
        onOpenSettings={openSettings}
      />

      {search && (
        <SearchPopover
          key={search.button.id}
          id={SEARCH_POPOVER_ID}
          anchor={search.anchor}
          engineName={searchEngineName}
          onSubmit={submitSearch}
          onClose={closeSearch}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            { label: '편집', onSelect: () => setEditor({ mode: 'edit', button: menu.button }) },
            { label: '삭제', danger: true, onSelect: () => setDeleting(menu.button) },
          ]}
        />
      )}

      {editor && <ButtonEditor target={editor} deck={deck} settings={settings} onSave={handleSave} onCancel={() => setEditor(null)} />}

      {deleting && (
        <ConfirmDialog
          title="버튼 삭제"
          message={`'${deleting.name}' 버튼을 삭제할까요? 이 자리는 빈 슬롯이 됩니다.`}
          confirmLabel="삭제"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {pendingRun && (
        <ConfirmDialog
          title={pendingRun.prompt.title}
          message={pendingRun.prompt.message}
          confirmLabel={pendingRun.prompt.confirmLabel}
          danger
          onConfirm={confirmRun}
          onCancel={() => setPendingRun(null)}
        />
      )}

      <Notice message={notice} onDismiss={dismiss} />
    </>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--qd-text-muted)' }}>{children}</div>
}
