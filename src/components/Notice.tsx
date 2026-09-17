import { useEffect } from 'react'
import styles from './Notice.module.css'

export interface NoticeMessage {
  text: string
  kind: 'info' | 'error'
}

interface Props {
  message: NoticeMessage | null
  onDismiss: () => void
}

/** 화면 아래쪽에 잠깐 뜨는 안내문 (임시). 오류는 조금 더 오래 보여준다 */
export function Notice({ message, onDismiss }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, message.kind === 'error' ? 4000 : 2200)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (!message) return null
  return (
    <div className={`${styles.notice} ${message.kind === 'error' ? styles.error : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
      {message.text}
    </div>
  )
}
