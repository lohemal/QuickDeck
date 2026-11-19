// 자동 업데이트 릴리스 도구의 순수 로직: latest.json 만들기·검증, updater 서명(minisign) 검증.
// make-latest-json.ts 와 check-updater.ts 가 쓴다. 비밀키는 다루지 않는다 (공개키·서명만).
import { createHash, createPublicKey, verify } from 'node:crypto'

export const REPO = 'lohemal/QuickDeck'
export const PLATFORM_KEY = 'windows-x86_64'

export interface LatestJson {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

/** 태그 고정 다운로드 URL. `/latest/` 는 쓰지 않는다 (이후 릴리스가 바뀌면 다른 파일을 가리키게 된다) */
export function installerUrl(version: string, fileName: string): string {
  return `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(fileName)}`
}

export function buildLatestJson(input: { version: string; notes: string; pubDate: Date; url: string; signature: string }): LatestJson {
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms: { [PLATFORM_KEY]: { signature: input.signature, url: input.url } },
  }
}

/** 파일로 쓸 바이트. UTF-8, BOM 없음, 끝에 줄바꿈 */
export function serializeLatestJson(json: LatestJson): Buffer {
  return Buffer.from(JSON.stringify(json, null, 2) + '\n', 'utf8')
}

/** 만든 latest.json 바이트를 다시 읽어 확인한다. 문제가 있으면 이유 목록 */
export function validateLatestJson(bytes: Buffer, expected: { version: string; signature: string; fileName: string }): string[] {
  const problems: string[] = []
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problems.push('UTF-8 BOM 이 있습니다')
  let json: LatestJson
  try {
    json = JSON.parse(bytes.toString('utf8')) as LatestJson
  } catch {
    return [...problems, 'JSON 으로 읽을 수 없습니다']
  }
  if (json.version !== expected.version) problems.push(`version 이 ${expected.version} 이 아닙니다: ${json.version}`)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(json.pub_date ?? '')) problems.push('pub_date 가 RFC 3339 형식이 아닙니다')
  const keys = Object.keys(json.platforms ?? {})
  if (keys.length !== 1 || keys[0] !== PLATFORM_KEY) problems.push(`platforms 는 ${PLATFORM_KEY} 하나여야 합니다: ${keys.join(',')}`)
  const p = json.platforms?.[PLATFORM_KEY]
  if (!p) return problems
  if (p.signature !== expected.signature) problems.push('signature 가 .sig 파일 내용과 다릅니다')
  const url = installerUrl(expected.version, expected.fileName)
  if (p.url !== url) problems.push(`url 이 태그 고정 주소가 아닙니다: ${p.url} (기대: ${url})`)
  if (!p.url.startsWith('https://')) problems.push('url 이 https 가 아닙니다')
  return problems
}

// ── minisign (tauri signer) 서명 검증 ──────────────────────────────────────
// Tauri 의 공개키·.sig 파일은 minisign 텍스트 형식을 base64 로 한 번 더 감싼 것이다.

function decodeWrapped(b64: string): string[] {
  return Buffer.from(b64.trim(), 'base64').toString('utf8').split('\n').map((l) => l.replace(/\r$/, ''))
}

export interface PublicKeyInfo {
  keyId: string
  raw: Buffer
}

export function parsePublicKey(wrapped: string): PublicKeyInfo {
  const lines = decodeWrapped(wrapped)
  if (!lines[0]?.startsWith('untrusted comment:')) throw new Error('공개키 형식이 아닙니다')
  const bin = Buffer.from(lines[1] ?? '', 'base64')
  if (bin.length !== 42 || bin.subarray(0, 2).toString('latin1') !== 'Ed') throw new Error('Ed25519 minisign 공개키가 아닙니다')
  return { keyId: keyIdHex(bin.subarray(2, 10)), raw: bin.subarray(10) }
}

function keyIdHex(le: Buffer): string {
  return Buffer.from(le).reverse().toString('hex').toUpperCase()
}

function ed25519Key(raw: Buffer) {
  return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' })
}

export interface SignatureCheck {
  ok: boolean
  keyId: string
  trustedComment: string
  problem?: string
}

/** 파일 바이트가 공개키로 서명된 것인지 확인한다 (서명·trusted comment 둘 다) */
export function verifyUpdaterSignature(file: Buffer, sigWrapped: string, pubWrapped: string): SignatureCheck {
  const pub = parsePublicKey(pubWrapped)
  const lines = decodeWrapped(sigWrapped)
  const sigBin = Buffer.from(lines[1] ?? '', 'base64')
  const trustedLine = lines[2] ?? ''
  const globalSig = Buffer.from(lines[3] ?? '', 'base64')
  const fail = (problem: string, keyId = ''): SignatureCheck => ({ ok: false, keyId, trustedComment: '', problem })
  if (sigBin.length !== 74) return fail('서명 형식이 아닙니다')
  const alg = sigBin.subarray(0, 2).toString('latin1')
  const keyId = keyIdHex(sigBin.subarray(2, 10))
  if (keyId !== pub.keyId) return fail(`다른 키로 서명되었습니다 (서명 ${keyId}, 공개키 ${pub.keyId})`, keyId)
  const sig = sigBin.subarray(10)
  const message = alg === 'ED' ? createHash('blake2b512').update(file).digest() : alg === 'Ed' ? file : null
  if (!message) return fail(`알 수 없는 서명 방식: ${alg}`, keyId)
  const key = ed25519Key(pub.raw)
  if (!verify(null, message, key, sig)) return fail('파일 서명이 맞지 않습니다', keyId)
  if (!trustedLine.startsWith('trusted comment: ')) return fail('trusted comment 가 없습니다', keyId)
  const trustedComment = trustedLine.slice('trusted comment: '.length)
  if (!verify(null, Buffer.concat([sig, Buffer.from(trustedComment, 'utf8')]), key, globalSig)) return fail('trusted comment 서명이 맞지 않습니다', keyId)
  return { ok: true, keyId, trustedComment }
}
