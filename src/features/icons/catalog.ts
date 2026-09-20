// 내장 아이콘 카탈로그: 분류와 검색 (순수 데이터·로직 — Node 검사 스크립트에서도 읽는다)
import { BUILTIN_ICON_LABELS, BUILTIN_ICON_NAMES, type BuiltinIconName } from './builtinNames.ts'

export const ICON_CATEGORY_LABELS = {
  all: '전체',
  action: '동작·시스템',
  media: '문서·미디어',
  work: '업무·일정',
  people: '소통·사람',
  life: '생활·장소',
  device: '기기·기타',
} as const

export type IconCategory = keyof typeof ICON_CATEGORY_LABELS
export const ICON_CATEGORIES = Object.keys(ICON_CATEGORY_LABELS) as IconCategory[]

/** 모든 내장 아이콘의 분류. 빠진 이름이 없도록 검사 스크립트가 확인한다 */
export const ICON_CATEGORY: Record<BuiltinIconName, Exclude<IconCategory, 'all'>> = {
  // Lucide — 동작·시스템
  web: 'action',
  browser: 'action',
  program: 'action',
  file: 'action',
  folder: 'action',
  search: 'action',
  settings: 'action',
  'volume-up': 'action',
  'volume-down': 'action',
  mute: 'action',
  play: 'action',
  pause: 'action',
  'play-pause': 'action',
  previous: 'action',
  next: 'action',
  lock: 'action',
  explorer: 'action',
  'task-manager': 'action',
  screenshot: 'action',
  sleep: 'action',
  logout: 'action',
  restart: 'action',
  shutdown: 'action',
  plus: 'action',
  refresh: 'action',
  // Lucide — 문서·미디어
  document: 'media',
  spreadsheet: 'media',
  presentation: 'media',
  pdf: 'media',
  image: 'media',
  video: 'media',
  music: 'media',
  archive: 'media',
  code: 'media',
  book: 'media',
  pen: 'media',
  // Lucide — 업무·일정
  mail: 'work',
  calendar: 'work',
  clock: 'work',
  bookmark: 'work',
  briefcase: 'work',
  school: 'work',
  flag: 'work',
  tag: 'work',
  layers: 'work',
  database: 'work',
  // Lucide — 소통·사람
  user: 'people',
  message: 'people',
  phone: 'people',
  bell: 'people',
  heart: 'people',
  star: 'people',
  // Lucide — 생활·장소
  home: 'life',
  map: 'life',
  cart: 'life',
  game: 'life',
  sun: 'life',
  sparkles: 'life',
  // Lucide — 기기·기타
  terminal: 'device',
  monitor: 'device',
  keyboard: 'device',
  printer: 'device',
  cloud: 'device',
  shield: 'device',
  link: 'device',
  wifi: 'device',
  zap: 'device',
  trash: 'device',
  download: 'device',
  upload: 'device',
  // 컬러 팩 (SVG Repo, CC0)
  'color-search': 'action',
  'color-settings': 'action',
  'color-key': 'action',
  'color-article': 'media',
  'color-record': 'media',
  'color-pencil': 'media',
  'color-camera': 'media',
  'color-picture': 'media',
  'color-movie': 'media',
  'color-video': 'media',
  'color-headphones': 'media',
  'color-earphone': 'media',
  'color-microphone': 'media',
  'color-calendar': 'work',
  'color-schedule': 'work',
  'color-badge': 'work',
  'color-diagnosis': 'work',
  'color-toolbox': 'work',
  'color-savings': 'work',
  'color-tips': 'work',
  'color-wallet': 'work',
  'color-reminder': 'work',
  'color-chat': 'people',
  'color-qna': 'people',
  'color-broadcast': 'people',
  'color-account': 'people',
  'color-star': 'people',
  'color-food': 'life',
  'color-coffee': 'life',
  'color-gift': 'life',
  'color-cart': 'life',
  'color-shopping-bag': 'life',
  'color-store': 'life',
  'color-gas-station': 'life',
  'color-bus': 'life',
  'color-location': 'life',
  'color-weather': 'life',
  'color-feet': 'life',
  'color-coupon': 'life',
  'color-laptop': 'device',
  'color-monitor': 'device',
  'color-phone': 'device',
  'color-sim': 'device',
}

/**
 * 검색용 별칭. 라벨(한국어)과 이름(영어)은 자동으로 검색되므로 여기는 다른 표현만 적는다.
 * 예: "폴더" 와 "folder" 모두 folder 를 찾고, "메모" 로 color-record 를 찾는다.
 */
