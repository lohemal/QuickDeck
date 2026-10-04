// Node 검사 스크립트(scripts/check-folders.ts)에서도 읽히도록 값 import 는 상대 경로를 쓴다
import {
  allPositions,
  buttonsIn,
  findButtonAt,
  findHotkeyOwner,
  isInsideLayout,
  parentIdOf,
  samePosition,
  type Deck,
  type DeckButton,
  type Position,
} from '../../model/deck.ts'

/**
 * QuickDeck 폴더(action.type === 'deck-folder')의 순수 로직: 계층 조회, 이동(navigation), 다른 폴더로 버튼 옮기기,
 * 삭제 정책, 손상 데이터 복구. DOM·스토어와 무관하다.
 *
 * 개념: 폴더도 버튼이다. 자식은 parentId 가 그 폴더 id 인 버튼들이고, 루트는 parentId null 이다.
 * 모든 폴더는 덱의 격자 크기(layout)를 공유한다. 위치·실행키의 유일성은 같은 parentId 안에서만 적용된다.
 */

/** 안전장치: 계층을 따라 올라갈 때 이 깊이를 넘으면 손상(cycle)으로 보고 멈춘다 */
const MAX_DEPTH = 64

export function isFolderButton(b: Pick<DeckButton, 'action'>): boolean {
  return b.action.type === 'deck-folder'
}

export function findButton(deck: Pick<Deck, 'buttons'>, id: string | null): DeckButton | undefined {
  return id === null ? undefined : deck.buttons.find((b) => b.id === id)
}

/** 폴더 안의 버튼들 (격자 밖 포함) */
export function childrenOf(deck: Pick<Deck, 'buttons'>, folderId: string): DeckButton[] {
  return buttonsIn(deck, folderId)
}

/** 모든 폴더 버튼 */
export function allFolders(deck: Pick<Deck, 'buttons'>): DeckButton[] {
  return deck.buttons.filter(isFolderButton)
}

/**
 * 루트에서 folderId 까지의 경로 (루트는 포함하지 않는다). folderId 가 null 이면 [] (루트).
 * 손상된 데이터(없는 부모·cycle)를 만나면 거기서 멈추고 지금까지의 경로만 돌려준다 → 무한 루프 없음.
 */
export function folderPath(deck: Pick<Deck, 'buttons'>, folderId: string | null): DeckButton[] {
  const path: DeckButton[] = []
  const seen = new Set<string>()
  let cur = folderId
  while (cur !== null && !seen.has(cur) && path.length < MAX_DEPTH) {
    seen.add(cur)
    const b = findButton(deck, cur)
    if (!b) break
    path.unshift(b)
    cur = parentIdOf(b)
  }
  return path
}

/** 현재 폴더의 부모 (루트에 있으면 null). 폴더가 없으면 루트 */
export function parentFolderId(deck: Pick<Deck, 'buttons'>, folderId: string | null): string | null {
  if (folderId === null) return null
  const b = findButton(deck, folderId)
  return b ? parentIdOf(b) : null
}

/** candidateId 가 ancestorId 자신이거나 그 자손인가 (cycle 검사용) */
export function isSelfOrDescendant(deck: Pick<Deck, 'buttons'>, candidateId: string | null, ancestorId: string): boolean {
  const seen = new Set<string>()
  let cur = candidateId
  while (cur !== null && !seen.has(cur) && seen.size < MAX_DEPTH) {
    if (cur === ancestorId) return true
    seen.add(cur)
    const b = findButton(deck, cur)
    if (!b) return false
    cur = parentIdOf(b)
  }
  return false
}

/** 화면에 보이는 폴더 id 가 아직 유효한가 (삭제되었거나 폴더가 아니면 루트로 돌아가야 한다) */
export function resolveFolderId(deck: Pick<Deck, 'buttons'>, folderId: string | null): string | null {
  if (folderId === null) return null
  const b = findButton(deck, folderId)
  return b && isFolderButton(b) ? folderId : null
}

/** 그 컨테이너에서 행 우선으로 첫 번째 빈 슬롯. 꽉 찼으면 null */
export function firstEmptySlot(deck: Pick<Deck, 'buttons' | 'layout'>, parentId: string | null): Position | null {
  for (const p of allPositions(deck.layout)) if (!findButtonAt(deck, p, parentId)) return p
  return null
}

// ── 삭제 정책 ────────────────────────────────────────────────────────────

export type DeletePlan = { ok: true } | { ok: false; reason: 'not-found' } | { ok: false; reason: 'folder-not-empty'; count: number }

