import { useState } from 'react'
import type { Deck } from '@/model/deck'
import type { CustomSearchEngine, Settings } from '@/model/settings'
import { PRESET_SEARCH_ENGINES, QUERY_PLACEHOLDER, buttonsUsingEngine, validateSearchEngineInput } from '@/features/actions/search'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { newId } from '@/lib/id'
import ui from '@/styles/ui.module.css'
import styles from './settings.module.css'

interface Props {
  settings: Settings
  deck: Deck
  onUpsert: (engine: CustomSearchEngine) => void
  onRemove: (id: string) => void
}

type Form = { id: string | null; name: string; urlTemplate: string }

/**
 * 검색엔진 목록. 기본 3종은 읽기 전용, 사용자 지정은 추가·수정·삭제.
 * 삭제 보호: 버튼이 쓰고 있는 엔진은 지울 수 없고 어떤 버튼인지 알려준다(버튼을 먼저 고치거나 지워야 한다).
 */
export function SearchEngineManager({ settings, deck, onUpsert, onRemove }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState<{ field: 'name' | 'urlTemplate'; reason: string } | null>(null)
  const [removing, setRemoving] = useState<CustomSearchEngine | null>(null)
  const [blocked, setBlocked] = useState<{ engine: CustomSearchEngine; names: string[] } | null>(null)

  const startAdd = () => {
    setError(null)
    setForm({ id: null, name: '', urlTemplate: '' })
  }
  const startEdit = (e: CustomSearchEngine) => {
    setError(null)
    setForm({ id: e.id, name: e.name, urlTemplate: e.urlTemplate })
  }

  const submit = () => {
    if (!form) return
    const v = validateSearchEngineInput(form.name, form.urlTemplate)
    if (!v.ok) {
      setError({ field: v.field, reason: v.reason })
      return
    }
    onUpsert({ id: form.id ?? `custom-${newId()}`, name: v.name, urlTemplate: v.urlTemplate })
    setForm(null)
    setError(null)
  }

  const requestRemove = (e: CustomSearchEngine) => {
    const users = buttonsUsingEngine(deck, e.id)
    if (users.length > 0) setBlocked({ engine: e, names: users.map((b) => b.name) })
    else setRemoving(e)
  }

  return (
    <div>
      <ul className={styles.engineList}>
        {Object.values(PRESET_SEARCH_ENGINES).map((e) => (
          <li key={e.id} className={styles.engineItem}>
            <div className={styles.engineText}>
              <span className={styles.engineName}>{e.name}</span>
              <span className={styles.engineUrl} title={e.urlTemplate}>
                {e.urlTemplate}
              </span>
            </div>
            <span className={ui.hint}>기본</span>
          </li>
        ))}
        {settings.customSearchEngines.map((e) => (
          <li key={e.id} className={styles.engineItem}>
            <div className={styles.engineText}>
              <span className={styles.engineName}>{e.name}</span>
              <span className={styles.engineUrl} title={e.urlTemplate}>
                {e.urlTemplate}
              </span>
            </div>
            <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => startEdit(e)}>
              수정
            </button>
            <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => requestRemove(e)}>
              삭제
            </button>
          </li>
        ))}
      </ul>

      {form ? (
        <form
          className={styles.engineForm}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className={ui.field}>
            <span className={ui.label}>이름</span>
            <input
              className={`${ui.input} ${error?.field === 'name' ? ui.inputError : ''}`}
              value={form.name}
              placeholder="예: YouTube"
              autoFocus
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            {error?.field === 'name' && <span className={ui.error}>{error.reason}</span>}
          </div>
          <div className={ui.field}>
            <span className={ui.label}>검색 URL 템플릿</span>
            <input
              className={`${ui.input} ${error?.field === 'urlTemplate' ? ui.inputError : ''}`}
              value={form.urlTemplate}
              placeholder={`https://www.youtube.com/results?search_query=${QUERY_PLACEHOLDER}`}
              spellCheck={false}
              onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })}
            />
            <span className={error?.field === 'urlTemplate' ? ui.error : ui.hint}>
              {error?.field === 'urlTemplate' ? error.reason : `검색어가 들어갈 자리에 ${QUERY_PLACEHOLDER} 를 넣으세요.`}
            </span>
          </div>
          <div className={ui.row} style={{ justifyContent: 'flex-end' }}>
            <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={() => setForm(null)}>
              취소
            </button>
            <button type="submit" className={`${ui.btn} ${ui.btnSmall} ${ui.btnPrimary}`}>
              {form.id ? '저장' : '추가'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={startAdd}>
          + 검색엔진 추가
        </button>
      )}

      {removing && (
        <ConfirmDialog
          title="검색엔진 삭제"
          message={`'${removing.name}' 검색엔진을 삭제할까요?`}
          confirmLabel="삭제"
          danger
          onConfirm={() => {
            onRemove(removing.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
      {blocked && (
        <ConfirmDialog
          title="삭제할 수 없습니다"
          message={`'${blocked.engine.name}' 은(는) 다음 버튼이 사용 중입니다.\n${blocked.names.map((n) => `· ${n}`).join('\n')}\n\n해당 버튼의 검색엔진을 바꾸거나 버튼을 지운 뒤 다시 시도하세요.`}
          confirmLabel="확인"
          onConfirm={() => setBlocked(null)}
          onCancel={() => setBlocked(null)}
        />
      )}
    </div>
  )
}
