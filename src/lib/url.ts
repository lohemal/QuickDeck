/**
 * URL 기본 검사. 스킴이 없으면 https:// 를 붙여서 다시 시도한다.
 * 유효하면 정규화된 문자열을, 아니면 null 을 돌려준다. http/https 만 허용.
 */
export function normalizeHttpUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw || /\s/.test(raw)) return null
  const candidates = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? [raw] : [`https://${raw}`]
  for (const c of candidates) {
    try {
      const u = new URL(c)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      // 호스트에 점이 하나도 없으면(예: "abc") 오타로 본다. localhost 는 예외
      if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
      return u.toString()
    } catch {
      /* 다음 후보 */
    }
  }
  return null
}
