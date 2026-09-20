import { COLOR_ICON_PREFIX, type BuiltinIconName } from './builtinNames'

/**
 * 컬러 아이콘 팩 (SVG Repo, CC0 — THIRD_PARTY_NOTICES.md).
 * 개발 시 검토·정리한 SVG 문자열을 번들에 넣고(import.meta.glob ?raw) 그대로 그린다.
 * 사용자가 런타임에 올리는 SVG 가 아니라 저장소에 든 자산만 여기로 온다 (scripts/check-icons.ts 가 파일 존재를 확인).
 *
 * 정리 규칙(scratch 스크립트로 1회 변환, 원본은 손대지 않음):
 *  - xml 헤더·주석·width/height 제거, viewBox 만 유지
 *  - 어두운 회색 윤곽 → currentColor (라이트/다크 테마의 텍스트 색을 따른다)
 *  - 흰 면 → class="paper" (global.css 가 표면색으로 칠해 다크 테마에서 흰 종이가 튀지 않는다)
 */
const FILES = import.meta.glob('../../assets/icons/color/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SVG_BY_NAME: Record<string, string> = {}
for (const [path, svg] of Object.entries(FILES)) {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.svg$/, '')
  SVG_BY_NAME[name] = svg
}

export function isColorIcon(name: BuiltinIconName): boolean {
  return name.startsWith(COLOR_ICON_PREFIX)
}

export function hasColorIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SVG_BY_NAME, name)
}

/** 부모(.icon 등)가 크기를 정한다. display: contents 라 svg 가 부모의 직접 자식처럼 배치된다 */
export function ColorIcon({ name, className }: { name: BuiltinIconName; className?: string }) {
  const svg = SVG_BY_NAME[name]
  if (!svg) return null
  return <span className={`qd-color-icon ${className ?? ''}`} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
}
