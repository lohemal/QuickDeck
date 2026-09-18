import type { BrowserChoice } from './action'

/** 사용자 지정 검색엔진. urlTemplate 안의 {query} 가 인코딩된 검색어로 바뀐다 */
export interface CustomSearchEngine {
  id: string
  name: string
  urlTemplate: string
}

/**
 * 마지막 창 크기·위치.
 * - x, y: 창 바깥 좌상단의 **물리 px** (멀티모니터 절대 좌표)
 * - width, height: 창 안쪽 크기의 **논리 px** (DPI 가 다른 모니터로 가도 같은 체감 크기)
 */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** 전역 단축키·트레이로 열 때 창을 어디에 둘지 */
export type ShowAt = 'cursor-monitor' | 'last-position'

export interface WindowSettings {
  alwaysOnTop: boolean
  autoStart: boolean
  hideAfterRun: boolean
  /** X 버튼: true 면 트레이로 숨김, false 면 종료 */
  closeToTray: boolean
  showAt: ShowAt
  /** 사용자가 창을 움직이거나 크기를 바꾸면 Rust 가 알려주어 저장된다. 크기는 항상 복원, 위치는 showAt 에 따라 */
  lastBounds: WindowBounds | null
}

export interface HotkeySettings {
  enabled: boolean
  /** Tauri global-shortcut 형식 (예: "Ctrl+Shift+Space") */
  accelerator: string
}

/**
 * 신규 설치 기본 전역 호출 단축키.
 * 처음에는 Ctrl+Space 였으나, 실사용 환경에서 바탕화면(Explorer `Progman`)이 활성일 때
 * Ctrl+Space 가 RegisterHotKey 등록자에게 전달되지 않는 Windows 환경이 확인되어(2026-09-19)
 * Ctrl+Shift+Space 로 바꿨다. 저장된 사용자 설정에는 영향이 없다(기본값·"기본값 복원" 에만 쓰인다).
 */
export const DEFAULT_HOTKEY = 'Ctrl+Shift+Space'

export interface Settings {
  window: WindowSettings
  hotkey: HotkeySettings
  defaultBrowser: BrowserChoice
  defaultSearchEngine: string
  customSearchEngines: CustomSearchEngine[]
  /** 실험 기능: 캐릭터 등장/변신 애니메이션 (완전히 독립된 선택적 UI 레이어) */
  animationEnabled: boolean
}

export function createDefaultWindowSettings(): WindowSettings {
  // src-tauri/src/window.rs 의 WindowPrefs::default 와 같아야 한다
  return {
    alwaysOnTop: false,
    autoStart: false,
    hideAfterRun: true,
    closeToTray: true,
    showAt: 'cursor-monitor',
    lastBounds: null,
  }
}

export function createDefaultSettings(): Settings {
  return {
    window: createDefaultWindowSettings(),
    hotkey: { enabled: true, accelerator: DEFAULT_HOTKEY },
    defaultBrowser: 'default',
    defaultSearchEngine: 'google',
    customSearchEngines: [],
    animationEnabled: false,
  }
}
