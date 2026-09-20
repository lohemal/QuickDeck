/**
 * 내장 아이콘 이름 목록 (순수 데이터 — Node 검사 스크립트에서도 읽는다).
 * 실제 그림은 builtin.tsx 가 Lucide(ISC) 아이콘에 연결한다. 이름은 저장 파일에 들어가므로 바꾸지 않는다.
 * 범용 기능 아이콘 위주로 구성하고 브랜드 로고는 넣지 않는다.
 */
export const BUILTIN_ICON_LABELS = {
  // 동작 종류 기본
  web: '웹',
  browser: '브라우저',
  program: '프로그램',
  file: '파일',
  folder: '폴더',
  search: '검색',
  // 시스템 기능
  settings: '설정',
  'volume-up': '볼륨 높이기',
  'volume-down': '볼륨 낮추기',
  mute: '음소거',
  play: '재생',
  pause: '일시정지',
  'play-pause': '재생/일시정지',
  previous: '이전',
  next: '다음',
  lock: '잠금',
  explorer: '탐색기',
  'task-manager': '작업 관리자',
  screenshot: '캡처',
  sleep: '절전',
  logout: '로그아웃',
  restart: '다시 시작',
  shutdown: '종료',
  // 문서·미디어
  document: '문서',
  spreadsheet: '스프레드시트',
  presentation: '프레젠테이션',
  pdf: 'PDF',
  image: '이미지',
  video: '동영상',
  music: '음악',
  archive: '압축',
  code: '코드',
  // 일반
  plus: '추가',
  terminal: '터미널',
  mail: '메일',
  calendar: '달력',
  clock: '시계',
  star: '별',
  heart: '하트',
  bookmark: '북마크',
  home: '홈',
  link: '링크',
  user: '사용자',
  monitor: '모니터',
  keyboard: '키보드',
  printer: '프린터',
  cloud: '클라우드',
  shield: '보안',
  bell: '알림',
  message: '메시지',
  phone: '전화',
  map: '지도',
  cart: '장바구니',
  game: '게임',
  database: '데이터베이스',
  wifi: 'Wi-Fi',
  zap: '번개',
  flag: '깃발',
  tag: '태그',
  trash: '휴지통',
  download: '다운로드',
  upload: '업로드',
  refresh: '새로고침',
  school: '학교',
  book: '책',
  pen: '펜',
  briefcase: '업무',
  layers: '레이어',
  sun: '해',
  sparkles: '반짝임',
} as const

export type BuiltinIconName = keyof typeof BUILTIN_ICON_LABELS

export const BUILTIN_ICON_NAMES = Object.keys(BUILTIN_ICON_LABELS) as BuiltinIconName[]

export function isBuiltinIconName(name: string): name is BuiltinIconName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_ICON_LABELS, name)
}
