import type { ProtectionReason } from '@/store/appStore'

interface Props {
  /** null 이면 읽기 자체가 실패한 경우 (권한·인코딩 등) */
  reason: ProtectionReason | null
  detail?: string | null
}

const TEXT: Record<ProtectionReason | 'read-error', { title: string; lines: string[] }> = {
  future: {
    title: '이 데이터는 더 새로운 버전의 QuickDeck에서 만들어졌습니다.',
    lines: ['데이터를 보호하기 위해 현재 버전에서는 열 수 없습니다.', '최신 버전의 QuickDeck을 설치해 주세요.'],
  },
  'backup-failed': {
    title: '저장된 데이터 파일을 읽을 수 없습니다.',
    lines: ['손상된 파일을 안전하게 보존하지 못해 아무것도 바꾸지 않았습니다.', '기존 파일은 그대로 남아 있습니다. QuickDeck을 다시 실행해 보세요.'],
  },
  'read-error': {
    title: '저장된 데이터를 불러오지 못했습니다.',
    lines: ['데이터를 보호하기 위해 아무것도 바꾸지 않았습니다.', 'QuickDeck을 다시 실행해 보세요.'],
  },
}

/**
 * 데이터 보호 화면. 이 화면이 떠 있는 동안 QuickDeck 은 저장 파일·자동 실행·단축키를 건드리지 않는다.
 * 파일 경로나 JSON 내용은 보여주지 않는다.
 */
export function DataProtectionScreen({ reason, detail }: Props) {
  const t = TEXT[reason ?? 'read-error']
  return (
    <div role="alert" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--qd-space-5)' }}>
      <div style={{ maxWidth: 420, display: 'grid', gap: 'var(--qd-space-3)', textAlign: 'center' }}>
        <strong style={{ fontSize: 'var(--qd-font-lg)', color: 'var(--qd-text-primary)' }}>{t.title}</strong>
        {t.lines.map((line) => (
          <span key={line} style={{ fontSize: 'var(--qd-font-md)', color: 'var(--qd-text-secondary)' }}>
            {line}
          </span>
        ))}
        {reason === null && detail ? <span style={{ fontSize: 'var(--qd-font-sm)', color: 'var(--qd-text-muted)' }}>{detail}</span> : null}
      </div>
    </div>
  )
}
