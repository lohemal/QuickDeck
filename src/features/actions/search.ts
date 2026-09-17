import type { PresetSearchEngineId } from '@/model/action'
import type { CustomSearchEngine, Settings } from '@/model/settings'
import type { Deck } from '@/model/deck'
// Node 검사 스크립트(scripts/check-*.ts)에서도 읽히도록 값 import 는 확장자 있는 상대 경로를 쓴다
import { normalizeHttpUrl } from '../../lib/url.ts'

export interface SearchEngineInfo {
  id: string
  name: string
  urlTemplate: string
}

export const QUERY_PLACEHOLDER = '{query}'

/** 기본 제공 검색엔진. {query} 자리에 인코딩된 검색어가 들어간다. 사용자가 지우거나 고칠 수 없다 */
export const PRESET_SEARCH_ENGINES: Record<PresetSearchEngineId, SearchEngineInfo> = {
  google: { id: 'google', name: 'Google', urlTemplate: 'https://www.google.com/search?q={query}' },
  naver: { id: 'naver', name: 'Naver', urlTemplate: 'https://search.naver.com/search.naver?query={query}' },
  bing: { id: 'bing', name: 'Bing', urlTemplate: 'https://www.bing.com/search?q={query}' },
}

export function isPresetEngineId(id: string): id is PresetSearchEngineId {
  return id in PRESET_SEARCH_ENGINES
}

export function findSearchEngine(id: string, settings: Pick<Settings, 'customSearchEngines'>): SearchEngineInfo | undefined {
  const preset = (PRESET_SEARCH_ENGINES as Record<string, SearchEngineInfo>)[id]
  if (preset) return preset
  const custom: CustomSearchEngine | undefined = settings.customSearchEngines.find((e) => e.id === id)
  return custom
}

export function allSearchEngines(settings: Pick<Settings, 'customSearchEngines'>): SearchEngineInfo[] {
  return [...Object.values(PRESET_SEARCH_ENGINES), ...settings.customSearchEngines]
}

export function buildSearchUrl(engine: SearchEngineInfo, query: string): string {
  return engine.urlTemplate.replace(QUERY_PLACEHOLDER, encodeURIComponent(query))
}

/**
 * 사용자 지정 검색엔진 입력 검증. 이름 필수, 템플릿은 http(s) URL 이고 {query} 를 포함해야 한다.
 * 문제가 없으면 정규화된 값을 돌려준다.
 */
export function validateSearchEngineInput(
  name: string,
  urlTemplate: string,
): { ok: true; name: string; urlTemplate: string } | { ok: false; field: 'name' | 'urlTemplate'; reason: string } {
  const n = name.trim()
  const t = urlTemplate.trim()
  if (!n) return { ok: false, field: 'name', reason: '검색엔진 이름을 입력하세요' }
  if (!t) return { ok: false, field: 'urlTemplate', reason: '검색 URL 템플릿을 입력하세요' }
  if (!t.includes(QUERY_PLACEHOLDER)) return { ok: false, field: 'urlTemplate', reason: `템플릿에 ${QUERY_PLACEHOLDER} 가 있어야 합니다` }
  // {query} 자리에 임시 값을 넣어 URL 자체가 올바른지 본다. 스킴이 없으면 붙여 준다
  const probe = normalizeHttpUrl(t.replace(QUERY_PLACEHOLDER, 'probe'))
  if (!probe) return { ok: false, field: 'urlTemplate', reason: '올바른 http/https 주소가 아닙니다' }
  const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t) ? t : `https://${t}`
  return { ok: true, name: n, urlTemplate: normalized }
}

/** 이 검색엔진을 쓰는 버튼들 (삭제 보호용) */
export function buttonsUsingEngine(deck: Pick<Deck, 'buttons'>, engineId: string) {
  return deck.buttons.filter((b) => b.action.type === 'search' && b.action.engine === engineId)
}
