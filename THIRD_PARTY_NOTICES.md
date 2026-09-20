# 제3자 자산 고지 (THIRD_PARTY_NOTICES)

QuickDeck 배포본에 포함되는 제3자 아이콘 자산과 그 라이선스입니다. 코드 의존성(npm·crates)은 각 패키지의 라이선스를 따르며 여기서는 화면에 그려지는 자산만 다룹니다.

## Lucide (내장 선 아이콘 70개)

- 출처: https://lucide.dev (npm `lucide-react` 1.47.0)
- 라이선스: ISC
- 사용 위치: `src/features/icons/builtin.tsx` (이름별 import, 쓰는 아이콘만 번들)

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## SVG Repo 컬러 아이콘 43개 (`color-*`)

- 출처: https://www.svgrepo.com — 컬렉션 "SVG Vector", 업로더 SVG Repo
- 라이선스: **CC0 1.0 (Public Domain Dedication)** — 각 아이콘 페이지에 표기된 라이선스이며, 재배포·상업적 이용·변형에 제한이 없고 attribution 의무가 없습니다. SVG Repo 라이선스 안내: https://www.svgrepo.com/page/licensing/#CC0
- 확인 방법(2026-09-20): 아래 각 URL 의 다운로드 파일과 번들 원본이 바이트 단위로 동일함을 대조했습니다. 원작자 정보는 SVG Repo 페이지에 없으며(업로더 SVG Repo), 라이선스 근거는 배포자 표기입니다.
- 사용 위치: `src/assets/icons/color/*.svg` (`src/features/icons/colorPack.tsx` 가 로드)
- 변경 사항: xml 헤더·주석·고정 크기 제거, 어두운 회색 윤곽을 `currentColor` 로, 흰 면을 `class="paper"` 로 바꿔 라이트/다크 테마를 따르게 했습니다. 형태는 원본 그대로입니다.
- 감사 표기(선택): Vectors and icons by SVG Repo (https://www.svgrepo.com)

| QuickDeck 이름 | 원본 slug | 원본 페이지 |
|---|---|---|
| `color-calendar` | calendar | https://www.svgrepo.com/svg/530375/calendar |
| `color-chat` | chat-chat | https://www.svgrepo.com/svg/530377/chat-chat |
| `color-diagnosis` | diagnosis | https://www.svgrepo.com/svg/530382/diagnosis |
| `color-feet` | feet | https://www.svgrepo.com/svg/530390/feet |
| `color-food` | food | https://www.svgrepo.com/svg/530384/food |
| `color-headphones` | headphones-music | https://www.svgrepo.com/svg/530388/headphones-music |
| `color-key` | key-password | https://www.svgrepo.com/svg/530383/key-password |
| `color-search` | magnifying-glass-find-search | https://www.svgrepo.com/svg/530386/magnifying-glass-find-search |
| `color-microphone` | microphone-singing | https://www.svgrepo.com/svg/530389/microphone-singing |
| `color-movie` | movie | https://www.svgrepo.com/svg/530376/movie |
| `color-pencil` | pencil-revision | https://www.svgrepo.com/svg/530379/pencil-revision |
| `color-account` | personal-account-account | https://www.svgrepo.com/svg/530387/personal-account-account |
| `color-record` | record | https://www.svgrepo.com/svg/530380/record |
| `color-reminder` | reminder-alert | https://www.svgrepo.com/svg/530391/reminder-alert |
| `color-settings` | setting | https://www.svgrepo.com/svg/530381/setting |
| `color-cart` | shopping-cart | https://www.svgrepo.com/svg/530393/shopping-cart |
| `color-shopping-bag` | shopping | https://www.svgrepo.com/svg/530394/shopping |
| `color-store` | store-homepage-home | https://www.svgrepo.com/svg/530395/store-homepage-home |
| `color-toolbox` | toolbox | https://www.svgrepo.com/svg/530385/toolbox |
| `color-article` | article | https://www.svgrepo.com/svg/530244/article |
| `color-badge` | badge | https://www.svgrepo.com/svg/530245/badge |
| `color-broadcast` | broadcast | https://www.svgrepo.com/svg/530247/broadcast |
| `color-camera` | camera | https://www.svgrepo.com/svg/530226/camera |
| `color-wallet` | card-holder | https://www.svgrepo.com/svg/530232/card-holder |
| `color-phone` | cell-phone | https://www.svgrepo.com/svg/530225/cell-phone |
| `color-coffee` | coffee | https://www.svgrepo.com/svg/530227/coffee |
| `color-star` | collect | https://www.svgrepo.com/svg/530231/collect |
| `color-coupon` | coupons | https://www.svgrepo.com/svg/530240/coupons |
| `color-earphone` | earphone | https://www.svgrepo.com/svg/530242/earphone |
| `color-gas-station` | gas-station | https://www.svgrepo.com/svg/530230/gas-station |
| `color-gift` | gift | https://www.svgrepo.com/svg/530246/gift |
| `color-laptop` | laptop | https://www.svgrepo.com/svg/530234/laptop |
| `color-location` | location | https://www.svgrepo.com/svg/530236/location |
| `color-monitor` | monitor | https://www.svgrepo.com/svg/530229/monitor |
| `color-picture` | picture | https://www.svgrepo.com/svg/530248/picture |
| `color-qna` | question-and-answer | https://www.svgrepo.com/svg/530243/question-and-answer |
| `color-savings` | savings | https://www.svgrepo.com/svg/530249/savings |
| `color-schedule` | schedule | https://www.svgrepo.com/svg/530239/schedule |
| `color-sim` | sim-card | https://www.svgrepo.com/svg/530228/sim-card |
| `color-tips` | tips | https://www.svgrepo.com/svg/530241/tips |
| `color-bus` | transportation | https://www.svgrepo.com/svg/530235/transportation |
| `color-video` | video | https://www.svgrepo.com/svg/530237/video |
| `color-weather` | weather | https://www.svgrepo.com/svg/530233/weather |

원본 폴더 46개 중 팩 안에서 그림이 겹치는 3개(camera-take-pictures, 1번 picture, 2번 shopping)는 포함하지 않았습니다.
