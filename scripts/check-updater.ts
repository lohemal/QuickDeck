// 자동 업데이트 설정·상태 문구·latest.json·서명 검증 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-updater.ts
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION, migrate } from '../src/model/appData.ts'
import { createDefaultSettings } from '../src/model/settings.ts'
import { describePhase, downloadPercent } from '../src/features/updater/updateState.ts'
import {
  buildLatestJson,
  installerUrl,
  parsePublicKey,
  serializeLatestJson,
  validateLatestJson,
  verifyUpdaterSignature,
} from './lib/updaterRelease.ts'

const root = join(import.meta.dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

// ── 설정: 고정 endpoint, 공개키만, passive, 위험 옵션 없음 ─────────────────
{
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'))
  const u = conf.plugins?.updater
  assert.ok(u, 'plugins.updater')
  assert.deepEqual(u.endpoints, ['https://github.com/lohemal/QuickDeck/releases/latest/download/latest.json'])
  assert.equal(u.windows?.installMode, 'passive')
  assert.equal(conf.bundle.createUpdaterArtifacts, true, 'v1Compatible 이 아닌 true')
  for (const k of ['dangerousInsecureTransportProtocol', 'dangerousAcceptInvalidCerts', 'dangerousAcceptInvalidHostnames', 'requireSignedVersion', 'allowDowngrades']) {
    assert.ok(!(k in u), `${k} 를 켜지 않는다`)
  }
  const pub = parsePublicKey(u.pubkey)
  assert.equal(pub.raw.length, 32, '공개키는 Ed25519 32바이트')
  assert.ok(!/SECRET|PRIVATE|encrypted/i.test(Buffer.from(u.pubkey, 'base64').toString('utf8')), '설정에는 공개키만')
  assert.equal(conf.bundle.windows.nsis.installMode, 'currentUser')
}

// ── 의존성: updater 2.12 계열 고정, Tauri core 는 2.11 그대로 ─────────────
{
  assert.match(read('src-tauri/Cargo.toml'), /^tauri-plugin-updater = "~2\.12"$/m)
  const lock = read('src-tauri/Cargo.lock')
  const ver = (name: string) => lock.match(new RegExp(`name = "${name}"\\r?\\nversion = "([^"]+)"`))?.[1]
  assert.match(ver('tauri-plugin-updater') ?? '', /^2\.12\.\d+$/)
  assert.match(ver('tauri') ?? '', /^2\.11\.\d+$/)
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@tauri-apps/plugin-updater'], '~2.12.0')
  const npmLock = JSON.parse(read('package-lock.json'))
  assert.match(npmLock.packages['node_modules/@tauri-apps/plugin-updater'].version, /^2\.12\.\d+$/)
  assert.match(npmLock.packages['node_modules/@tauri-apps/api'].version, /^2\.11\.\d+$/)
  const cap = JSON.parse(read('src-tauri/capabilities/default.json'))
  const updaterPerms = cap.permissions.filter((p: string) => p.startsWith('updater:')).sort()
  assert.deepEqual(updaterPerms, ['updater:allow-check', 'updater:allow-download', 'updater:allow-install'], '필요한 updater 권한만')
}

// ── autoCheckUpdates: 기본 ON, 스키마 버전 증가 없음, 꺼 둔 값 보존 ──────────
{
  assert.equal(SCHEMA_VERSION, 5, 'autoCheckUpdates 는 스키마 버전을 올리지 않는다 (v0.1.4 가 새 파일을 지우지 않게)')
  assert.equal(createDefaultSettings().autoCheckUpdates, true)
  const deck = { id: 'd1', name: '덱', layout: { columns: 4, rows: 3 }, buttons: [] }
  const old = { schemaVersion: 5, settings: { hotkey: { enabled: true, accelerator: 'Alt+Q' } }, decks: [deck], activeDeckId: 'd1' }
  assert.equal(migrate(structuredClone(old))!.settings.autoCheckUpdates, true, 'v0.1.4 파일(필드 없음) → 기본 ON')
  assert.equal(migrate({ ...structuredClone(old), settings: { autoCheckUpdates: false } })!.settings.autoCheckUpdates, false, '끈 값 보존')
  assert.equal(migrate({ ...structuredClone(old), settings: { autoCheckUpdates: 'no' } })!.settings.autoCheckUpdates, true, '형식 오류 → 기본값')
  // v0.1.4 가 이 파일을 열면: normalizeSettings 의 {...defaults, ...s} 라 모르는 필드도 남는다 (이 버전 코드로 같은 동작 확인)
  const withField = migrate({ ...structuredClone(old), settings: { autoCheckUpdates: false, futureFlag: 1 } })!
  assert.equal((withField.settings as unknown as { futureFlag: number }).futureFlag, 1)
}

// ── 상태 문구 ──────────────────────────────────────────────────────────────
{
  assert.equal(downloadPercent(50, 200), 25)
  assert.equal(downloadPercent(10, undefined), null)
  assert.equal(downloadPercent(10, 0), null)
  assert.equal(downloadPercent(300, 200), 100)
  assert.equal(describePhase({ kind: 'idle' }), null)
  assert.equal(describePhase({ kind: 'latest' }), '최신 버전입니다.')
  assert.equal(describePhase({ kind: 'available', version: '0.1.6' }), 'QuickDeck v0.1.6 업데이트가 있습니다.')
  assert.match(describePhase({ kind: 'downloading', version: '0.1.6', percent: 42 })!, /42%/)
}

// ── latest.json: 태그 고정 URL, windows-x86_64, BOM 없음, 서명 = .sig 전체 ──
{
  const sig = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQo='
  const fileName = 'QuickDeck_0.1.5_x64-setup.exe'
  const url = installerUrl('0.1.5', fileName)
  assert.equal(url, 'https://github.com/lohemal/QuickDeck/releases/download/v0.1.5/QuickDeck_0.1.5_x64-setup.exe')
  const json = buildLatestJson({ version: '0.1.5', notes: '자동 업데이트 지원 시작', pubDate: new Date('2026-11-20T00:00:00.000Z'), url, signature: sig })
  assert.equal(json.pub_date, '2026-11-20T00:00:00Z')
  const bytes = serializeLatestJson(json)
  assert.notEqual(bytes[0], 0xef, 'BOM 없음')
  assert.deepEqual(validateLatestJson(bytes, { version: '0.1.5', signature: sig, fileName }), [])
  // 잘못된 경우를 잡아낸다
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes])
  assert.ok(validateLatestJson(withBom, { version: '0.1.5', signature: sig, fileName }).some((p) => p.includes('BOM')))
  assert.ok(validateLatestJson(bytes, { version: '0.1.6', signature: sig, fileName }).some((p) => p.includes('version')))
  assert.ok(validateLatestJson(bytes, { version: '0.1.5', signature: sig + 'x', fileName }).some((p) => p.includes('signature')))
  const latestUrl = { ...json, platforms: { 'windows-x86_64': { signature: sig, url: 'https://github.com/lohemal/QuickDeck/releases/latest/download/x.exe' } } }
  assert.ok(validateLatestJson(serializeLatestJson(latestUrl), { version: '0.1.5', signature: sig, fileName }).some((p) => p.includes('태그 고정')))
  assert.ok(validateLatestJson(Buffer.from('{oops'), { version: '0.1.5', signature: sig, fileName }).length > 0)
}

