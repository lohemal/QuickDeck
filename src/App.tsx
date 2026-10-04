import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { DeckButton, Position } from '@/model/deck'
import { buttonsIn } from '@/model/deck'
import { useActiveDeck, useAppStore } from '@/store/appStore'
import { DeckGrid } from '@/features/deck/DeckGrid'
import { DeckBreadcrumb } from '@/features/deck/DeckBreadcrumb'
import { folderPath, hiddenCountIn, parentFolderId, planDelete, resolveFolderId } from '@/features/deck/folders'
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
import { runMulti } from '@/features/actions/multiRunner'
import { summarizeStepAction } from '@/features/actions/multi'
import { findSearchEngine } from '@/features/actions/search'
import { toUserError } from '@/ipc/errors'
import { applyHotkey, applyWindowPrefs, deckPlacementInfo, hideDeck, launchInfo, onDeckBounds, onDeckVisibility, showDeck } from '@/ipc/window'
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

/** 진행 중인 다중 실행 (한 번에 하나). 취소 토큰과 현재 step 을 들고 있다 */
interface MultiRun {
  buttonId: string
  name: string
  /** 지금 실행 중인 step (1 부터) */
  step: number
  total: number
  controller: AbortController
}

const SEARCH_POPOVER_ID = 'deck-search-popover'

