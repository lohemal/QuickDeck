import { useEffect, useState, type ReactNode } from 'react'
import type { Deck } from '@/model/deck'
import { LAYOUT_LIMITS, hiddenButtons } from '@/model/deck'
import { DEFAULT_HOTKEY, type CustomSearchEngine, type Settings, type ShowAt, type WindowSettings } from '@/model/settings'
import { appInfo, type AppInfo } from '@/ipc/storage'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { HotkeyCapture } from './HotkeyCapture'
import { SearchEngineManager } from './SearchEngineManager'
import { Segments } from '@/features/editor/fields'
import { Mascot } from '@/features/branding/Mascot'
import { THEME_LABELS, THEME_MODES, type ThemeMode } from '@/features/theme/theme'
import ui from '@/styles/ui.module.css'
import styles from './settings.module.css'

export interface SettingsActions {
  /** 새 전역 단축키를 등록해 보고 성공하면 저장한다. 실패 시 reject(사용자 문구) */
  changeHotkey: (accelerator: string) => Promise<void>
  updateWindow: (patch: Partial<WindowSettings>) => void
  /** 자동 실행 토글. 실제 등록에 실패하면 reject */
  setAutoStart: (on: boolean) => Promise<void>
  setLayout: (columns: number, rows: number) => void
  removeHiddenButtons: () => void
  /** 어떤 버튼도 참조하지 않는 관리 아이콘 파일 삭제. 삭제·유지 개수를 돌려준다 */
  cleanupIcons: () => Promise<{ removed: number; kept: number }>
  /** 테마 모드 변경 (즉시 적용·저장) */
  setTheme: (mode: ThemeMode) => void
  upsertSearchEngine: (engine: CustomSearchEngine) => void
  removeSearchEngine: (id: string) => void
}

interface Props {
  settings: Settings
  deck: Deck
  /** 실제 Windows 자동 시작 등록 상태 (설정값과 다를 수 있어 따로 보여준다) */
  autostartRegistered: boolean | null
  actions: SettingsActions
  onClose: () => void
}

/**
 * 덱 대신 표시되는 설정 화면(별도 창 없음). 변경은 즉시 적용·저장된다.
 * 열려 있는 동안 App 이 dialogOpen 으로 취급해 덱 실행키가 막힌다.
 */
