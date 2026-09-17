import { useMemo, useState } from 'react'
import type { ActionType } from '@/model/action'
import type { Deck, DeckButton, Position } from '@/model/deck'
import type { Settings } from '@/model/settings'
import { ACTION_DEFINITIONS, definitionOf } from '@/features/actions/registry'
import { pickFile, pickFolder, pickProgram } from '@/ipc/dialog'
import { Modal } from '@/components/Modal'
import {
  createDraft,
  draftAction,
  draftFromButton,
  draftToButton,
  suggestNameForPath,
  suggestNameForSystem,
  validateDraft,
  withSuggestedName,
  type ButtonDraft,
  type DraftErrors,
} from './draft'
import {
  BrowserSelect,
  DISPLAY_OPTIONS,
  Field,
  HotkeyInput,
  PathPicker,
  SearchEngineSelect,
  Segments,
  SystemCommandSelect,
} from './fields'
import ui from '@/styles/ui.module.css'

export type EditorTarget = { mode: 'create'; position: Position } | { mode: 'edit'; button: DeckButton }

interface Props {
  target: EditorTarget
  deck: Deck
  settings: Settings
  onSave: (button: DeckButton) => void
  onCancel: () => void
}

const ACTION_TYPE_OPTIONS = (Object.keys(ACTION_DEFINITIONS) as ActionType[]).map((t) => ({
  value: t,
  label: ACTION_DEFINITIONS[t].label,
}))

/**
 * 버튼 추가/편집 다이얼로그. 추가·편집이 같은 화면을 쓰고, 편집이면 현재 값이 채워진다.
 * 동작 종류별 입력은 아래 ActionFields 가 담당한다.
 */