export default function App() {
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const saveStatus = useAppStore((s) => s.saveStatus)
  const load = useAppStore((s) => s.load)
  const deck = useActiveDeck()
  const settings = useAppStore((s) => s.data?.settings ?? null)

  const [view, setView] = useState<View>('deck')
  // ── QuickDeck 폴더 탐색 상태 (저장하지 않음). 루트 = null.
  // ref 는 키 입력 핸들러가 재렌더를 기다리지 않고 바로 새 폴더의 매핑을 쓰게 한다 (E → Q 연속 입력)
  const [folderId, setFolderIdState] = useState<string | null>(null)
  const folderRef = useRef<string | null>(null)
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
  // ── 다중 실행 상태. ref 는 비동기 러너가 최신 상태를 보게, state 는 푸터 표시용
  const [multiRun, setMultiRun] = useState<MultiRun | null>(null)
  const multiRunRef = useRef<MultiRun | null>(null)
  /** 덱이 숨겨진 동안 생긴 다중 실행 오류. 다음에 덱이 보일 때 한 번 보여준다 (강제로 덱을 띄우지 않는다) */
  const pendingNotice = useRef<NoticeMessage | null>(null)

  const dialogOpen = editor !== null || deleting !== null || pendingRun !== null
  /** 설정 화면이 열려 있으면 덱 실행키를 막는다 (다이얼로그와 같은 취급) */
  const hotkeysBlocked = dialogOpen || view !== 'deck'

  const dismiss = useCallback(() => setNotice(null), [])
  /** 폴더 이동(루트 = null). 열려 있던 검색창·메뉴는 닫는다. 덱은 숨기지 않고 Rust 도 부르지 않는다 */
  const navigate = useCallback((id: string | null) => {
    folderRef.current = id
    setFolderIdState(id)
    setSearch(null)
    setMenu(null)
  }, [])
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
          // 새로 호출될 때는 항상 루트에서 시작한다 (전역 단축키 → 실행키 위치가 매번 같아야 하므로)
          navigate(null)
          window.focus()
          if (pendingNotice.current) {
            setNotice(pendingNotice.current)
            pendingNotice.current = null
          }
          if (isTextInputFocused()) (document.activeElement as HTMLElement | null)?.blur()
        } else {
          setSearch(null)
          setMenu(null)
        }
      }),
    [],
  )
  useEffect(() => onDeckBounds((bounds) => useAppStore.getState().updateWindowSettings({ lastBounds: bounds })), [])

  // 보고 있던 폴더가 삭제되었거나 폴더가 아니게 되면 루트로 (데이터 변경 뒤 정합성)
  useEffect(() => {
    if (!deck) return
    const resolved = resolveFolderId(deck, folderRef.current)
    if (resolved !== folderRef.current) navigate(resolved)
  }, [deck, navigate])

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

  /** 덱이 보이면 바로, 숨겨져 있으면 다음에 보일 때 알린다 */
  const notifyLater = useCallback(async (msg: NoticeMessage) => {
    let visible = true
    try {
      visible = (await deckPlacementInfo()).visible
    } catch {
      /* 정보를 못 얻으면 바로 보여준다 */
    }
    if (visible) setNotice(msg)
    else pendingNotice.current = msg
  }, [])

  /**
   * 다중 실행 시작. 전체를 하나의 동작으로 본다: 설정(hideAfterRun)이 켜져 있으면 시작 즉시 숨기고 백그라운드에서 계속한다.
   * 한 번에 하나만 실행한다 (같은 버튼 → "이미 실행 중", 다른 버튼 → "다른 다중 실행이 진행 중"). 일반 버튼은 영향 없다.
   */
  const startMulti = useCallback(
    (button: DeckButton) => {
      if (!settings || button.action.type !== 'multi') return
      const current = multiRunRef.current
      if (current) {
        setNotice({ kind: 'info', text: current.buttonId === button.id ? `'${current.name}' 이(가) 이미 실행 중입니다.` : `다른 다중 실행('${current.name}')이 진행 중입니다.` })
        return
      }
      const controller = new AbortController()
      const run: MultiRun = { buttonId: button.id, name: button.name, step: 1, total: button.action.steps.length, controller }
      multiRunRef.current = run
      setMultiRun(run)
      if (shouldHideAfterRun(button, settings)) hideDeck().catch((e) => console.warn('[QuickDeck] 숨기기 실패:', toUserError(e).detail))
      const action = button.action
      void runMulti(action, controller.signal, {
        execute: async (step) => {
          await runAction(step, { settings })
        },
        describeError: (e) => toUserError(e).message,
        onProgress: (index, total) => {
          const next = { ...run, step: index + 1, total }
          multiRunRef.current = next
          setMultiRun(next)
        },
      })
        .then((result) => {
          if (result.status === 'invalid') {
            void notifyLater({ kind: 'error', text: `'${button.name}': 실행하지 않았습니다. ${result.invalidReason}` })
          } else if (result.failures.length > 0) {
            const f = result.failures[0]!
            const where = `${f.index + 1}번 '${summarizeStepAction(f.step.action).title}'`
            const rest = result.status === 'stopped' ? ' 이후 동작은 실행하지 않았습니다.' : result.failures.length > 1 ? ` 외 ${result.failures.length - 1}개 실패.` : ''
            void notifyLater({ kind: 'error', text: `'${button.name}' ${where} 실패: ${f.message}${rest}` })
          }
          // 성공·취소는 조용히 끝난다
        })
        .catch((e) => {
          void notifyLater({ kind: 'error', text: `'${button.name}' 실행 중 오류: ${toUserError(e).message}` })
        })
        .finally(() => {
          if (multiRunRef.current?.controller === controller) {
            multiRunRef.current = null
            setMultiRun(null)
          }
        })
    },
    [settings],
  )

  /** 취소: 아직 실행하지 않은 다음 step 을 실행하지 않는다 (이미 실행된 프로그램은 그대로) */
  const cancelMulti = useCallback(() => {
    multiRunRef.current?.controller.abort()
  }, [])

  /** 버튼 실행 진입점 (마우스 클릭·실행키 공통). anchor 는 검색 팝오버가 붙을 요소 */
  const handleRun = useCallback(
    (button: DeckButton, anchor: HTMLButtonElement) => {
      // QuickDeck 폴더: 실행이 아니라 그 폴더 안으로 이동 (덱 유지, hideAfterRun 무관, Rust 호출 없음)
      if (button.action.type === 'deck-folder') {
        navigate(button.id)
        return
      }
      if (button.action.type === 'search') {
        setSearch((cur) => (cur?.button.id === button.id ? null : { button, anchor }))
        return
      }
      setSearch(null)
      // 다중 실행: 순차 실행기로 (step 마다 기존 실행 경로를 쓴다)
      if (button.action.type === 'multi') {
        startMulti(button)
        return
      }
      const prompt = dangerPromptFor(button.action)
      if (prompt) setPendingRun({ button, prompt })
      else void execute(button)
    },
    [execute, navigate, startMulti],
  )

  // ── 실행키 / Esc ──
  const handleHotkey = useCallback(
    (button: DeckButton) => {
      const find = () => document.querySelector<HTMLButtonElement>(`[data-button-id="${button.id}"]`)
      const el = find()
      if (el) {
        handleRun(button, el)
        return
      }
      // 폴더 이동 직후 아직 그려지기 전에 다음 키가 왔다면 다음 프레임에 한 번 더 찾는다 (입력을 버리지 않는다)
      requestAnimationFrame(() => {
        const again = find()
        if (again) handleRun(button, again)
      })
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
    // QuickDeck 폴더 안이면 상위 폴더로. 루트에서만 덱을 숨긴다
    if (folderRef.current !== null && deck) {
      navigate(parentFolderId(deck, folderRef.current))
      return
    }
    hideDeck().catch((e) => console.warn('[QuickDeck] 숨기기 실패:', toUserError(e).detail))
  }, [dialogOpen, view, search, menu, deck, navigate])

  useDeckHotkeys({ deck, dialogOpen: hotkeysBlocked, folderRef, onHotkey: handleHotkey, onEscape: handleEscape })

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
    setEditor({ mode: 'create', position, parentId: folderRef.current })
  }, [])

  /** 드래그 배치: 빈 슬롯이면 이동, 버튼이면 교환. drop 한 번에 한 번 저장된다 */
  const handleMove = useCallback((buttonId: string, target: Position) => {
    useAppStore.getState().moveButton(buttonId, target)
  }, [])

  /** 드래그가 시작되면 열려 있던 검색창·메뉴는 닫는다 (버튼이 움직이므로) */
  const handleDragStart = useCallback(() => {
    setSearch(null)
    setMenu(null)
  }, [])

  const handleContextMenu = useCallback((button: DeckButton, e: MouseEvent) => {
    setSearch(null)
    setMenu({ button, x: e.clientX, y: e.clientY })
  }, [])

  const handleSave = useCallback((button: DeckButton) => {
    useAppStore.getState().upsertButton(button)
    setEditor(null)
  }, [])

  /** 삭제 요청. 버튼이 들어 있는 폴더는 삭제하지 않는다 (자식 자동 삭제 없음) */
  const requestDelete = useCallback(
    (button: DeckButton) => {
      if (!deck) return
      const plan = planDelete(deck, button.id)
      if (!plan.ok) {
        if (plan.reason === 'folder-not-empty') {
          setNotice({ kind: 'info', text: `'${button.name}' 폴더 안에 버튼 ${plan.count}개가 있어 삭제할 수 없습니다. 먼저 안의 버튼을 옮기거나 삭제하세요.` })
        }
        return
      }
      setDeleting(button)
    },
    [deck],
  )

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
      <DeckBreadcrumb path={folderPath(deck, folderId)} onNavigate={navigate} />
      <DeckGrid
        deck={deck}
        folderId={folderId}
        onRun={handleRun}
        onAdd={handleAdd}
        onButtonContextMenu={handleContextMenu}
        onMove={handleMove}
        onDragStart={handleDragStart}
        dragDisabled={dialogOpen || menu !== null}
        popover={search ? { buttonId: search.button.id, id: SEARCH_POPOVER_ID } : null}
        menuButtonId={menu?.button.id ?? null}
        onMetrics={setMetrics}
      />
      <DeckFooter
        buttonCount={buttonsIn(deck, folderId).length}
        inFolder={folderId !== null}
        hiddenCount={hiddenCountIn(deck, folderId)}
        multiRun={multiRun ? { name: multiRun.name, step: multiRun.step, total: multiRun.total } : null}
        onCancelMulti={cancelMulti}
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
            { label: '삭제', danger: true, onSelect: () => requestDelete(menu.button) },
          ]}
        />
      )}

      {editor && <ButtonEditor target={editor} deck={deck} settings={settings} onSave={handleSave} onCancel={() => setEditor(null)} />}

      {deleting && (
        <ConfirmDialog
          title="버튼 삭제"
          message={`'${deleting.name}' ${deleting.action.type === 'deck-folder' ? '폴더' : '버튼'}를 삭제할까요? 이 자리는 빈 슬롯이 됩니다.`}
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
