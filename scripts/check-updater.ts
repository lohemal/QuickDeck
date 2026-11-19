// 자동 업데이트 설정·상태 문구·latest.json·서명 검증 검사.
// 사용: node --experimental-strip-types --no-warnings scripts/check-updater.ts
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION, migrate } from '../src/model/appData.ts'
import { createDefaultSettings } from '../src/model/settings.ts'
import { describePhase, downloadPercent, isUpdating, runInstallFlow } from '../src/features/updater/updateState.ts'
import { createSaveQueue } from '../src/store/saveQueue.ts'
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

// ── 저장 큐: freeze → flush 는 기다리던 저장만 기록, freeze 뒤 변경은 받지 않음, thaw 뒤 다시 저장 ──
{
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const make = (failWrites = false) => {
    const written: string[] = []
    const q = createSaveQueue<string>({
      write: async (d) => {
        await sleep(5)
        if (failWrites) throw new Error('disk full')
        written.push(d)
      },
      onStatus: () => {},
      delayMs: 40,
    })
    return { q, written }
  }

  // A. 기다리던 저장 → freeze → flush → 기록됨
  {
    const { q, written } = make()
    q.schedule('before-freeze')
    q.freeze()
    await q.flush()
    assert.deepEqual(written, ['before-freeze'], 'freeze 전에 기다리던 변경은 flush 로 기록된다')
    // B. freeze 뒤 변경은 기록되지 않는다 (지연 시간이 지나도, flush 해도)
    q.schedule('after-freeze')
    await sleep(80)
    await q.flush()
    assert.deepEqual(written, ['before-freeze'], 'freeze 뒤 변경은 받지 않는다')
    assert.equal(q.isClosed(), true)
    // D. thaw 뒤 다시 변경 → 정상 저장
    q.thaw()
    assert.equal(q.isClosed(), false)
    q.schedule('after-thaw')
    await sleep(80)
    assert.deepEqual(written, ['before-freeze', 'after-thaw'])
  }
  // 진행 중인 저장도 flush 가 기다린다
  {
    const { q, written } = make()
    q.schedule('x')
    await sleep(42) // 타이머가 돌아 기록 시작
    await q.flush()
    assert.deepEqual(written, ['x'])
  }
  // block(보호 상태)은 thaw 로 풀리지 않는다
  {
    const { q, written } = make()
    q.block()
    q.thaw()
    q.schedule('nope')
    await q.flush()
    assert.deepEqual(written, [])
    assert.equal(q.isClosed(), true)
  }
  // 저장 실패는 flush 가 reject
  {
    const { q } = make(true)
    q.schedule('x')
    await assert.rejects(q.flush())
  }
  // flush 실패 → thaw → 기록하지 못한 변경을 다시 기록한다 (업데이트 실패 뒤 화면 값과 파일이 어긋나지 않게)
  {
    const written: string[] = []
    let failNext = true
    const q = createSaveQueue<string>({
      write: async (d) => {
        await sleep(5)
        if (failNext) {
          failNext = false
          throw new Error('locked')
        }
        written.push(d)
      },
      onStatus: () => {},
      delayMs: 40,
    })
    q.schedule('changed-before-update')
    q.freeze()
    await assert.rejects(q.flush())
    assert.deepEqual(written, [])
    q.thaw()
    await sleep(80)
    assert.deepEqual(written, ['changed-before-update'], 'thaw 뒤 실패했던 변경을 다시 기록')
    // 실패한 뒤 더 새 변경이 오면 새 변경이 기록된다 (옛 데이터로 덮지 않음)
    failNext = true
    q.schedule('a')
    await sleep(80) // 실패
    q.schedule('b')
    await q.flush()
    assert.deepEqual(written, ['changed-before-update', 'b'])
  }
}

// ── 설치 순서: 입력 차단 → freeze → flush → 내려받기 → 설치. 실패하면 thaw ─────────
{
  const run = async (fail?: 'flush' | 'download' | 'install') => {
    const log: string[] = []
    const phases: string[] = []
    const result = await runInstallFlow('0.1.6', {
      setPhase: (p) => {
        phases.push(p.kind)
        log.push(`phase:${p.kind}`)
      },
      freeze: () => log.push('freeze'),
      thaw: () => log.push('thaw'),
      flush: async () => {
        log.push('flush')
        if (fail === 'flush') throw new Error('flush failed')
      },
      download: async (onPercent) => {
        log.push('download')
        onPercent(50)
        if (fail === 'download') throw new Error('signature verification failed')
      },
      install: async () => {
        log.push('install')
        if (fail === 'install') throw new Error('ShellExecute failed')
      },
      logFailure: (stage) => log.push(`log:${stage}`),
    })
    return { result, log, phases }
  }

  const ok = await run()
  assert.equal(ok.result, 'installing')
  assert.deepEqual(ok.log.filter((l) => !l.startsWith('phase:')), ['freeze', 'flush', 'download', 'install'], 'freeze 가 flush 보다 먼저')
  assert.equal(ok.log[0], 'phase:downloading', '가장 먼저 설치 중 상태(입력 차단)')
  assert.ok(ok.log.indexOf('phase:installing') < ok.log.indexOf('install'))
  assert.ok(!ok.log.includes('thaw'), '성공하면 freeze 를 유지한 채 종료된다')

  // E. flush 실패 → 내려받기·설치 안 함, thaw, 저장 실패 안내
  const f = await run('flush')
  assert.equal(f.result, 'failed')
  assert.ok(!f.log.includes('download') && !f.log.includes('install'))
  assert.ok(f.log.includes('thaw') && f.log.includes('log:flush'))
  assert.equal(f.phases.at(-1), 'error')

  // 내려받기·서명 실패 → 설치 안 함, thaw
  const d = await run('download')
  assert.ok(!d.log.includes('install') && d.log.includes('thaw') && d.log.includes('log:download'))
  assert.equal(d.phases.at(-1), 'error')

  // 설치 시작 실패 → thaw
  const i = await run('install')
  assert.ok(i.log.includes('thaw') && i.log.includes('log:install'))
  assert.equal(i.phases.at(-1), 'error')

  assert.equal(isUpdating({ kind: 'downloading', version: '1', percent: null }), true)
  assert.equal(isUpdating({ kind: 'installing', version: '1' }), true)
  assert.equal(isUpdating({ kind: 'available', version: '1' }), false)
  assert.equal(isUpdating({ kind: 'error', message: 'x', duringInstall: true }), false, '실패하면 다시 사용할 수 있다')
}

console.log('check-updater: ok')
