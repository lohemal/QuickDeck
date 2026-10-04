import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { BrowserChoice, MultiFailurePolicy, MultiStep, MultiStepAction } from '@/model/action'
import {
  MULTI_DELAY_PRESETS_MS,
  MULTI_FAILURE_POLICIES,
  MULTI_FAILURE_POLICY_LABELS,
  MULTI_MAX_DELAY_MS,
  MULTI_MAX_STEPS,
  MULTI_SAFE_SYSTEM_COMMANDS,
  MULTI_STEP_TYPES,
  formatDelay,
  stepRejectReason,
  summarizeStepAction,
} from '@/features/actions/multi'
import { ACTION_DEFINITIONS } from '@/features/actions/registry'
import { pickFile, pickFolder, pickProgram } from '@/ipc/dialog'
import { createStep, moveStep, type DraftErrors } from './draft'
import { BrowserSelect, Field, PathPicker, Segments, SystemCommandSelect } from './fields'
import ui from '@/styles/ui.module.css'
import styles from './MultiStepsEditor.module.css'

interface Props {
  steps: MultiStep[]
  failurePolicy: MultiFailurePolicy
  errors: DraftErrors
  defaultBrowser: BrowserChoice
  onChange: (patch: { steps?: MultiStep[]; failurePolicy?: MultiFailurePolicy }) => void
}

const STEP_TYPE_OPTIONS = MULTI_STEP_TYPES.map((t) => ({ value: t, label: ACTION_DEFINITIONS[t].label }))

/**
 * 다중 실행의 step 목록 편집. 모든 변경은 ButtonEditor 의 draft 에만 반영되고 [저장] 때 한 번에 기록된다.
 * - 카드 머리: 번호 · 제목(이름/호스트/기능) · 종류 · 대기 시간. 누르면 펼쳐져 내용(URL/경로/기능/브라우저)을 고친다
 * - 순서는 ↑↓ 버튼 (덱의 P8 드래그와 섞이지 않게 드래그는 쓰지 않는다)
 * - 삭제는 즉시 (draft 라 [취소] 로 되돌릴 수 있다)
 * - [+ 동작 추가]: 허용 종류만 고를 수 있고, 새 step 은 펼친 상태로 추가된다
 */
