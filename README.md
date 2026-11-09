# QuickDeck

**Windows용 화면형 컨트롤 덱 (소프트웨어 Stream Deck / 런처).**
자주 쓰는 사이트·프로그램·파일·폴더·시스템 기능·검색을 버튼으로 등록해 두고, 전역 단축키로 덱을 불러 키 한 번으로 실행합니다. 하드웨어 장치 없이 키보드와 화면만으로 씁니다.

> **Windows 10/11 전용**입니다. 0.1.x 는 첫 공개 버전으로, 설치 파일에는 아직 코드 서명이 없습니다.

## 주요 기능

- **전역 단축키로 호출** — 기본 `Ctrl+Shift+Space`. 어떤 프로그램을 쓰고 있어도 덱이 커서가 있는 모니터(또는 마지막 위치)에 나타나고, 한 번 더 누르거나 `Esc`로 숨깁니다.
- **버튼 실행키** — 버튼마다 `1`~`0`, `Q`~`P`, `A`~`L`, `Z`~`M` 같은 한 글자 실행키를 붙입니다. 덱이 보일 때 그 키를 누르면 바로 실행됩니다(마우스 클릭도 됩니다).
- **8가지 동작**
  | 동작 | 설명 |
  |---|---|
  | Website | URL 열기 (기본 브라우저 / Edge / Chrome 선택) |
  | Program | 실행 파일 또는 바로가기(.lnk) 실행, 인자 지정 가능 |
  | File | 문서 등 파일을 연결 프로그램으로 열기 |
  | Windows Folder | 탐색기로 폴더 열기 |
  | System | 미디어 재생/이전/다음, 볼륨·음소거, 화면 잠금, 절전, 로그오프, 재시작, 종료, 탐색기, Windows 설정, 작업 관리자, 화면 캡처 |
  | Search | 검색어를 입력받아 Google / Naver / Bing 또는 직접 추가한 검색엔진으로 검색 |
  | QuickDeck Folder | 덱 안의 하위 덱. 폴더마다 실행키를 따로 쓰며 `Esc`로 상위로 돌아갑니다 |
  | Multi Action | 여러 동작을 순서대로 실행(단계별 대기 시간, 실패 시 중단/계속, 실행 중 취소) |
- **기존 창 활성화** — 이미 열려 있는 프로그램·폴더·Excel/Word 문서를 다시 누르면 새로 띄우지 않고 그 창을 앞으로 가져옵니다. 확실히 같은 창일 때만 활성화하고, 그렇지 않으면 평소처럼 실행합니다.
- **아이콘** — 등록한 프로그램·파일의 아이콘을 자동으로 추출하고, 내장 아이콘 113종(선 아이콘 70 + 컬러 아이콘 43) 또는 직접 고른 이미지도 쓸 수 있습니다.
- **배치와 테마** — 버튼을 드래그해 자리를 바꾸고, 격자 크기를 조절하며, 라이트/다크/시스템 테마를 고릅니다.
- **트레이 상주 · 자동 시작** — 창을 닫아도 트레이에 남아 단축키가 계속 동작합니다. Windows 로그인 시 자동 시작을 켤 수 있습니다. 이미 실행 중일 때 다시 실행하면 새 프로세스를 만들지 않고 기존 덱을 보여줍니다.

## 설치

1. GitHub **Releases** 페이지에서 최신 `QuickDeck_<버전>_x64-setup.exe` 를 내려받습니다.
2. 실행하면 현재 사용자 계정에만 설치됩니다(관리자 권한 불필요). 기존 버전 위에 그대로 덮어 설치할 수 있고 등록한 버튼은 유지됩니다.
3. 설치 파일은 **코드 서명이 없어** Windows SmartScreen 이 "Windows의 PC 보호" 경고를 띄울 수 있습니다. `추가 정보` → `실행` 을 누르면 계속 진행됩니다. 파일이 Releases 페이지에서 받은 것인지, 함께 적힌 SHA-256 이 일치하는지 확인하세요.

제거는 Windows 설정 → 앱에서 합니다. 제거 시 "앱 데이터 삭제" 를 체크하지 않으면 등록한 버튼과 아이콘은 남습니다.

## 기본 사용법

