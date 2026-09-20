/**
 * 테마 모델 (순수 함수 — Node 검사 스크립트에서도 읽는다).
 *
 * - 사용자 선택: 'system' | 'light' | 'dark' (settings.appearance.theme, 기본 'system')
 * - 실제 적용: 'light' | 'dark'. system 이면 OS 설정(prefers-color-scheme)을 따르고 OS 가 바뀌면 즉시 따라간다.
 * - 적용은 <html data-theme="light|dark"> 하나로 끝나며 색은 tokens.css 의 CSS 변수가 바뀐다 (DOM 재생성 없음).
 */
export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type ResolvedTheme = 'light' | 'dark'

export const DEFAULT_THEME_MODE: ThemeMode = 'system'

export const THEME_LABELS: Record<ThemeMode, string> = {
  system: '시스템 설정',
  light: '라이트',
  dark: '다크',
}

export function isThemeMode(v: unknown): v is ThemeMode {
  return typeof v === 'string' && (THEME_MODES as readonly string[]).includes(v)
}

/** 저장값이 이상하면 기본(system) 으로 */
export function normalizeThemeMode(v: unknown): ThemeMode {
  return isThemeMode(v) ? v : DEFAULT_THEME_MODE
}

/** 사용자 선택 + OS 다크 여부 → 실제 테마 */
export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode
  return systemPrefersDark ? 'dark' : 'light'
}
