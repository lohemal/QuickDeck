import type { ReactNode } from 'react'
import type { BrowserChoice, SystemCommand } from '@/model/action'
import type { DisplayMode } from '@/model/deck'
import { SYSTEM_COMMAND_LABELS } from '@/features/actions/registry'
import { PRESET_SEARCH_ENGINES } from '@/features/actions/search'
import type { CustomSearchEngine } from '@/model/settings'
import ui from '@/styles/ui.module.css'

/* 편집 폼에서 쓰는 작은 입력 조각들 */

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className={ui.field}>
      <span className={ui.label}>{label}</span>
      {children}
      {error ? <span className={ui.error}>{error}</span> : hint ? <span className={ui.hint}>{hint}</span> : null}
    </div>
  )
}

export function Segments<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className={ui.segments} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`${ui.segment} ${o.value === value ? ui.segmentActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const BROWSER_OPTIONS: ReadonlyArray<{ value: BrowserChoice; label: string }> = [
  { value: 'default', label: '기본 브라우저' },
  { value: 'edge', label: 'Microsoft Edge' },
  { value: 'chrome', label: 'Google Chrome' },
]

export const DISPLAY_OPTIONS: ReadonlyArray<{ value: DisplayMode; label: string }> = [
  { value: 'icon-text', label: '아이콘 + 텍스트' },
  { value: 'icon', label: '아이콘만' },
  { value: 'text', label: '텍스트만' },
]

export function BrowserSelect({ value, onChange }: { value: BrowserChoice; onChange: (v: BrowserChoice) => void }) {
  return (
    <select className={ui.select} value={value} onChange={(e) => onChange(e.target.value as BrowserChoice)}>
      {BROWSER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function SystemCommandSelect({
  value,
  onChange,
  invalid,
}: {
  value: SystemCommand | ''
  onChange: (v: SystemCommand) => void
  invalid?: boolean
}) {
  const groups: Array<{ label: string; items: SystemCommand[] }> = [
    { label: '미디어', items: ['play-pause', 'prev-track', 'next-track', 'volume-up', 'volume-down', 'mute'] },
    { label: '전원·세션', items: ['lock-screen', 'sleep', 'log-off', 'restart', 'shutdown'] },
    { label: '도구', items: ['file-explorer', 'windows-settings', 'task-manager', 'screen-capture'] },
  ]
  return (
    <select
      className={`${ui.select} ${invalid ? ui.inputError : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value as SystemCommand)}
    >
      <option value="" disabled>
        기능을 선택하세요
      </option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((c) => (
            <option key={c} value={c}>
              {SYSTEM_COMMAND_LABELS[c]}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function SearchEngineSelect({
  value,
  custom,
  onChange,
}: {
  value: string
  custom: CustomSearchEngine[]
  onChange: (v: string) => void
}) {
  return (
    <select className={ui.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.values(PRESET_SEARCH_ENGINES).map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
      {custom.length > 0 && (
        <optgroup label="사용자 지정">
          {custom.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  )
}

/** 버튼이 들어갈 QuickDeck 폴더 선택 (루트 포함). 자기 자신·자손 폴더는 비활성 */
export function FolderSelect({
  value,
  options,
  invalid,
  onChange,
}: {
  value: string | null
  options: ReadonlyArray<{ id: string | null; label: string; disabled: boolean }>
  invalid?: boolean
  onChange: (parentId: string | null) => void
}) {
  const ROOT = '__root__'
  return (
    <select
      className={`${ui.select} ${invalid ? ui.inputError : ''}`}
      value={value ?? ROOT}
      aria-label="위치"
      onChange={(e) => onChange(e.target.value === ROOT ? null : e.target.value)}
    >
      {options.map((o) => (
        <option key={o.id ?? ROOT} value={o.id ?? ROOT} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** 경로 표시 + 선택 버튼 */
export function PathPicker({
  path,
  buttonLabel,
  placeholder,
  onPick,
}: {
  path: string
  buttonLabel: string
  placeholder: string
  onPick: () => void
}) {
  return (
    <div className={ui.row}>
      <span className={`${ui.path} ${ui.grow} ${path ? ui.pathSet : ''}`} title={path || undefined}>
        {path || placeholder}
      </span>
      <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={onPick}>
        {buttonLabel}
      </button>
    </div>
  )
}

/** 실행키 한 글자 입력. 비우면 "없음" */
export function HotkeyInput({ value, invalid, onChange }: { value: string; invalid?: boolean; onChange: (v: string) => void }) {
  return (
    <div className={ui.row}>
      <input
        className={`${ui.input} ${invalid ? ui.inputError : ''}`}
        style={{ width: 64, textAlign: 'center', fontWeight: 600 }}
        value={value}
        maxLength={1}
        placeholder="없음"
        onChange={(e) => onChange(e.target.value.slice(-1).toUpperCase())}
        onKeyDown={(e) => {
          // 글자 키를 누르면 기존 값을 바로 대체한다
          if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
            e.preventDefault()
            onChange(e.key.toUpperCase())
          }
        }}
        aria-label="실행키"
      />
      <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => onChange('')} disabled={!value}>
        없음
      </button>
    </div>
  )
}
