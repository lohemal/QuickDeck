import { useEffect, useState } from 'react'
import { resolveTheme, type ResolvedTheme, type ThemeMode } from './theme'

const QUERY = '(prefers-color-scheme: dark)'

/** <html data-theme> 를 한 곳에서만 만진다 */
function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement
  if (root.dataset.theme !== theme) root.dataset.theme = theme
}

/**
 * 설정의 테마 모드를 실제 테마로 계산해 <html data-theme> 에 적용한다.
 * system 모드일 때만 OS 변경(matchMedia change)을 구독하고, 명시 선택이면 OS 변경을 무시한다.
 * 설정을 아직 못 읽었으면(undefined) 아무것도 하지 않아 tokens.css 의 OS 폴백이 유지된다.
 */
export function useTheme(mode: ThemeMode | undefined): ResolvedTheme | undefined {
  const [resolved, setResolved] = useState<ResolvedTheme | undefined>(undefined)

  useEffect(() => {
    if (!mode) return
    const mq = window.matchMedia(QUERY)
    const update = () => {
      const next = resolveTheme(mode, mq.matches)
      applyResolvedTheme(next)
      setResolved(next)
    }
    update()
    if (mode !== 'system') return
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [mode])

  return resolved
}
