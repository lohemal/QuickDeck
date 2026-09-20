/**
 * QuickDeck 마스코트 자리.
 *
 * 향후 작고 둥근 흰색 AI 로봇 캐릭터(짙은 face screen, cyan/mint 계열 눈)를 붙일 자리다.
 * 지금은 에셋이 없으므로 아무것도 그리지 않는다. 마스코트가 없어도 UI 는 완전해야 하며,
 * 메인 덱의 버튼 영역을 침범하거나 항상 크게 보이는 구조는 만들지 않는다.
 *
 * 쓰일 곳(후보): 설정 정보 섹션, 빈 덱 안내, 첫 실행 안내, 업데이트 완료, 오류가 아닌 친근한 안내.
 * 에셋을 넣을 때: src/assets/mascot/ 에 파일을 두고 아래 MASCOT_ASSET 에 import 한 URL 을 연결한다.
 */
export const MASCOT_ASSET: string | null = null

export type MascotSize = 'sm' | 'md'

const SIZE_PX: Record<MascotSize, number> = { sm: 28, md: 48 }

export function Mascot({ size = 'sm', className }: { size?: MascotSize; className?: string }) {
  if (!MASCOT_ASSET) return null
  const px = SIZE_PX[size]
  return <img src={MASCOT_ASSET} width={px} height={px} alt="" aria-hidden draggable={false} className={className} />
}
