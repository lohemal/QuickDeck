import { ChevronLeft } from 'lucide-react'
import type { DeckButton } from '@/model/deck'
import { ROOT_LABEL } from './folders'
import styles from './DeckBreadcrumb.module.css'

interface Props {
  /** 루트에서 현재 폴더까지 (folders.ts folderPath). 비어 있으면(루트) 아무것도 그리지 않는다 */
  path: DeckButton[]
  /** 상위 항목 클릭 → 그 폴더로 (루트 = null) */
  onNavigate: (folderId: string | null) => void
}

/**
 * 현재 위치 표시: "‹ QuickDeck › 학교업무 › 방과후". 루트에서는 렌더링하지 않으므로 기존 사용자의 화면은 그대로다.
 * 아주 얇은 한 줄이고, 긴 이름은 줄임표. 키보드 UX 의 기본은 Esc(상위 폴더)이고 이 막대는 마우스용 보조 수단이다.
 */
export function DeckBreadcrumb({ path, onNavigate }: Props) {
  if (path.length === 0) return null
  const parent = path.length >= 2 ? path[path.length - 2]!.id : null
  return (
    <nav className={styles.bar} aria-label="현재 폴더 위치">
      <button type="button" className={styles.back} onClick={() => onNavigate(parent)} title="상위 폴더로 (Esc)" aria-label="상위 폴더로">
        <ChevronLeft aria-hidden focusable={false} strokeWidth={2} />
      </button>
      <ol className={styles.crumbs}>
        <li className={styles.crumb}>
          <button type="button" className={styles.link} onClick={() => onNavigate(null)}>
            {ROOT_LABEL}
          </button>
        </li>
        {path.map((f, i) => {
          const last = i === path.length - 1
          return (
            <li key={f.id} className={styles.crumb}>
              <span className={styles.sep} aria-hidden>
                ›
              </span>
              {last ? (
                <span className={styles.current} aria-current="location" title={f.name}>
                  {f.name}
                </span>
              ) : (
                <button type="button" className={styles.link} onClick={() => onNavigate(f.id)} title={f.name}>
                  {f.name}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