// ── updater 서명(minisign) 검증: 진짜 Ed25519 키로 만든 서명으로 확인 ─────
{
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const rawPub = publicKey.export({ format: 'der', type: 'spki' }).subarray(12)
  const keyIdLe = Buffer.from('0123456789abcdef', 'hex')
  const pubText = `untrusted comment: minisign public key: ${Buffer.from(keyIdLe).reverse().toString('hex').toUpperCase()}\n${Buffer.concat([Buffer.from('Ed'), keyIdLe, rawPub]).toString('base64')}\n`
  const pubWrapped = Buffer.from(pubText).toString('base64')

  const file = Buffer.from('QuickDeck installer bytes')
  const makeSig = (data: Buffer, comment = 'timestamp:1\tfile:QuickDeck_0.1.5_x64-setup.exe') => {
    const s = sign(null, createHash('blake2b512').update(data).digest(), privateKey)
    const g = sign(null, Buffer.concat([s, Buffer.from(comment)]), privateKey)
    const text = `untrusted comment: signature from tauri secret key\n${Buffer.concat([Buffer.from('ED'), keyIdLe, s]).toString('base64')}\ntrusted comment: ${comment}\n${g.toString('base64')}\n`
    return Buffer.from(text).toString('base64')
  }
  const sigWrapped = makeSig(file)
  const ok = verifyUpdaterSignature(file, sigWrapped, pubWrapped)
  assert.equal(ok.ok, true, ok.problem)
  assert.equal(ok.keyId, 'EFCDAB8967452301')
  assert.equal(verifyUpdaterSignature(Buffer.from('tampered'), sigWrapped, pubWrapped).ok, false, '내용이 바뀌면 실패')
  // 다른 키의 공개키로는 실패
  const other = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(12)
  const otherPub = Buffer.from(`untrusted comment: x\n${Buffer.concat([Buffer.from('Ed'), keyIdLe, other]).toString('base64')}\n`).toString('base64')
  assert.equal(verifyUpdaterSignature(file, sigWrapped, otherPub).ok, false)
}

console.log('check-updater: ok')
