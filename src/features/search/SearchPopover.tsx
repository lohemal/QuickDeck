import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computePopoverPosition, computePopoverWidth, type Placement } from './position'
import styles from './search.module.css'
import ui from '@/styles/ui.module.css'

interface Props {
  /** 팝오버가 붙는 검색 버튼 요소 */
  anchor: HTMLElement
  /** 접근성 연결용 id (버튼의 aria-controls 와 같아야 한다) */
  id: string
  engineName: string
  onSubmit: (query: string) => void
  onClose: () => void
}

/**
 * 검색 버튼 아래(공간이 없으면 위)에 겹쳐 뜨는 검색 입력 팝오버.
 * 덱 레이아웃에는 영향을 주지 않는다(position: fixed).
 *
 * - 열리면 입력란에 즉시 포커스, 닫히면 포커스를 검색 버튼으로 되돌린다
 *   (바깥 클릭으로 닫힐 때는 클릭한 곳이 포커스를 가져가므로 되돌리지 않는다)
 * - Enter: 검색어가 있으면 제출 / 비어 있으면 빈 상태 표시만 하고 유지
 * - Esc, 바깥 클릭(버튼 자신 제외): 닫기
 * - 매번 새로 마운트되므로 검색어는 항상 빈 상태로 시작한다
 *
 * 위치는 그리기 전(useLayoutEffect)에 DOM 에 직접 적용해 깜빡임과 "숨김 상태에서 focus 실패"를 피한다.
 * 창 크기 변경 후 격자가 다시 배치되는 것은 앵커 ResizeObserver 와 다음 프레임 재계산으로 따라간다.
 */
export function SearchPopover({ anchor, id, engineName, onSubmit, onClose }: Props) {
  const ref = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipRefocus = useRef(false)
  const [query, setQuery] = useState('')
  const [empty, setEmpty] = useState(false)
  const [placement, setPlacement] = useState<Placement>('below')

  const reposition = useCallback(() => {
    const el = ref.current
    if (!el || !anchor.isConnected) return
    const a = anchor.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const width = computePopoverWidth(a.width, viewport.width)
    el.style.width = `${width}px` // 너비를 먼저 적용해야 높이가 정확해진다
    const height = el.getBoundingClientRect().height
    const p = computePopoverPosition({ left: a.left, top: a.top, width: a.width, height: a.height }, { width, height }, viewport)
    el.style.left = `${p.left}px`
    el.style.top = `${p.top}px`
    setPlacement((prev) => (prev === p.placement ? prev : p.placement))
  }, [anchor])

  useLayoutEffect(() => {
    reposition()
    inputRef.current?.focus({ preventScroll: true })
  }, [reposition])

  useEffect(() => {
    const onResize = () => {
      reposition()
      requestAnimationFrame(reposition) // 격자가 새 치수로 다시 그려진 뒤 한 번 더
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(() => reposition())
    ro.observe(anchor)
    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
    }
  }, [anchor, reposition])

  // 닫힐 때 포커스가 body 로 떨어지지 않게 검색 버튼으로 되돌린다
  useEffect(() => {
    return () => {
      if (skipRefocus.current) return
      const active = document.activeElement
      if (active === null || active === document.body || ref.current?.contains(active)) {
        anchor.focus({ preventScroll: true })
      }
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.contains(t)) return
      skipRefocus.current = true
      onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [anchor, onClose])

  const submit = () => {
    const q = query.trim()
    if (!q) {
      setEmpty(true)
      inputRef.current?.focus()
      return
    }
    onSubmit(q)
  }

  return (
    <form
      ref={ref}
      id={id}
      role="search"
      aria-label={`${engineName} 검색`}
      className={`${styles.popover} ${placement === 'above' ? styles.above : styles.below}`}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <span className={styles.engine} aria-hidden>
        🔍 {engineName}
      </span>
      <input
        ref={inputRef}
        type="search"
        className={`${ui.input} ${styles.input} ${empty ? ui.inputError : ''}`}
        value={query}
        placeholder={`${engineName} 검색…`}
        aria-label={`${engineName} 검색어`}
        aria-invalid={empty || undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          if (empty && e.target.value.trim()) setEmpty(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
      />
    </form>
  )
}
