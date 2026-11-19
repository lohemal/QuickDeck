// Node 검사 스크립트(scripts/check-*.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import { SCHEMA_VERSION, createDefaultAppData, migrate, type AppData } from './appData.ts'

/**
 * 저장 파일(quickdeck.json)을 읽은 결과를 어떻게 다룰지 정한다.
 *
 * "파일 없음" 과 "파일이 있는데 읽을 수 없음" 은 절대 같은 상태가 아니다.
 *  - missing : 파일이 없다 → 최초 실행. 기본값을 만들어 저장한다
 *  - ok      : 현재(또는 이전) 스키마 → 정상. 이전 스키마면 변환 후 저장한다
 *  - future  : 더 새 버전 QuickDeck 이 만든 파일 → 읽지도 쓰지도 않는다 (사용자 데이터 보호)
 *  - corrupt : JSON 이 깨졌거나 구조가 맞지 않음 → 원본을 보존본으로 옮긴 뒤에만 기본값으로 새로 시작한다
 */
export type LoadPlan =
  | { kind: 'missing' }
  | { kind: 'ok'; data: AppData; needsSave: boolean }
  | { kind: 'future'; version: number }
  | { kind: 'corrupt'; reason: string }

/** 맨 앞의 UTF-8 BOM(U+FEFF) 하나만 뗀다. 메모장의 "UTF-8(BOM)" 저장 대비. 나머지 내용은 그대로 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function planLoad(text: string | null): LoadPlan {
  if (text == null) return { kind: 'missing' }
  let raw: unknown
  try {
    raw = JSON.parse(stripBom(text))
  } catch {
    return { kind: 'corrupt', reason: 'JSON 형식이 아닙니다' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'corrupt', reason: '데이터가 객체가 아닙니다' }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion
  if (typeof version !== 'number' || !Number.isFinite(version)) return { kind: 'corrupt', reason: 'schemaVersion 이 없습니다' }
  // 구조 검사보다 먼저: 미래 버전의 구조는 이 버전이 판단할 수 없다
  if (version > SCHEMA_VERSION) return { kind: 'future', version }
  if (!Number.isInteger(version) || version < 1) return { kind: 'corrupt', reason: 'schemaVersion 이 올바르지 않습니다' }
  let data: AppData | null
  try {
    data = migrate(raw)
  } catch {
    // 덱 원소가 객체가 아니거나 buttons 가 배열이 아닌 경우 등. 보존본을 남기고 새로 시작한다
    data = null
  }
  if (!data) return { kind: 'corrupt', reason: '덱 구조가 올바르지 않습니다' }
  return { kind: 'ok', data, needsSave: version !== SCHEMA_VERSION }
}

/** load 가 쓰는 입출력. 검사 스크립트에서 가짜로 바꿔 끼운다 */
export interface LoadIo {
  /** 저장 파일 텍스트. 파일이 없으면 null. 읽기 자체가 실패하면 throw */
  readText: () => Promise<string | null>
  /** 손상된 저장 파일을 보존본으로 옮긴다(덮어쓰지 않음). 실패하면 throw. 성공하면 보존본 파일 이름 */
  backupCorrupt: () => Promise<string>
}

export type LoadOutcome =
  /** 정상 진행. save 가 true 일 때만 바로 저장한다 */
  | { kind: 'ready'; data: AppData; save: boolean; notice: string | null }
  /** 보호 상태: 데이터를 들고 있지 않고, 저장·OS 설정 동기화를 하지 않는다 */
  | { kind: 'protected'; reason: 'future' | 'backup-failed'; detail: string }

export async function resolveLoad(io: LoadIo): Promise<LoadOutcome> {
  const plan = planLoad(await io.readText())
  switch (plan.kind) {
    case 'missing':
      return { kind: 'ready', data: createDefaultAppData(), save: true, notice: null }
    case 'ok':
      return { kind: 'ready', data: plan.data, save: plan.needsSave, notice: null }
    case 'future':
      return { kind: 'protected', reason: 'future', detail: `schemaVersion ${plan.version} > ${SCHEMA_VERSION}` }
    case 'corrupt': {
      let backupName: string
      try {
        backupName = await io.backupCorrupt()
      } catch (e) {
        // 보존본을 만들지 못했으면 원본을 그대로 두고 아무것도 저장하지 않는다
        return { kind: 'protected', reason: 'backup-failed', detail: `${plan.reason}: ${describe(e)}` }
      }
      return {
        kind: 'ready',
        data: createDefaultAppData(),
        save: true,
        notice: `저장된 데이터 파일이 손상되어 새로 시작했습니다. 기존 파일은 ${backupName} 으로 보존했습니다.`,
      }
    }
  }
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return String(e)
}
