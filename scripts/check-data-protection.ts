// 저장 파일 불러오기 판정(src/model/load.ts)의 데이터 보호 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-data-protection.ts
import assert from 'node:assert/strict'
import { SCHEMA_VERSION } from '../src/model/appData.ts'
import { planLoad, resolveLoad, stripBom, type LoadIo, type LoadOutcome } from '../src/model/load.ts'

const v5 = {
  schemaVersion: SCHEMA_VERSION,
  settings: { window: { autoStart: true, alwaysOnTop: true }, hotkey: { enabled: true, accelerator: 'Alt+Q' } },
  decks: [
    {
      id: 'd1',
      name: '내 덱',
      layout: { columns: 4, rows: 3 },
      buttons: [
        { id: 'b1', position: { row: 0, col: 0 }, name: '네이버', action: { type: 'website', url: 'https://naver.com/', browser: 'default' }, icon: { kind: 'auto' }, hotkey: '1', display: 'icon-text', parentId: null },
      ],
    },
  ],
  activeDeckId: 'd1',
}
const v5Text = JSON.stringify(v5, null, 2)

/**
 * 가짜 데이터 폴더. appStore.load 와 같은 순서로 동작한다:
 * resolveLoad → ready 이고 save 면 저장 / protected 면 아무것도 쓰지 않음.
 * autostart 는 "ready 인 data 의 설정으로만" 동기화된다 (App.tsx 의 자동 실행 동기화 effect 와 같은 조건)
 */
class FakeDisk {
  file: string | null
  backups = new Map<string, string>()
  saves = 0
  runRegistered: boolean
  backupFails = false
  constructor(file: string | null, runRegistered = true) {
    this.file = file
    this.runRegistered = runRegistered
  }
  io(): LoadIo {
    return {
      readText: async () => this.file,
      backupCorrupt: async () => {
        if (this.backupFails) throw { message: '파일을 읽거나 쓸 수 없습니다.' }
        if (this.file == null) throw new Error('no file')
        const name = `quickdeck.json.corrupt-20261119-120000${this.backups.size ? `-${this.backups.size}` : ''}`
        this.backups.set(name, this.file)
        this.file = null
        return name
      },
    }
  }
  async startApp(): Promise<LoadOutcome> {
    const outcome = await resolveLoad(this.io())
    if (outcome.kind === 'ready') {
      if (outcome.save) {
        this.file = JSON.stringify(outcome.data, null, 2)
        this.saves++
      }
      this.runRegistered = outcome.data.settings.window.autoStart
    }
    return outcome
  }
}

// ── stripBom: 맨 앞 BOM 하나만 ───────────────────────────────────────────
{
  assert.equal(stripBom('﻿{"a":1}'), '{"a":1}')
  assert.equal(stripBom('{"a":1}'), '{"a":1}')
  assert.equal(stripBom('{"a":"x﻿y"}'), '{"a":"x﻿y"}', '본문 안의 U+FEFF 는 건드리지 않는다')
  assert.equal(stripBom('﻿﻿{}'), '﻿{}', '하나만 뗀다')
  assert.equal(stripBom(''), '')
}

// ── missing → 최초 실행: 기본값을 만들고 저장 ──────────────────────────────
{
  assert.deepEqual(planLoad(null), { kind: 'missing' })
  const disk = new FakeDisk(null, false)
  const o = await disk.startApp()
  assert.equal(o.kind, 'ready')
  assert.equal(disk.saves, 1)
  assert.equal(disk.backups.size, 0)
  assert.equal(JSON.parse(disk.file!).schemaVersion, SCHEMA_VERSION)
}

// ── valid current → 정상, 저장하지 않음, 내용 보존 ─────────────────────────
{
  const p = planLoad(v5Text)
  assert.equal(p.kind, 'ok')
  if (p.kind !== 'ok') throw new Error()
  assert.equal(p.needsSave, false)
  assert.equal(p.data.decks[0]!.buttons[0]!.name, '네이버')
  assert.equal(p.data.settings.hotkey.accelerator, 'Alt+Q')
  const disk = new FakeDisk(v5Text)
  await disk.startApp()
  assert.equal(disk.file, v5Text, '정상 파일은 시작만으로 다시 쓰지 않는다')
  assert.equal(disk.saves, 0)
  assert.equal(disk.runRegistered, true)
}

// ── 이전 스키마(v1~v4) → 변환 후 저장 ─────────────────────────────────────
for (const version of [1, 2, 3, 4]) {
  const old = { ...structuredClone(v5), schemaVersion: version, decks: v5.decks.map((d) => ({ ...d, buttons: d.buttons.map(({ parentId: _p, ...b }) => b) })) }
  const p = planLoad(JSON.stringify(old))
  assert.equal(p.kind, 'ok', `v${version}`)
  if (p.kind !== 'ok') throw new Error()
  assert.equal(p.needsSave, true)
  assert.equal(p.data.schemaVersion, SCHEMA_VERSION)
  assert.equal(p.data.decks[0]!.buttons[0]!.name, '네이버', `v${version} 버튼 보존`)
  assert.equal(p.data.decks[0]!.buttons[0]!.parentId, null)
}

