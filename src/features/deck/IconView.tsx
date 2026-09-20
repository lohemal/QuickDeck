import { useState } from 'react'
import type { DeckButton } from '@/model/deck'
import { BuiltinIcon } from '@/features/icons/builtin'
import type { BuiltinIconName } from '@/features/icons/builtinNames'
import { autoShellSource, resolveIcon, type ResolvedIcon } from '@/features/icons/auto'
import { managedIconUrl } from '@/features/icons/managed'
import { useExtractedIcon } from '@/features/icons/extractCache'
import styles from './deck.module.css'

/**
 * 버튼 아이콘. 크기는 부모 CSS 변수(--icon)가 정하고, 여기서는 무엇을 그릴지만 정한다.
 * 아이콘은 장식 계층이라 어떤 실패(파일 없음·손상·추출 실패)도 내장 아이콘 폴백으로 끝나며 실행과 무관하다.
 * 아이콘이 '없음' 이면 null 을 돌려주어 자리를 차지하지 않는다.
 */
export function IconView({ button }: { button: DeckButton }) {
  const extracted = useExtractedIcon(autoShellSource(button))
  const resolved = resolveIcon(button, extracted)
  if (resolved.kind === 'none') return null
  return (
    <span className={styles.icon} aria-hidden>
      <IconGlyph resolved={resolved} />
    </span>
  )
}

/** 해석된 아이콘 한 조각 (편집기 미리보기에서도 쓴다) */
export function IconGlyph({ resolved }: { resolved: ResolvedIcon }) {
  switch (resolved.kind) {
    case 'none':
      return null
    case 'builtin':
      return <BuiltinIcon name={resolved.name} />
    case 'managed':
      return <ManagedImage key={resolved.file} file={resolved.file} fallback={resolved.fallback} />
  }
}

function ManagedImage({ file, fallback }: { file: string; fallback: BuiltinIconName }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <BuiltinIcon name={fallback} />
  return <img src={managedIconUrl(file)} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />
}