/**
 * 폴더에 버튼이 하나라도 있으면 삭제를 막는다 (자식 자동 삭제 없음 — P9 정책).
 * 일반 버튼과 빈 폴더는 삭제할 수 있다.
 */
export function planDelete(deck: Pick<Deck, 'buttons'>, buttonId: string): DeletePlan {
  const b = findButton(deck, buttonId)
  if (!b) return { ok: false, reason: 'not-found' }
  if (isFolderButton(b)) {
    const count = childrenOf(deck, buttonId).length
    if (count > 0) return { ok: false, reason: 'folder-not-empty', count }
  }
  return { ok: true }
}

// ── 다른 폴더로 이동 ──────────────────────────────────────────────────────

export type MovePlan =
  | { ok: true; position: Position }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'same-folder' }
  | { ok: false; reason: 'target-missing' }
  | { ok: false; reason: 'cycle' }
  | { ok: false; reason: 'hotkey-conflict'; owner: DeckButton }
  | { ok: false; reason: 'full' }

/**
 * 버튼을 다른 폴더(또는 루트 null)로 옮길 수 있는지. 대상 폴더의 첫 빈 슬롯에 놓는다.
 * - 폴더를 자기 자신·자손 안으로 옮기면 cycle → 금지
 * - 현재 실행키가 대상에서 이미 쓰이면 금지 (어떤 버튼과 충돌하는지 알려준다)
 * - 대상에 빈 슬롯이 없으면 금지 (격자 밖 위치를 임의로 만들지 않는다)
 */
export function planMoveToFolder(deck: Pick<Deck, 'buttons' | 'layout'>, buttonId: string, targetParentId: string | null): MovePlan {
  const b = findButton(deck, buttonId)
  if (!b) return { ok: false, reason: 'not-found' }
  if (parentIdOf(b) === targetParentId) return { ok: false, reason: 'same-folder' }
  if (targetParentId !== null) {
    const target = findButton(deck, targetParentId)
    if (!target || !isFolderButton(target)) return { ok: false, reason: 'target-missing' }
    if (isSelfOrDescendant(deck, targetParentId, buttonId)) return { ok: false, reason: 'cycle' }
  }
  if (b.hotkey) {
    const owner = findHotkeyOwner(deck, b.hotkey, buttonId, targetParentId)
    if (owner) return { ok: false, reason: 'hotkey-conflict', owner }
  }
  const position = firstEmptySlot(deck, targetParentId)
  if (!position) return { ok: false, reason: 'full' }
  return { ok: true, position }
}

/** 이동을 적용한 새 덱. 계획이 실패면 null. 버튼의 다른 모든 필드는 그대로 */
export function applyMoveToFolder(deck: Deck, buttonId: string, targetParentId: string | null): Deck | null {
  const plan = planMoveToFolder(deck, buttonId, targetParentId)
  if (!plan.ok) return null
  return { ...deck, buttons: deck.buttons.map((b) => (b.id === buttonId ? { ...b, parentId: targetParentId, position: plan.position } : b)) }
}

export function describeMoveFailure(plan: Exclude<MovePlan, { ok: true }>): string {
  switch (plan.reason) {
    case 'not-found':
      return '버튼을 찾을 수 없습니다.'
    case 'same-folder':
      return '이미 이 폴더에 있습니다.'
    case 'target-missing':
      return '대상 폴더가 없습니다.'
    case 'cycle':
      return '폴더를 자기 자신이나 그 안의 폴더로 옮길 수 없습니다.'
    case 'hotkey-conflict':
      return `대상 폴더의 '${plan.owner.name}' 버튼이 이미 ${plan.owner.hotkey} 키를 사용합니다.`
    case 'full':
      return '이 폴더에 빈 슬롯이 없습니다.'
  }
}

/** 이동 대상 선택 목록: 루트 + 모든 폴더(경로 포함). forButtonId 가 폴더면 자기 자신·자손은 비활성 */
export interface FolderOption {
  id: string | null
  /** "QuickDeck" | "QuickDeck › 학교업무 › 방과후" */
  label: string
  depth: number
  disabled: boolean
}

export const ROOT_LABEL = 'QuickDeck'

export function folderOptions(deck: Pick<Deck, 'buttons'>, forButtonId?: string): FolderOption[] {
  const out: FolderOption[] = [{ id: null, label: ROOT_LABEL, depth: 0, disabled: false }]
  const folders = allFolders(deck)
    .map((f) => ({ f, path: folderPath(deck, f.id) }))
    .sort((a, b) => a.path.map((p) => p.name).join('\u0000').localeCompare(b.path.map((p) => p.name).join('\u0000'), 'ko'))
  for (const { f, path } of folders) {
    out.push({
      id: f.id,
      label: [ROOT_LABEL, ...path.map((p) => p.name)].join(' › '),
      depth: path.length,
      disabled: forButtonId !== undefined && isSelfOrDescendant(deck, f.id, forButtonId),
    })
  }
  return out
}

