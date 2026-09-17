/**
 * Rust 오류(`AppError`)는 `{ message, detail }` 객체로 reject 된다.
 * message 는 사용자에게 그대로 보여주고, detail 은 콘솔에만 남긴다.
 * 다른 형태(문자열·Error)도 안전하게 문장으로 바꾼다.
 */
export interface UserError {
  message: string
  detail?: string
}

export function toUserError(e: unknown): UserError {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const { message, detail } = e as { message: string; detail?: unknown }
    return { message, detail: typeof detail === 'string' ? detail : undefined }
  }
  if (typeof e === 'string') return { message: e }
  return { message: '알 수 없는 오류가 발생했습니다.', detail: String(e) }
}
