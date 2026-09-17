import { Modal } from './Modal'
import ui from '@/styles/ui.module.css'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel = '확인', danger = false, onConfirm, onCancel }: Props) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={ui.btn} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={`${ui.btn} ${danger ? ui.btnDanger : ui.btnPrimary}`} onClick={onConfirm} autoFocus>
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
