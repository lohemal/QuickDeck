import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { HotkeySettings, WindowBounds, WindowSettings } from '@/model/settings'

/**
 * 창 표시/숨김·전역 단축키·창 설정 IPC. 실제 창 조작은 모두 Rust(window.rs)가 한다.
 * Tauri 밖(브라우저 미리보기)에서는 아무 일도 하지 않는다.
 */
export async function showDeck(): Promise<void> {
  if (isTauri()) await invoke('show_deck')
}

export async function hideDeck(): Promise<void> {
  if (isTauri()) await invoke('hide_deck')
}

export async function toggleDeck(): Promise<void> {
  if (isTauri()) await invoke('toggle_deck')
}

/**
 * Settings.hotkey 를 Rust 에 넘겨 전역 단축키를 (재)등록한다.
 * 실패하면 AppError 객체로 reject 되며, Rust 는 직전에 잘 등록되어 있던 단축키를 되살린다.
 */
export async function applyHotkey(hotkey: HotkeySettings): Promise<void> {
  if (isTauri()) await invoke('apply_hotkey', { enabled: hotkey.enabled, accelerator: hotkey.accelerator })
}

/** Settings.window 중 Rust 가 알아야 하는 값(항상 위, X 버튼 정책, 호출 위치, 마지막 bounds) */
export async function applyWindowPrefs(window: WindowSettings): Promise<void> {
  if (!isTauri()) return
  await invoke('apply_window_prefs', {
    prefs: {
      alwaysOnTop: window.alwaysOnTop,
      closeToTray: window.closeToTray,
      showAt: window.showAt,
      lastBounds: window.lastBounds,
    },
  })
}

export interface LaunchInfo {
  /** Windows 자동 시작으로 실행됨 → 창을 자동으로 띄우지 않는다 */
  autostart: boolean
}

export async function launchInfo(): Promise<LaunchInfo> {
  if (!isTauri()) return { autostart: false }
  return invoke<LaunchInfo>('launch_info')
}

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  if (!isTauri()) return () => {}
  let disposed = false
  let unlisten: (() => void) | null = null
  void listen<T>(event, (e) => handler(e.payload)).then((fn) => {
    if (disposed) fn()
    else unlisten = fn
  })
  return () => {
    disposed = true
    unlisten?.()
  }
}

/** Rust 가 창을 보이거나 숨길 때. 숨김 → 팝오버·메뉴 정리, 표시 → WebView 포커스 확보에 쓴다 */
export function onDeckVisibility(handler: (visible: boolean) => void): () => void {
  return subscribe<boolean>('deck-visibility', handler)
}

/** 사용자가 창을 움직이거나 크기를 바꾼 뒤(디바운스됨) Rust 가 보내는 마지막 bounds */
export function onDeckBounds(handler: (bounds: WindowBounds) => void): () => void {
  return subscribe<WindowBounds>('deck-bounds', handler)
}

export interface PlacementInfo {
  cursor: [number, number] | null
  monitors: Array<{
    name: string | null
    position: [number, number]
    size: [number, number]
    workArea: [number, number, number, number]
    scaleFactor: number
    containsCursor: boolean
  }>
  windowPosition: [number, number]
  windowSize: [number, number]
  windowScaleFactor: number
  visible: boolean
  focused: boolean
}

/** 진단용 */
export function deckPlacementInfo(): Promise<PlacementInfo> {
  return invoke<PlacementInfo>('deck_placement_info')
}