// ── 손상 데이터 복구 (load 시) ──────────────────────────────────────────

export interface RepairReport {
  /** 루트로 되돌린 버튼 수 (없는 부모·폴더 아닌 부모·자기 참조·cycle) */
  reparented: number
  /** 같은 컨테이너의 중복 위치를 다른 빈 슬롯으로 옮긴 수 */
  repositioned: number
  /** 같은 컨테이너의 중복 실행키를 비운 수 */
  hotkeysCleared: number
}

/**
 * 계층 관계를 안전하게 만든다. 버튼은 절대 버리지 않고, 문제가 있는 관계만 고친다.
 * 1) parentId 가 없는 버튼·폴더가 아닌 버튼·자기 자신을 가리키거나 cycle 을 이루면 → 루트(null)
 * 2) 같은 컨테이너에서 위치가 겹치면 뒤쪽 버튼을 그 컨테이너의 첫 빈 슬롯으로, 빈 슬롯이 없으면 격자 밖(마지막 행 다음)으로
 * 3) 같은 컨테이너에서 실행키가 겹치면 뒤쪽 버튼의 실행키만 비운다
 * 배열 순서는 유지된다. 정상 데이터면 아무것도 바뀌지 않는다.
 */
export function repairHierarchy(deck: Deck): { deck: Deck; report: RepairReport } {
  const report: RepairReport = { reparented: 0, repositioned: 0, hotkeysCleared: 0 }
  const byId = new Map(deck.buttons.map((b) => [b.id, b]))

  // 1) 부모 관계
  let buttons = deck.buttons.map((b) => {
    const pid = parentIdOf(b)
    if (pid === null) return b.parentId === null ? b : { ...b, parentId: null }
    const parent = byId.get(pid)
    if (!parent || !isFolderButton(parent) || pid === b.id) {
      report.reparented++
      return { ...b, parentId: null }
    }
    return b
  })
  // cycle: 각 버튼에서 위로 올라가 루트에 닿지 못하면 끊는다
  const map2 = new Map(buttons.map((b) => [b.id, b]))
  const reachesRoot = (id: string): boolean => {
    const seen = new Set<string>()
    let cur: string | null = id
    while (cur !== null) {
      if (seen.has(cur) || seen.size > MAX_DEPTH) return false
      seen.add(cur)
      const b = map2.get(cur)
      if (!b) return false
      cur = parentIdOf(b)
    }
    return true
  }
  buttons = buttons.map((b) => {
    if (parentIdOf(b) !== null && !reachesRoot(b.id)) {
      report.reparented++
      return { ...b, parentId: null }
    }
    return b
  })

  // 2) 위치 중복 / 3) 실행키 중복 — 컨테이너별로
  const containers = new Set(buttons.map(parentIdOf))
  for (const pid of containers) {
    const taken: Position[] = []
    const keys = new Set<string>()
    buttons = buttons.map((b) => {
      if (parentIdOf(b) !== pid) return b
      let next = b
      if (taken.some((p) => samePosition(p, next.position))) {
        const free = allPositions(deck.layout).find((p) => !taken.some((t) => samePosition(t, p)) && !buttons.some((o) => parentIdOf(o) === pid && o.id !== b.id && samePosition(o.position, p)))
        const fallback: Position = { row: deck.layout.rows + taken.length, col: 0 }
        next = { ...next, position: free ?? fallback }
        report.repositioned++
      }
      taken.push(next.position)
      if (next.hotkey) {
        const k = next.hotkey.toUpperCase()
        if (keys.has(k)) {
          next = { ...next, hotkey: null }
          report.hotkeysCleared++
        } else keys.add(k)
      }
      return next
    })
  }
  const changed = report.reparented + report.repositioned + report.hotkeysCleared > 0 || buttons.some((b, i) => b !== deck.buttons[i])
  return { deck: changed ? { ...deck, buttons } : deck, report }
}

/** 보이는 격자 밖(격자 축소로 보존된) 버튼이 현재 폴더에 몇 개인지 */
export function hiddenCountIn(deck: Pick<Deck, 'buttons' | 'layout'>, parentId: string | null): number {
  return buttonsIn(deck, parentId).filter((b) => !isInsideLayout(b.position, deck.layout)).length
}