// ── future → 읽지도 쓰지도 않음, 원본 바이트 그대로, 자동 실행 그대로, 재시작해도 같음 ──
{
  const future = JSON.stringify({ ...v5, schemaVersion: SCHEMA_VERSION + 1, somethingNew: { x: 1 } }, null, 2)
  assert.deepEqual(planLoad(future), { kind: 'future', version: SCHEMA_VERSION + 1 })
  // 미래 버전은 구조가 달라도(decks 가 없어도) future 로 판정한다: 이 버전이 판단할 수 없는 구조
  assert.equal(planLoad(JSON.stringify({ schemaVersion: 99 })).kind, 'future')
  assert.equal(planLoad('﻿' + future).kind, 'future', 'BOM 이 있어도 future')

  const disk = new FakeDisk(future, true)
  for (let run = 1; run <= 2; run++) {
    const o = await disk.startApp()
    assert.equal(o.kind, 'protected', `run ${run}`)
    if (o.kind !== 'protected') throw new Error()
    assert.equal(o.reason, 'future')
    assert.ok(!('data' in o), '보호 상태는 데이터를 들고 있지 않는다 (설정으로 OS 를 동기화할 수 없다)')
    assert.equal(disk.file, future, `run ${run}: 원본 바이트 동일`)
    assert.equal(disk.saves, 0)
    assert.equal(disk.backups.size, 0, 'future 는 보존본으로 옮기지도 않는다')
    assert.equal(disk.runRegistered, true, `run ${run}: 자동 실행 등록 그대로`)
  }
}

// ── corrupt → 보존본을 만든 뒤에만 기본값 저장 ────────────────────────────
{
  const broken = v5Text.slice(0, -10)
  assert.equal(planLoad(broken).kind, 'corrupt')
  const disk = new FakeDisk(broken, true)
  const o = await disk.startApp()
  assert.equal(o.kind, 'ready')
  if (o.kind !== 'ready') throw new Error()
  assert.ok(o.notice && o.notice.includes('quickdeck.json.corrupt-20261119-120000'), '사용자에게 보존본 이름을 알린다')
  assert.equal(disk.backups.get('quickdeck.json.corrupt-20261119-120000'), broken, '보존본 = 원본 바이트')
  assert.equal(disk.saves, 1)
  assert.equal(JSON.parse(disk.file!).schemaVersion, SCHEMA_VERSION)
}

// ── corrupt + 보존 실패 → 원본 유지, 저장 없음, 보호 상태, 재시작해도 같음 ──
{
  const broken = '{ "schemaVersion": 5, "decks": ['
  const disk = new FakeDisk(broken, true)
  disk.backupFails = true
  for (let run = 1; run <= 2; run++) {
    const o = await disk.startApp()
    assert.equal(o.kind, 'protected')
    if (o.kind !== 'protected') throw new Error()
    assert.equal(o.reason, 'backup-failed')
    assert.equal(disk.file, broken, '원본 유지')
    assert.equal(disk.saves, 0)
    assert.equal(disk.runRegistered, true)
  }
}

// ── BOM + 정상 JSON → 정상 데이터, 다시 쓰지 않음 ─────────────────────────
{
  const bom = '﻿' + v5Text
  const p = planLoad(bom)
  assert.equal(p.kind, 'ok')
  if (p.kind !== 'ok') throw new Error()
  assert.equal(p.needsSave, false)
  assert.deepEqual(p.data, (planLoad(v5Text) as { data: unknown }).data, 'BOM 유무와 관계없이 같은 데이터')
  const disk = new FakeDisk(bom, true)
  await disk.startApp()
  assert.equal(disk.file, bom, 'BOM 파일도 시작만으로는 다시 쓰지 않는다')
  assert.equal(disk.backups.size, 0)
  assert.equal(disk.runRegistered, true)
  // 한글 등 본문은 그대로
  const korean = '﻿' + JSON.stringify({ ...v5, decks: [{ ...v5.decks[0]!, name: '한글 덱 😀' }] })
  const pk = planLoad(korean)
  assert.equal(pk.kind === 'ok' && pk.data.decks[0]!.name, '한글 덱 😀')
}

// ── 구조가 잘못된 JSON → corrupt (보존 후 새로 시작) ──────────────────────
{
  for (const [label, text] of [
    ['decks 문자열', JSON.stringify({ ...v5, decks: 'oops' })],
    ['decks 빈 배열', JSON.stringify({ ...v5, decks: [] })],
    ['schemaVersion 없음', JSON.stringify({ decks: v5.decks })],
    ['schemaVersion 문자열', JSON.stringify({ ...v5, schemaVersion: '5' })],
    ['배열 루트', '[1,2,3]'],
    ['null', 'null'],
    ['숫자', '42'],
    ['빈 파일', ''],
    ['덱 원소 빈 객체', JSON.stringify({ ...v5, decks: [{}] })],
    ['덱 원소 null', JSON.stringify({ ...v5, decks: [null] })],
    ['buttons 문자열', JSON.stringify({ ...v5, decks: [{ ...v5.decks[0]!, buttons: 'x' }] })],
    ['schemaVersion 0', JSON.stringify({ ...v5, schemaVersion: 0 })],
    ['schemaVersion 음수', JSON.stringify({ ...v5, schemaVersion: -1 })],
    ['schemaVersion 소수', JSON.stringify({ ...v5, schemaVersion: 4.5 })],
  ] as const) {
    assert.equal(planLoad(text).kind, 'corrupt', label)
  }
}

console.log('check-data-protection: ok')
