import { useEffect, useState } from 'react'
import { acceleratorFromEvent, displayAccelerator, formatAccelerator, validateAccelerator } from '@/features/hotkeys/accelerator'
import ui from '@/styles/ui.module.css'
import styles from './settings.module.css'

interface Props {
  /** 현재 저장된 단축키 */
  current: string
  defaultAccelerator: string
  /** 새 조합을 등록해 본다. 성공하면 resolve, 실패하면 사용자 문구로 reject */
  onApply: (accelerator: string) => Promise<void>
}

type State = { mode: 'idle'; message?: { kind: 'ok' | 'error'; text: string } } | { mode: 'capturing'; preview: string | null; error: string | null } | { mode: 'applying' }

/**
 * 전역 단축키를 "눌러서" 등록한다.
 * 캡처 중에는 window keydown 을 캡처 단계에서 가로채 stopPropagation 하므로 덱 실행키가 반응하지 않는다.
 * Esc 는 취소. 수식키만 누른 상태는 미리보기만 갱신한다.
 */
export function HotkeyCapture({ current, defaultAccelerator, onApply }: Props) {
  const [state, setState] = useState<State>({ mode: 'idle' })

  useEffect(() => {
    if (state.mode !== 'capturing') return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setState({ mode: 'idle' })
        return
      }
      const accel = acceleratorFromEvent(e)
      if (!accel) {
        const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean).join(' + ')
        setState({ mode: 'capturing', preview: mods ? `${mods} + …` : null, error: null })
        return
      }
      const v = validateAccelerator(accel)
      if (!v.ok) {
        setState({ mode: 'capturing', preview: displayAccelerator(accel), error: v.reason })
        return
      }
      void apply(formatAccelerator(accel))
    }
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode])

  const apply = async (accel: string) => {
    if (accel === current) {
      setState({ mode: 'idle', message: { kind: 'ok', text: '이미 사용 중인 단축키입니다.' } })
      return
    }
    setState({ mode: 'applying' })
    try {
      await onApply(accel)
      setState({ mode: 'idle', message: { kind: 'ok', text: `${displayAccelerator(accel)} 로 변경했습니다.` } })
    } catch (e) {
      const text = e instanceof Error ? e.message : typeof e === 'string' ? e : ((e as { message?: string })?.message ?? '등록할 수 없는 단축키입니다.')
      setState({ mode: 'idle', message: { kind: 'error', text: `${text} 기존 단축키(${displayAccelerator(current)})를 유지합니다.` } })
    }
  }

  return (
    <div className={styles.hotkey}>
      <div className={ui.row}>
        <kbd className={`${ui.kbd} ${styles.kbdWide} ${state.mode === 'capturing' ? ui.kbdActive : ''}`} aria-live="polite">
          {state.mode === 'capturing' ? (state.preview ?? '새 단축키를 눌러주세요…') : displayAccelerator(current)}
        </kbd>
        {state.mode === 'capturing' ? (
          <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => setState({ mode: 'idle' })}>
            취소 (Esc)
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSmall}`}
              disabled={state.mode === 'applying'}
              onClick={() => setState({ mode: 'capturing', preview: null, error: null })}
            >
              단축키 변경
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSmall} ${ui.btnGhost}`}
              disabled={state.mode === 'applying' || current === defaultAccelerator}
              onClick={() => void apply(defaultAccelerator)}
              title={`기본값 ${displayAccelerator(defaultAccelerator)}`}
            >
              기본값
            </button>
          </>
        )}
      </div>
      {state.mode === 'capturing' && (
        <span className={state.error ? ui.error : ui.hint}>{state.error ?? 'Ctrl / Alt / Win 과 함께 키를 누르세요. 기능키(F1~F12)는 단독으로도 됩니다.'}</span>
      )}
      {state.mode === 'idle' && state.message && <span className={state.message.kind === 'error' ? ui.error : ui.hint}>{state.message.text}</span>}
    </div>
  )
}