export function MultiStepsEditor({ steps, failurePolicy, errors, defaultBrowser, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const setSteps = (next: MultiStep[]) => onChange({ steps: next })
  const patchStep = (id: string, patch: Partial<MultiStep>) => setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const patchAction = (id: string, action: MultiStepAction) => patchStep(id, { action })

  const add = (type: MultiStepAction['type']) => {
    const step = createStep(type, defaultBrowser)
    setSteps([...steps, step])
    setOpen(step.id)
    setAdding(false)
  }

  const pickPath = async (step: MultiStep, type: 'program' | 'file' | 'folder') => {
    const picker = type === 'program' ? pickProgram : type === 'file' ? pickFile : pickFolder
    const path = await picker()
    if (!path) return
    patchAction(step.id, { type, path } as MultiStepAction)
  }

  const full = steps.length >= MULTI_MAX_STEPS

  return (
    <div className={styles.root}>
      <Field label={`동작 순서 (${steps.length}/${MULTI_MAX_STEPS})`} error={errors.multi} hint={steps.length === 0 ? '위에서 아래 순서로 실행됩니다. 아래에서 동작을 추가하세요.' : undefined}>
        {steps.length > 0 && (
          <ol className={styles.list}>
            {steps.map((step, i) => {
              const sum = summarizeStepAction(step.action)
              const err = errors.steps?.[step.id]
              const rejected = stepRejectReason(step.action)
              const expanded = open === step.id
              return (
                <li key={step.id} className={`${styles.card} ${err ? styles.cardError : ''}`}>
                  <div className={styles.head}>
                    <span className={styles.index} aria-hidden>
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      className={styles.summary}
                      onClick={() => setOpen(expanded ? null : step.id)}
                      aria-expanded={expanded}
                      title={sum.detail || sum.title}
                    >
                      <span className={styles.title}>{sum.title}</span>
                      <span className={styles.meta}>
                        {sum.kind}
                        {i < steps.length - 1 && step.delayAfterMs > 0 ? ` · 실행 후 ${formatDelay(step.delayAfterMs)} 대기` : ''}
                      </span>
                    </button>
                    <div className={styles.tools}>
                      <button type="button" className={styles.tool} disabled={i === 0} onClick={() => setSteps(moveStep(steps, i, -1))} aria-label={`${i + 1}번 동작 위로`} title="위로">
                        <ArrowUp aria-hidden focusable={false} />
                      </button>
                      <button type="button" className={styles.tool} disabled={i === steps.length - 1} onClick={() => setSteps(moveStep(steps, i, 1))} aria-label={`${i + 1}번 동작 아래로`} title="아래로">
                        <ArrowDown aria-hidden focusable={false} />
                      </button>
                      <button type="button" className={`${styles.tool} ${styles.toolDanger}`} onClick={() => setSteps(steps.filter((s) => s.id !== step.id))} aria-label={`${i + 1}번 동작 삭제`} title="삭제">
                        <Trash2 aria-hidden focusable={false} />
                      </button>
                    </div>
                  </div>
                  {err && <div className={ui.error}>{err}</div>}
                  {expanded && !rejected && (
                    <div className={styles.body}>
                      <StepFields step={step} onAction={(a) => patchAction(step.id, a)} onPick={(t) => void pickPath(step, t)} />
                      {i < steps.length - 1 && (
                        <Field label="실행 후 대기" hint="다음 동작으로 넘어가기 전에 기다리는 시간입니다. 프로그램이 뜰 시간이 필요하면 1~3초를 주세요.">
                          <DelaySelect value={step.delayAfterMs} onChange={(ms) => patchStep(step.id, { delayAfterMs: ms })} />
                        </Field>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </Field>

      {adding ? (
        <Field label="추가할 동작 종류">
          <div className={styles.addRow}>
            <Segments value={'' as MultiStepAction['type']} options={STEP_TYPE_OPTIONS} onChange={add} ariaLabel="추가할 동작 종류" />
            <button type="button" className={`${ui.btn} ${ui.btnGhost} ${ui.btnSmall}`} onClick={() => setAdding(false)}>
              취소
            </button>
          </div>
        </Field>
      ) : (
        <button type="button" className={`${ui.btn} ${ui.btnSmall}`} disabled={full} onClick={() => setAdding(true)} title={full ? `동작은 최대 ${MULTI_MAX_STEPS}개까지입니다` : undefined}>
          + 동작 추가
        </button>
      )}

      <Field label="실패 시" hint={failurePolicy === 'stop' ? '어떤 동작이 실패하면 거기서 멈춥니다.' : '실패한 동작은 건너뛰고(대기 없이) 다음 동작을 계속합니다.'}>
        <Segments
          value={failurePolicy}
          options={MULTI_FAILURE_POLICIES.map((p) => ({ value: p, label: MULTI_FAILURE_POLICY_LABELS[p] }))}
          onChange={(failurePolicy) => onChange({ failurePolicy })}
          ariaLabel="실패 시"
        />
      </Field>
    </div>
  )
}

function StepFields({ step, onAction, onPick }: { step: MultiStep; onAction: (a: MultiStepAction) => void; onPick: (t: 'program' | 'file' | 'folder') => void }) {
  const a = step.action
  switch (a.type) {
    case 'website':
      return (
        <>
          <Field label="URL" hint="https:// 를 생략하면 자동으로 붙습니다">
            <input className={ui.input} value={a.url} placeholder="https://example.com" inputMode="url" autoFocus onChange={(e) => onAction({ ...a, url: e.target.value })} />
          </Field>
          <Field label="실행 브라우저">
            <BrowserSelect value={a.browser} onChange={(browser) => onAction({ ...a, browser })} />
          </Field>
        </>
      )
    case 'program':
      return (
        <Field label="프로그램" hint=".exe 또는 바로가기(.lnk)">
          <PathPicker path={a.path} buttonLabel="프로그램 선택" placeholder="선택된 프로그램 없음" onPick={() => onPick('program')} />
        </Field>
      )
    case 'file':
      return (
        <Field label="파일">
          <PathPicker path={a.path} buttonLabel="파일 선택" placeholder="선택된 파일 없음" onPick={() => onPick('file')} />
        </Field>
      )
    case 'folder':
      return (
        <Field label="Windows 폴더" hint="파일 탐색기로 열립니다">
          <PathPicker path={a.path} buttonLabel="폴더 선택" placeholder="선택된 폴더 없음" onPick={() => onPick('folder')} />
        </Field>
      )
    case 'system':
      return (
        <Field label="시스템 기능" hint="절전·로그아웃·다시 시작·종료·화면 잠금은 다중 실행에 넣을 수 없습니다">
          <SystemCommandSelect value={a.command} allowed={MULTI_SAFE_SYSTEM_COMMANDS} onChange={(command) => onAction({ type: 'system', command })} />
        </Field>
      )
  }
}

/** 대기 시간: 보기 선택 + 직접 입력(초). 저장은 ms 정수 */
function DelaySelect({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const preset = MULTI_DELAY_PRESETS_MS.includes(value)
  return (
    <div className={ui.row}>
      <select className={ui.select} value={preset ? String(value) : 'custom'} onChange={(e) => e.target.value !== 'custom' && onChange(Number(e.target.value))} aria-label="실행 후 대기">
        {MULTI_DELAY_PRESETS_MS.map((ms) => (
          <option key={ms} value={ms}>
            {formatDelay(ms)}
          </option>
        ))}
        <option value="custom">직접 입력</option>
      </select>
      <input
        type="number"
        className={ui.input}
        style={{ width: 88 }}
        min={0}
        max={MULTI_MAX_DELAY_MS / 1000}
        step={0.1}
        value={value / 1000}
        aria-label="대기 시간(초)"
        onChange={(e) => {
          const sec = Number(e.target.value)
          if (!Number.isFinite(sec)) return
          onChange(Math.min(MULTI_MAX_DELAY_MS, Math.max(0, Math.round(sec * 1000))))
        }}
      />
      <span className={ui.hint}>초 (최대 {MULTI_MAX_DELAY_MS / 1000}초)</span>
    </div>
  )
}
