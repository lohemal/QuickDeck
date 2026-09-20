/**
 * 관리 아이콘(추출 캐시·사용자 이미지) 파일 id 와 URL (순수 함수).
 * id 형식은 Rust icons::validate_file_id 와 같다: `extracted/e_….png` | `custom/c_….png`
 */
export const MANAGED_ICON_ID_PATTERN = /^(extracted|custom)\/[A-Za-z0-9_.-]+\.png$/

export function isManagedIconId(id: string): boolean {
  return MANAGED_ICON_ID_PATTERN.test(id) && !id.includes('..')
}

/**
 * Rust 의 `qdicon` 프로토콜 URL. Windows WebView2 에서 커스텀 스킴은 `http://<scheme>.localhost/` 로 노출된다.
 * 파일이 없으면 404 가 오고 <img onError> 에서 내장 아이콘으로 폴백한다.
 */
export function managedIconUrl(id: string): string {
  return `http://qdicon.localhost/${id}`
}