1. 설치 직후 덱이 뜹니다. 빈 칸(`+`)을 눌러 버튼을 만듭니다 — 이름, 동작 종류, 대상(URL·파일·폴더 등), 실행키, 아이콘을 정합니다.
2. 아무 데서나 `Ctrl+Shift+Space` 로 덱을 부르고, 실행키를 누르거나 버튼을 클릭합니다. 실행 후 덱을 자동으로 숨길지는 설정에서 고릅니다.
3. 버튼을 오른쪽 클릭하면 편집·삭제, 드래그하면 자리 이동(빈 칸으로 이동, 버튼끼리는 교환)입니다.
4. 설정(톱니바퀴)에서 단축키, 표시 위치, 창 닫기 동작(트레이로 숨김/종료), 자동 시작, 테마, 검색엔진을 바꿉니다.

## 데이터와 개인정보

- 등록한 버튼·설정은 **이 컴퓨터에만** 저장됩니다: `%APPDATA%\kr.lohemal.quickdeck\quickdeck.json` (아이콘은 같은 폴더의 `icons\`).
- 네트워크로 아무것도 보내지 않습니다. 계정·로그인·원격 동기화·사용 통계가 없습니다.
- 로그는 `%LOCALAPPDATA%\kr.lohemal.quickdeck\logs\` 에 남으며 실행한 동작의 종류 정도만 기록합니다.
- 백업은 위 폴더를 복사하면 됩니다. 데이터 파일은 사람이 읽을 수 있는 JSON 이고 버전이 올라가면 자동으로 변환됩니다.

## 알려진 제한사항

- Windows 전용입니다. macOS/Linux 빌드는 없습니다.
- 설치 파일이 서명되지 않아 SmartScreen 경고가 나옵니다.
- 바탕화면만 활성화된 상태에서는 Windows 가 일부 조합의 전역 단축키를 전달하지 않는 환경이 있습니다. 기본값 `Ctrl+Shift+Space` 는 이를 피해 정한 값이며, 설정에서 바꿀 수 있습니다.
- 기존 창 활성화는 프로그램(실행 파일 경로 기준), 탐색기 폴더, Excel/Word/PowerPoint 문서만 지원합니다. Windows 11 메모장·계산기 같은 Store 앱, PDF, 한글(HWP) 등은 평소처럼 다시 실행되며 보통 그 앱이 스스로 기존 창을 씁니다. 브라우저 탭은 감지하지 않습니다.
- 같은 이름의 파일이 다른 폴더에서 동시에 열려 있으면 구분할 수 없어 활성화하지 않습니다.
- 관리자 권한으로 실행된 프로그램의 창은 활성화 대상에서 빠집니다.
- 자동 업데이트는 없습니다. 새 버전은 Releases 에서 받아 덮어 설치합니다.

## 개발

- 스택: [Tauri 2](https://tauri.app) (Rust) + React 18 + TypeScript + Vite, 상태는 zustand, 아이콘은 [Lucide](https://lucide.dev) 와 SVG Repo 의 CC0 컬러 아이콘. Windows API 는 `windows` crate 로 직접 호출합니다.
- 요구 사항: Node.js 22 이상(`node --experimental-strip-types` 사용), Rust 안정판, Microsoft Edge WebView2 런타임(Windows 11 에는 기본 포함).

```bash
npm install
npm run app          # 개발 실행 (tauri dev, Vite 1430 포트)
npm run typecheck    # tsc --noEmit
npm run check        # 순수 로직 단위 검사 (scripts/check-*.ts)
cd src-tauri && cargo test
npm run app:build    # NSIS 설치 파일 → src-tauri/target/release/bundle/nsis/
```

- 설계 문서: [docs/01-설계안.md](docs/01-설계안.md), 개발 기록: [docs/02-개발-로드맵.md](docs/02-개발-로드맵.md)
- 제3자 아이콘 고지: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

임시 앱 아이콘 다시 만들기:

```bash
node scripts/make-placeholder-icon.mjs && npx tauri icon app-icon.png -o src-tauri/icons
```

## 라이선스

[MIT License](LICENSE) — Copyright (c) 2026 lohemal. 포함된 제3자 아이콘 자산의 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 를 참고하세요.
