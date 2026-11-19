import { Modal } from './Modal'
import ui from '@/styles/ui.module.css'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  /** 처음 포커스를 [취소] 에 둔다 (Enter 한 번으로 되돌릴 수 없는 일이 일어나지 않게) */
  focusCancel?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = '확인', danger = false, focusCancel = false, onConfirm, onCancel }: Props) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={ui.btn} onClick={onCancel} autoFocus={focusCancel}>
            취소
          </button>
          <button type="button" className={`${ui.btn} ${danger ? ui.btnDanger : ui.btnPrimary}`} onClick={onConfirm} autoFocus={!focusCancel}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className={ui.text} style={{ whiteSpace: 'pre-line' }}>
        {message}
      </p>
    </Modal>
  )
}