export const ICON_ALIASES: Partial<Record<BuiltinIconName, string[]>> = {
  web: ['website', 'globe', '인터넷', '홈페이지', '사이트'],
  browser: ['edge', 'chrome', '인터넷', '나침반'],
  program: ['app', 'application', '앱', '실행'],
  file: ['문서', 'document'],
  folder: ['directory', '디렉터리', '탐색기'],
  search: ['find', '찾기', '돋보기', 'google', 'naver'],
  settings: ['gear', '톱니', '환경설정', 'option'],
  'volume-up': ['sound', '소리', '음량'],
  'volume-down': ['sound', '소리', '음량'],
  mute: ['sound', '소리', '무음'],
  play: ['재생', 'media'],
  pause: ['멈춤', 'media'],
  'play-pause': ['media', '미디어'],
  previous: ['back', '이전 곡'],
  next: ['forward', '다음 곡'],
  lock: ['잠금 화면', '보안', 'security'],
  explorer: ['탐색기', '파일 탐색기', 'files'],
  'task-manager': ['작업', '프로세스', 'process', 'activity'],
  screenshot: ['캡처', '카메라', 'camera', 'capture'],
  sleep: ['절전', '달', 'moon'],
  logout: ['로그아웃', '로그오프', 'sign out'],
  restart: ['재시작', 'reboot'],
  shutdown: ['종료', '전원', 'power'],
  document: ['문서', 'word', 'hwp', '한글', 'text'],
  spreadsheet: ['엑셀', 'excel', '표', 'sheet'],
  presentation: ['파워포인트', 'powerpoint', 'ppt', '발표', '슬라이드'],
  image: ['사진', '그림', 'photo', 'picture'],
  video: ['영상', '동영상', 'movie', '영화'],
  music: ['노래', 'song', 'audio', '오디오'],
  archive: ['zip', '압축'],
  code: ['코딩', '개발', 'dev', 'programming'],
  plus: ['add', '더하기', 'new'],
  terminal: ['명령', 'cmd', 'powershell', 'shell', '콘솔'],
  mail: ['이메일', 'email', '편지', 'outlook'],
  calendar: ['일정', 'schedule', '날짜', 'date'],
  clock: ['시간', 'time', '알람'],
  star: ['즐겨찾기', 'favorite', '별표'],
  heart: ['좋아요', 'like', '사랑'],
  bookmark: ['즐겨찾기', 'favorite', '책갈피'],
  home: ['집', '홈', 'house'],
  link: ['url', '주소', '연결'],
  user: ['사용자', '계정', 'account', 'profile', '프로필', '사람'],
  monitor: ['화면', 'screen', 'display', '디스플레이'],
  keyboard: ['키보드', '자판'],
  printer: ['인쇄', 'print'],
  cloud: ['클라우드', 'drive', '드라이브'],
  shield: ['보안', 'security', '방패', '백신'],
  bell: ['알림', 'notification', '종'],
  message: ['메시지', 'chat', '채팅', '대화', '카톡'],
  phone: ['전화', 'call', '통화'],
  map: ['지도', '위치', 'location', 'pin'],
  cart: ['장바구니', 'shopping', '쇼핑', '구매'],
  game: ['게임', '게임패드', 'controller'],
  database: ['db', '데이터', 'data'],
  wifi: ['무선', '네트워크', 'network', '인터넷'],
  zap: ['번개', '빠름', 'fast', 'bolt', '전기'],
  flag: ['깃발', '표시', 'mark'],
  tag: ['태그', '라벨', 'label'],
  trash: ['휴지통', '삭제', 'delete', '쓰레기'],
  download: ['다운로드', '내려받기', '받기'],
  upload: ['업로드', '올리기'],
  refresh: ['새로고침', '갱신', 'reload', 'sync', '동기화'],
  school: ['학교', '학생', 'graduation', '졸업', '교육'],
  book: ['책', '독서', '읽기', 'read'],
  pen: ['펜', '쓰기', 'write', '메모', '필기'],
  briefcase: ['업무', '일', 'work', '가방', '출근'],
  layers: ['레이어', '층', 'stack'],
  sun: ['해', '태양', '낮', '밝게', 'light'],
  sparkles: ['반짝', '마법', 'magic', 'ai'],
  'color-search': ['find', '찾기', '돋보기', 'magnifier'],
  'color-settings': ['gear', '톱니', '환경설정', 'option'],
  'color-key': ['열쇠', '비밀번호', 'password', '잠금', 'lock', '보안'],
  'color-article': ['문서', 'document', '기사', '글', '페이지', 'page'],
  'color-record': ['기록', '메모', '노트', 'note', 'memo', '일지', '쓰기', 'write'],
  'color-pencil': ['연필', '수정', '편집', 'edit', '쓰기', 'write'],
  'color-camera': ['카메라', '사진', '촬영', 'photo', 'capture', '캡처'],
  'color-picture': ['사진', '이미지', '그림', 'image', 'photo', '앨범'],
  'color-movie': ['영화', '동영상', '영상', 'film', 'video', '클래퍼'],
  'color-video': ['동영상', '영상', '비디오', 'play', '재생'],
  'color-headphones': ['헤드폰', '음악', 'music', '헤드셋', 'headset'],
  'color-earphone': ['이어폰', '이어버드', 'earbuds', '음악', 'music'],
  'color-microphone': ['마이크', '노래', '녹음', 'mic', 'record', '음성', 'voice'],
  'color-calendar': ['달력', '캘린더', '일정', 'schedule', '날짜'],
  'color-schedule': ['일정', '스케줄', '달력', 'calendar', '체크', 'todo', '할 일', '계획'],
  'color-badge': ['명찰', '신분증', '사원증', '출입증', 'id', 'name tag'],
  'color-diagnosis': ['진단', '의료', '병원', '건강', 'health', 'medical', '십자', '보건'],
  'color-toolbox': ['도구', '공구', '도구 상자', 'tools', '수리'],
  'color-savings': ['저축', '저금통', '돼지', '돈', '예산', 'money', 'piggy', 'bank'],
  'color-tips': ['팁', '돈주머니', '보너스', '급여', 'money', 'bonus', 'salary'],
  'color-wallet': ['지갑', '카드', '결제', 'card', 'payment', 'pay'],
  'color-reminder': ['알림', '리마인더', '종', 'bell', 'alert', 'notification'],
  'color-chat': ['채팅', '대화', '메시지', 'message', '카톡', 'talk'],
  'color-qna': ['질문', '답변', '문의', '도움말', 'help', 'faq', 'question'],
  'color-broadcast': ['방송', '확성기', '공지', '안내', 'announce', 'megaphone', '알림'],
  'color-account': ['계정', '사용자', '프로필', 'user', 'profile', '사람', '회원'],
  'color-star': ['즐겨찾기', '별', '수집', 'favorite', 'collect', '별표'],
  'color-food': ['음식', '식사', '급식', '점심', '밥', 'meal', 'lunch', '식당'],
  'color-coffee': ['커피', '휴식', '카페', 'break', 'cafe', '음료'],
  'color-gift': ['선물', '이벤트', 'present', '행사'],
  'color-cart': ['장바구니', '쇼핑', '구매', 'shopping', '마트'],
  'color-shopping-bag': ['쇼핑', '쇼핑백', '가방', '구매', 'bag', 'shopping'],
  'color-store': ['상점', '가게', '매장', '홈', 'shop', 'home', 'market'],
  'color-gas-station': ['주유소', '주유', '연료', 'fuel', '차량', '자동차'],
  'color-bus': ['버스', '교통', '차량', '이동', '출퇴근', 'transport', 'vehicle', 'traffic'],
  'color-location': ['위치', '장소', '지도', 'map', 'pin', '핀'],
  'color-monitor': ['모니터', '화면', '통계', '차트', 'chart', 'screen', '그래프'],
  'color-laptop': ['노트북', '컴퓨터', 'computer', 'pc'],
  'color-phone': ['휴대폰', '전화', '스마트폰', 'mobile', '핸드폰'],
  'color-sim': ['심카드', '유심', 'sim', '통신'],
  'color-coupon': ['쿠폰', '티켓', '할인', 'ticket', '입장권'],
  'color-weather': ['날씨', '구름', '해', 'cloud', 'sun', '기상'],
  'color-feet': ['발자국', '발', '걷기', 'footprint', 'walk', '산책', '걸음'],
}

