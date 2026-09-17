/** Windows 경로의 마지막 요소. 끝의 구분자는 무시한다 */
export function basename(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const i = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  return i >= 0 ? trimmed.slice(i + 1) : trimmed
}

/** 확장자를 뗀 파일명. 숨김 파일(.gitignore 처럼 점으로 시작)은 그대로 둔다 */
export function stem(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(0, i) : fileName
}

/** 경로에서 버튼 이름으로 쓸 만한 문자열을 뽑는다 */
export function suggestNameFromPath(path: string, { keepExtension = false } = {}): string {
  const base = basename(path)
  return keepExtension ? base : stem(base)
}