export function SettingsScreen({ settings, deck, autostartRegistered, actions, onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [autoStartError, setAutoStartError] = useState<string | null>(null)
  const [confirmRemoveHidden, setConfirmRemoveHidden] = useState(false)
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)
  const w = settings.window
  const hidden = hiddenButtons(deck)

  const runCleanup = async () => {
    setCleanupMsg('정리 중…')
    try {
      const r = await actions.cleanupIcons()
      setCleanupMsg(r.removed > 0 ? `아이콘 파일 ${r.removed}개를 지웠습니다. (${r.kept}개 사용 중)` : `지울 파일이 없습니다. (${r.kept}개 사용 중)`)
    } catch (e) {
      setCleanupMsg((e as { message?: string })?.message ?? String(e))
    }
  }

  useEffect(() => {
    appInfo().then(setInfo).catch(() => setInfo(null))
  }, [])

  const toggleAutoStart = async (on: boolean) => {
    setAutoStartError(null)
    try {
      await actions.setAutoStart(on)
    } catch (e) {
      setAutoStartError((e as { message?: string })?.message ?? String(e))
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button type="button" className={`${ui.btn} ${ui.btnSmall} ${ui.btnGhost}`} onClick={onClose} aria-label="덱으로 돌아가기">
          ← 덱으로
        </button>
        <h1 className={styles.title}>설정</h1>
        <span className={styles.headerHint}>변경 사항은 바로 저장됩니다</span>
      </header>

      <div className={styles.body}>
        <Section title="호출">
          <Row label="전역 호출 단축키" hint="QuickDeck 이 숨겨져 있어도 이 키로 불러옵니다.">
            <HotkeyCapture current={settings.hotkey.accelerator} defaultAccelerator={DEFAULT_HOTKEY} onApply={actions.changeHotkey} />
            <span className={ui.hint}>
              일부 Windows 입력 환경에서는 Ctrl+Space 가 바탕화면에서 동작하지 않을 수 있습니다. 이 경우 Ctrl+Shift+Space 사용을 권장합니다.
            </span>
          </Row>
          <Row label="호출 위치">
            <select className={ui.select} value={w.showAt} onChange={(e) => actions.updateWindow({ showAt: e.target.value as ShowAt })}>
              <option value="cursor-monitor">현재 마우스가 있는 모니터 중앙</option>
              <option value="last-position">마지막 사용 위치</option>
            </select>
            <span className={ui.hint}>
              {w.showAt === 'last-position'
                ? w.lastBounds
                  ? `마지막 위치: (${w.lastBounds.x}, ${w.lastBounds.y}) · 크기 ${Math.round(w.lastBounds.width)}×${Math.round(w.lastBounds.height)}. 그 위치를 쓸 수 없으면 마우스 모니터 중앙에 표시합니다.`
                  : '아직 기록된 위치가 없어 처음에는 마우스 모니터 중앙에 표시합니다.'
                : '창 크기는 항상 기억하고, 위치는 부를 때마다 마우스가 있는 모니터 중앙으로 갑니다.'}
            </span>
          </Row>
        </Section>

        <Section title="창">
          <Toggle label="버튼 실행 후 QuickDeck 자동으로 숨기기" checked={w.hideAfterRun} onChange={(v) => actions.updateWindow({ hideAfterRun: v })} hint="볼륨·미디어 버튼은 연속 사용을 위해 켜져 있어도 숨기지 않습니다." />
          <Toggle label="QuickDeck 항상 위에 표시" checked={w.alwaysOnTop} onChange={(v) => actions.updateWindow({ alwaysOnTop: v })} />
          <Row label="창의 X 버튼을 눌렀을 때">
            <select className={ui.select} value={w.closeToTray ? 'tray' : 'quit'} onChange={(e) => actions.updateWindow({ closeToTray: e.target.value === 'tray' })}>
              <option value="tray">시스템 트레이로 숨기기</option>
              <option value="quit">QuickDeck 완전히 종료</option>
            </select>
          </Row>
          <Toggle
            label="Windows 시작 시 QuickDeck 자동 실행"
            checked={w.autoStart}
            onChange={(v) => void toggleAutoStart(v)}
            hint={
              autoStartError ??
              (autostartRegistered !== null && autostartRegistered !== w.autoStart
                ? `Windows 등록 상태(${autostartRegistered ? '등록됨' : '해제됨'})와 달라 설정값으로 맞춥니다.`
                : '자동 실행 시에는 창을 띄우지 않고 트레이에서 대기합니다. 단축키로 부르면 나타납니다.')
            }
            error={!!autoStartError}
          />
        </Section>

        <Section title="덱">
          <Row label="격자 크기 (열 × 행)">
            <div className={ui.row}>
              <input
                type="number"
                className={ui.input}
                style={{ width: 72 }}
                min={LAYOUT_LIMITS.minColumns}
                max={LAYOUT_LIMITS.maxColumns}
                value={deck.layout.columns}
                onChange={(e) => actions.setLayout(Number(e.target.value), deck.layout.rows)}
                aria-label="열 수"
              />
              <span>×</span>
              <input
                type="number"
                className={ui.input}
                style={{ width: 72 }}
                min={LAYOUT_LIMITS.minRows}
                max={LAYOUT_LIMITS.maxRows}
                value={deck.layout.rows}
                onChange={(e) => actions.setLayout(deck.layout.columns, Number(e.target.value))}
                aria-label="행 수"
              />
              <span className={ui.hint}>
                열 {LAYOUT_LIMITS.minColumns}~{LAYOUT_LIMITS.maxColumns}, 행 {LAYOUT_LIMITS.minRows}~{LAYOUT_LIMITS.maxRows}
              </span>
            </div>
            <span className={ui.hint}>기본 4×3 은 키보드의 1234 / QWER / ASDF 와 대응합니다.</span>
          </Row>
          {hidden.length > 0 && (
            <Row label={`격자 밖에 보존된 버튼 ${hidden.length}개`}>
              <span className={ui.hint}>{hidden.map((b) => `${b.name} (${b.position.row + 1}행 ${b.position.col + 1}열)`).join(', ')}</span>
              <span className={ui.hint}>행/열을 다시 늘리면 그 자리에 돌아옵니다. 필요 없으면 지울 수 있습니다.</span>
              <div>
                <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => setConfirmRemoveHidden(true)}>
                  격자 밖 버튼 삭제
                </button>
              </div>
            </Row>
          )}
        </Section>

        <Section title="화면">
          <Row label="테마" hint="시스템 설정을 고르면 Windows 의 라이트/다크 설정을 따르고, 바뀌면 바로 반영됩니다.">
            <Segments
              value={settings.appearance.theme}
              options={THEME_MODES.map((m) => ({ value: m, label: THEME_LABELS[m] }))}
              onChange={(theme) => actions.setTheme(theme)}
              ariaLabel="테마"
            />
          </Row>
        </Section>

        <Section title="검색 엔진">
          <SearchEngineManager settings={settings} deck={deck} onUpsert={actions.upsertSearchEngine} onRemove={actions.removeSearchEngine} />
        </Section>

        <Section title="아이콘 관리">
          <Row label="사용하지 않는 아이콘 정리" hint="프로그램·파일에서 추출했거나 사용자가 등록한 아이콘 중 어떤 버튼도 쓰지 않는 파일을 지웁니다. 다른 버튼이 쓰는 파일은 지우지 않습니다.">
            <div className={ui.row}>
              <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => void runCleanup()}>
                지금 정리
              </button>
              {cleanupMsg && <span className={ui.hint}>{cleanupMsg}</span>}
            </div>
          </Row>
        </Section>

        <Section title="정보">
          <div className={styles.about}>
            <Mascot size="md" />
            <div className={styles.aboutText}>
              <span className={styles.aboutName}>QuickDeck {info ? `v${info.version}` : ''}</span>
              <span className={ui.hint}>빠르게, 깔끔하게, 필요한 것을 바로 실행하는 개인용 데스크톱 컨트롤 덱</span>
              {info?.dataDir && <span className={ui.hint}>데이터: {info.dataDir}</span>}
            </div>
          </div>
        </Section>
      </div>

      {confirmRemoveHidden && (
        <ConfirmDialog
          title="격자 밖 버튼 삭제"
          message={`격자 밖에 보존된 버튼 ${hidden.length}개를 모두 삭제할까요?`}
          confirmLabel="삭제"
          danger
          onConfirm={() => {
            actions.removeHiddenButtons()
            setConfirmRemoveHidden(false)
          }}
          onCancel={() => setConfirmRemoveHidden(false)}
        />
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowBody}>
        {children}
        {hint && <span className={ui.hint}>{hint}</span>}
      </div>
    </div>
  )
}

function Toggle({ label, checked, hint, error, onChange }: { label: string; checked: boolean; hint?: string; error?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <span className={styles.toggleBody}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={error ? ui.error : ui.hint}>{hint}</span>}
      </span>
      <input type="checkbox" role="switch" aria-checked={checked} className={ui.switch} checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