export interface IconCatalogEntry {
  name: BuiltinIconName
  label: string
  category: Exclude<IconCategory, 'all'>
  /** 검색에 쓰는 소문자 텍스트 (이름·라벨·별칭·분류 라벨) */
  haystack: string
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

export const ICON_CATALOG: IconCatalogEntry[] = BUILTIN_ICON_NAMES.map((name) => {
  const category = ICON_CATEGORY[name]
  const label = BUILTIN_ICON_LABELS[name]
  const words = [name, name.replace(/^color-/, ''), label, ICON_CATEGORY_LABELS[category], ...(ICON_ALIASES[name] ?? [])]
  return { name, label, category, haystack: normalize(words.join(' ')) }
})

/**
 * 단순 includes 검색. 공백으로 나눈 모든 단어가 들어 있어야 한다. 대소문자 무시.
 * 분류를 주면 그 분류 안에서만 찾는다.
 */
export function searchIcons(query: string, category: IconCategory = 'all'): IconCatalogEntry[] {
  const terms = normalize(query).split(' ').filter(Boolean)
  return ICON_CATALOG.filter((e) => (category === 'all' || e.category === category) && terms.every((t) => e.haystack.includes(t)))
}

export function isColorIconName(name: string): boolean {
  return name.startsWith('color-')
}
