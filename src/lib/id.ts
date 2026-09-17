/** 버튼·덱 고유 ID. WebView2 에서는 crypto.randomUUID 를 항상 쓸 수 있다 */
export function newId(): string {
  return crypto.randomUUID()
}