export function ButtonEditor({ target, deck, settings, onSave, onCancel }: Props) {
  const position = target.mode === 'create' ? target.position : target.button.position
  const editingId = target.mode === 'edit' ? target.button.id : undefined

  const [draft, setDraft] = useState<ButtonDraft>(() =>
    target.mode === 'edit'
      ? draftFromButton(target.button, settings.defaultBrowser, settings.defaultSearchEngine)
      : createDraft(position, deck, settings.defaultBrowser, settings.defaultSearchEngine),
  )
  const [submitted, setSubmitted] = useState(false)

  const errors: DraftErrors = useMemo(() => validateDraft(draft, deck, editingId), [draft, deck, editingId])
  // 저장을 한 번 눌러보기 전에는 실행키 중복처럼 즉시 알아야 하는 것만 보여준다
  const shown: DraftErrors = submitted ? errors : { hotkey: errors.hotkey }

  const update = (patch: Partial<ButtonDraft> | ((d: ButtonDraft) => ButtonDraft)) =>
    setDraft((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }))

  const submit = () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    onSave(draftToButton(draft, position, editingId))
  }

  const title =
    target.mode === 'edit' ? `버튼 편집 — ${target.button.name}` : `버튼 추가 — ${position.row + 1}행 ${position.col + 1}열`

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={ui.btn} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={submit}>
            {target.mode === 'edit' ? '저장' : '추가'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="동작 종류">
          <Segments value={draft.actionType} options={ACTION_TYPE_OPTIONS} onChange={(actionType) => update({ actionType })} />
        </Field>

        <ActionFields draft={draft} errors={shown} settings={settings} update={update} />

        <Field label="버튼 이름" error={shown.name}>
          <input
            className={`${ui.input} ${shown.name ? ui.inputError : ''}`}
            value={draft.name}
            placeholder="덱에 표시될 이름"
            onChange={(e) => update({ name: e.target.value, nameEdited: e.target.value.length > 0 })}
            autoFocus={target.mode === 'edit'}
          />
        </Field>

        <Field label="표시 방식">
          <Segments value={draft.display} options={DISPLAY_OPTIONS} onChange={(display) => update({ display })} />
        </Field>

        <Field label="실행키" error={shown.hotkey} hint="덱을 호출한 뒤 이 키를 누르면 실행됩니다">
          <HotkeyInput value={draft.hotkey} invalid={!!shown.hotkey} onChange={(hotkey) => update({ hotkey })} />
        </Field>

        <Field label="아이콘" hint="지금은 동작 종류별 임시 아이콘이 쓰입니다. 아이콘 선택은 이후 단계에서 제공됩니다.">
          <div className={ui.row}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{definitionOf(draftAction(draft)).placeholderGlyph}</span>
            <span className={ui.hint}>{ACTION_DEFINITIONS[draft.actionType].label} 기본 아이콘</span>
          </div>
        </Field>
        {/* Enter 로 제출되게 하는 숨은 submit */}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ── 동작 종류별 입력 ───────────────────────────────────────────── */

interface ActionFieldsProps {
  draft: ButtonDraft
  errors: DraftErrors
  settings: Settings
  update: (patch: Partial<ButtonDraft> | ((d: ButtonDraft) => ButtonDraft)) => void
}

function ActionFields({ draft, errors, settings, update }: ActionFieldsProps) {
  const pickPath = async (type: 'program' | 'file' | 'folder') => {
    const picker = type === 'program' ? pickProgram : type === 'file' ? pickFile : pickFolder
    const path = await picker()
    if (!path) return
    update((d) => withSuggestedName({ ...d, [type]: { path } }, suggestNameForPath(type, path)))
  }

  switch (draft.actionType) {
    case 'website':
      return (
        <>
          <Field label="URL" error={errors.url} hint="https:// 를 생략하면 자동으로 붙습니다">
            <input
              className={`${ui.input} ${errors.url ? ui.inputError : ''}`}
              value={draft.website.url}
              placeholder="https://example.com"
              inputMode="url"
              autoFocus
              onChange={(e) => update({ website: { ...draft.website, url: e.target.value } })}
            />
          </Field>
          <Field label="실행 브라우저">
            <BrowserSelect value={draft.website.browser} onChange={(browser) => update({ website: { ...draft.website, browser } })} />
          </Field>
        </>
      )
    case 'program':
      return (
        <Field label="프로그램" error={errors.path} hint=".exe 또는 바로가기(.lnk)">
          <PathPicker
            path={draft.program.path}
            buttonLabel="프로그램 선택"
            placeholder="선택된 프로그램 없음"
            onPick={() => void pickPath('program')}
          />
        </Field>
      )
    case 'file':
      return (
        <Field label="파일" error={errors.path} hint="Windows 기본 연결 프로그램으로 열립니다">
          <PathPicker path={draft.file.path} buttonLabel="파일 선택" placeholder="선택된 파일 없음" onPick={() => void pickPath('file')} />
        </Field>
      )
    case 'folder':
      return (
        <Field label="폴더" error={errors.path} hint="파일 탐색기로 열립니다">
          <PathPicker path={draft.folder.path} buttonLabel="폴더 선택" placeholder="선택된 폴더 없음" onPick={() => void pickPath('folder')} />
        </Field>
      )
    case 'system':
      return (
        <Field label="시스템 기능" error={errors.command}>
          <SystemCommandSelect
            value={draft.system.command}
            invalid={!!errors.command}
            onChange={(command) => update((d) => withSuggestedName({ ...d, system: { command } }, suggestNameForSystem(command)))}
          />
        </Field>
      )
    case 'search':
      return (
        <>
          <Field label="검색엔진">
            <SearchEngineSelect
              value={draft.search.engine}
              custom={settings.customSearchEngines}
              onChange={(engine) => update({ search: { ...draft.search, engine } })}
            />
          </Field>
          <Field label="실행 브라우저">
            <BrowserSelect value={draft.search.browser} onChange={(browser) => update({ search: { ...draft.search, browser } })} />
          </Field>
        </>
      )
  }
}
