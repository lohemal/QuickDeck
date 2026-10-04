import { useMemo, useState } from 'react'
import type { Action } from '@/model/action'
import type { IconRef } from '@/model/deck'
import type { BuiltinIconName } from './builtinNames'
import { ICON_CATEGORIES, ICON_CATEGORY_LABELS, searchIcons, type IconCategory } from './catalog'
import { BuiltinIcon } from './builtin'
import { autoShellSource, resolveIcon } from './auto'
import { useExtractedIcon } from './extractCache'
import { IconGlyph } from '@/features/deck/IconView'
import { pickImage } from '@/ipc/dialog'
import { importImage } from '@/ipc/icons'
import { toUserError } from '@/ipc/errors'
import { Segments } from '@/features/editor/fields'
import ui from '@/styles/ui.module.css'
import styles from './IconPicker.module.css'

type Mode = 'auto' | 'builtin' | 'image' | 'none'

const MODE_OPTIONS: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'auto', label: '자동' },
  { value: 'builtin', label: '내장 아이콘' },
  { value: 'image', label: '사용자 이미지' },
  { value: 'none', label: '없음' },
]

interface Props {
  icon: IconRef
  /** 현재 편집 중인 동작 (자동 아이콘 미리보기·폴백 계산용) */
  action: Action
  onChange: (icon: IconRef) => void
}

/**
 * 버튼 편집기의 아이콘 선택. 왼쪽에 실제 버튼과 같은 방식으로 그린 미리보기, 오른쪽에 방식 선택.
 * - 자동: 동작에 따라 결정 (프로그램·파일은 셸 아이콘을 추출해 미리보기에 바로 반영)
 * - 내장 아이콘: 격자에서 선택
 * - 사용자 이미지: 파일을 고르면 Rust 가 검증·축소해 관리 폴더에 복사하고, 그 사본을 미리보기로 보여준다
 * - 없음: 아이콘을 그리지 않는다
 */
export function IconPicker({ icon, action, onChange }: Props) {
  const [mode, setMode] = useState<Mode>(modeOf(icon))
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<IconCategory>('all')
  const results = useMemo(() => searchIcons(query, category), [query, category])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewButton = { icon, action }
  const extracted = useExtractedIcon(autoShellSource(previewButton))
  const resolved = resolveIcon(previewButton, extracted)

  const selectMode = (m: Mode) => {
    setMode(m)
    setError(null)
    if (m === 'auto') onChange({ kind: 'auto' })
    else if (m === 'none') onChange({ kind: 'none' })
    else if (m === 'builtin' && icon.kind !== 'builtin') onChange({ kind: 'builtin', name: defaultBuiltin(action) })
    // image: 파일을 고르기 전까지는 이전 아이콘을 유지한다
  }

  const chooseImage = async () => {
    setError(null)
    const path = await pickImage()
    if (!path) return
    setBusy(true)
    try {
      const r = await importImage(path)
      onChange({ kind: 'image', file: r.file })
    } catch (e) {
      setError(toUserError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.picker}>
      <div className={styles.top}>
        <div className={styles.preview} aria-label="아이콘 미리보기">
          {resolved.kind === 'none' ? <span className={styles.previewEmpty}>없음</span> : <IconGlyph resolved={resolved} />}
        </div>
        <div className={styles.modes}>
          <Segments value={mode} options={MODE_OPTIONS} onChange={selectMode} />
          <span className={ui.hint}>{hintFor(mode, action)}</span>
        </div>
      </div>

      {mode === 'builtin' && (
        <div className={styles.library}>
          <div className={styles.libraryBar}>
            <input
              type="search"
              className={`${ui.input} ${styles.search}`}
              value={query}
              placeholder="아이콘 검색 (예: 폴더, folder, 커피)"
              aria-label="아이콘 검색"
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className={styles.categories} role="radiogroup" aria-label="아이콘 분류">
              {ICON_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={category === c}
                  className={`${styles.category} ${category === c ? styles.categoryActive : ''}`}
                  onClick={() => setCategory(c)}
                >
                  {ICON_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          {results.length === 0 ? (
            <div className={styles.noResult}>일치하는 아이콘이 없습니다.</div>
          ) : (
            <div className={styles.grid} role="listbox" aria-label="내장 아이콘">
              {results.map(({ name, label }) => {
                const selected = icon.kind === 'builtin' && icon.name === name
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    title={label}
                    aria-label={label}
                    className={`${styles.cell} ${selected ? styles.cellSelected : ''}`}
                    onClick={() => onChange({ kind: 'builtin', name })}
                  >
                    <BuiltinIcon name={name} />
                  </button>
                )
              })}
            </div>
          )}
          <span className={ui.hint}>
            {results.length}개{query || category !== 'all' ? ' 일치' : ''} · 이름·한국어·영어로 찾을 수 있습니다
          </span>
        </div>
      )}

      {mode === 'image' && (
        <div className={styles.imageRow}>
          <button type="button" className={`${ui.btn} ${ui.btnSmall}`} disabled={busy} onClick={() => void chooseImage()}>
            {busy ? '등록 중…' : icon.kind === 'image' ? '다른 이미지 선택' : '이미지 선택'}
          </button>
          <span className={error ? ui.error : ui.hint}>{error ?? 'PNG, JPG, WebP, ICO · 10MB 이하 · 256px 로 줄여 복사됩니다'}</span>
        </div>
      )}
    </div>
  )
}

function modeOf(icon: IconRef): Mode {
  switch (icon.kind) {
    case 'auto':
      return 'auto'
    case 'builtin':
      return 'builtin'
    case 'image':
      return 'image'
    case 'extracted':
      return 'auto' // 추출 결과를 직접 가리키는 저장값은 화면에서는 '자동' 으로 취급
    case 'none':
      return 'none'
  }
}

function defaultBuiltin(action: Action): BuiltinIconName {
  return resolveIcon({ icon: { kind: 'auto' }, action }, null).kind === 'builtin'
    ? (resolveIcon({ icon: { kind: 'auto' }, action }, null) as { name: BuiltinIconName }).name
    : 'file'
}

function hintFor(mode: Mode, action: Action): string {
  if (mode === 'auto') {
    switch (action.type) {
      case 'program':
        return action.path ? '프로그램의 아이콘을 사용합니다.' : '프로그램을 선택하면 그 아이콘을 사용합니다.'
      case 'file':
        return action.path ? 'Windows 가 이 파일에 표시하는 아이콘을 사용합니다.' : '파일을 선택하면 그 아이콘을 사용합니다.'
      case 'folder':
        return '폴더 아이콘을 사용합니다.'
      case 'website':
        return '웹 아이콘을 사용합니다.'
      case 'search':
        return '검색 아이콘을 사용합니다.'
      case 'system':
        return '기능에 맞는 아이콘을 사용합니다.'
      case 'deck-folder':
        return '폴더 아이콘을 사용합니다.'
    }
  }
  if (mode === 'builtin') return '기본(선) 아이콘과 컬러 아이콘 중에서 고르세요.'
  if (mode === 'image') return '내 컴퓨터의 이미지를 아이콘으로 씁니다.'
  return '아이콘을 표시하지 않습니다.'
}
