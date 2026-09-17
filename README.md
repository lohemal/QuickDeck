# QuickDeck

하드웨어 Stream Deck 없이 쓰는 Windows 화면형 컨트롤 덱. 자주 쓰는 사이트·프로그램·파일·폴더·시스템 기능·검색을 버튼으로 등록해 빠르게 실행한다.

- 설계: [docs/01-설계안.md](docs/01-설계안.md)
- 로드맵: [docs/02-개발-로드맵.md](docs/02-개발-로드맵.md)

## 개발

```bash
npm install
npm run app          # tauri dev (Vite 1430 포트)
npm run typecheck    # tsc --noEmit
cd src-tauri && cargo test
npm run app:build    # NSIS 설치 파일
```

데이터 파일: `%APPDATA%\kr.lohemal.quickdeck\quickdeck.json`

임시 앱 아이콘 다시 만들기:

```bash
node scripts/make-placeholder-icon.mjs && npx tauri icon app-icon.png -o src-tauri/icons
```
