// v<version> GitHub Release 에 올릴 latest.json 을 만든다 (로컬 서명 빌드 뒤에 실행).
// 사용: node --experimental-strip-types --no-warnings scripts/make-latest-json.ts --notes "릴리스 노트" [--pub-date 2026-11-20T09:00:00+09:00]
//
// - 버전: src-tauri/tauri.conf.json
// - 설치 파일·서명: src-tauri/target/release/bundle/nsis/QuickDeck_<version>_x64-setup.exe(.sig)
// - 공개키: tauri.conf.json plugins.updater.pubkey 로 .sig 를 검증한다 (비밀키는 쓰지 않는다)
// - 출력: 같은 폴더의 latest.json (UTF-8, BOM 없음). 다시 읽어 검증한 뒤 SHA-256 을 보여준다
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLatestJson, installerUrl, serializeLatestJson, validateLatestJson, verifyUpdaterSignature } from './lib/updaterRelease.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function fail(msg: string): never {
  console.error(`make-latest-json: ${msg}`)
  process.exit(1)
}

const root = join(import.meta.dirname, '..')
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const version: string = conf.version
const pubkey: string | undefined = conf.plugins?.updater?.pubkey
if (!pubkey) fail('tauri.conf.json 에 plugins.updater.pubkey 가 없습니다')

const notes = arg('notes')
if (!notes) fail('--notes "릴리스 노트" 가 필요합니다')
const pubDateArg = arg('pub-date')
const pubDate = pubDateArg ? new Date(pubDateArg) : new Date()
if (Number.isNaN(pubDate.getTime())) fail(`--pub-date 를 읽을 수 없습니다: ${pubDateArg}`)

const dir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const fileName = `${conf.productName}_${version}_x64-setup.exe`
const installerPath = join(dir, fileName)
const sigPath = `${installerPath}.sig`
if (!existsSync(installerPath)) fail(`설치 파일이 없습니다: ${installerPath}`)
if (!existsSync(sigPath)) fail(`서명 파일이 없습니다: ${sigPath} (TAURI_SIGNING_PRIVATE_KEY 로 빌드했는지 확인)`)

const installer = readFileSync(installerPath)
// .sig 내용 그대로 (Tauri 가 쓴 그대로를 signature 에 넣는다)
const signature = readFileSync(sigPath, 'utf8')

const check = verifyUpdaterSignature(installer, signature, pubkey)
if (!check.ok) fail(`서명 검증 실패: ${check.problem}`)

const json = buildLatestJson({ version, notes, pubDate, url: installerUrl(version, fileName), signature })
const bytes = serializeLatestJson(json)
const outPath = join(dir, 'latest.json')
writeFileSync(outPath, bytes)

const written = readFileSync(outPath)
const problems = validateLatestJson(written, { version, signature, fileName })
if (problems.length) fail(`latest.json 검증 실패:\n - ${problems.join('\n - ')}`)

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex').toUpperCase()
console.log(`latest.json 생성: ${outPath}`)
console.log(`  version     ${version}`)
console.log(`  url         ${json.platforms['windows-x86_64']!.url}`)
console.log(`  서명 키 ID  ${check.keyId} (공개키와 일치, 서명 검증 통과)`)
console.log(`  installer   SHA-256 ${sha(installer)}`)
console.log(`  latest.json SHA-256 ${sha(written)} (BOM 없음)`)
