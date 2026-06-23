import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Head, Link, router } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import DrugResultRow from '~/components/drug-reference/DrugResultRow'
import IngestStatus from '~/components/drug-reference/IngestStatus'
import SafetyBanner from '~/components/conditions/SafetyBanner'
import { IconSearch, IconFirstAidKit, IconLeaf } from '@tabler/icons-react'
import type {
  DrugSearchResult,
  DrugIngestStatus,
} from '../../../types/drug_reference'
import type { ConditionSummary, ConditionDrugsResult, NaturalRemedy } from '../../../types/conditions'
import { remedySourceName } from '../../../util/conditions'
import { PRODUCT_TYPES } from '../../../types/drug_reference'

interface PageProps {
  ingestStatus: DrugIngestStatus | null
  rowCount: number
  conditions: ConditionSummary[]
  remedies: NaturalRemedy[]
}

/**
 * Sentinel for the type filter's "Natural" pill. Not an FDA product_type — it
 * routes the search to the curated NCCIH herb list instead of drug_labels.
 */
const NATURAL_FILTER = 'NATURAL'

/**
 * Curated administration routes for the route filter — the common openFDA
 * `route` values a field user actually reaches for. The column holds a
 * comma-joined uppercase list, so the backend matches with LIKE.
 */
const ROUTE_OPTIONS = [
  'ORAL',
  'TOPICAL',
  'OPHTHALMIC',
  'OTIC',
  'NASAL',
  'INHALATION',
  'SUBLINGUAL',
  'RECTAL',
  'VAGINAL',
  'TRANSDERMAL',
  'DENTAL',
] as const

/** Title-case a route value for display (ORAL → Oral). */
function routeLabel(r: string): string {
  return r.charAt(0) + r.slice(1).toLowerCase()
}

/** Case-insensitive remedy match on name / common names / uses. */
function matchRemedies(remedies: NaturalRemedy[], query: string): NaturalRemedy[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return remedies.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.commonNames.some((cn) => cn.toLowerCase().includes(q)) ||
      r.uses.toLowerCase().includes(q)
  )
}

const DEBOUNCE_MS = 350
const LIMIT = 50

/** Shared elevated-card surface, matching the Supply Readiness elegance pass. */
const CARD_SURFACE =
  'rounded-2xl border border-desert-stone-lighter/60 bg-desert-white ' +
  'shadow-[0_1px_2px_rgba(66,68,32,0.04),0_8px_24px_-12px_rgba(66,68,32,0.12)]'

/** Read an initial situation slug from ?situation= (reverse-link deep link). */
function initialSituationSlug(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('situation')
}

/**
 * Match a free-text query to a curated situation by slug or label (case-insensitive:
 * exact first, then "contains"). Returns the matched summary or null. The curated
 * `searchTerms` are server-only, so off-list queries fall through to free-text on the
 * API — which still resolves a situation against the FULLTEXT index.
 */
function matchSituation(query: string, conditions: ConditionSummary[]): ConditionSummary | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const exact = conditions.find((c) => c.slug.toLowerCase() === q || c.label.toLowerCase() === q)
  if (exact) return exact
  return (
    conditions.find(
      (c) => c.label.toLowerCase().includes(q) || c.slug.replace(/-/g, ' ').includes(q)
    ) ?? null
  )
}

/** Stable key for a collapsed drug result (brand+generic identity). */
function drugKey(d: DrugSearchResult): string {
  return `${(d.brand_name ?? '').toLowerCase()}|${(d.generic_name ?? '').toLowerCase()}`
}

/**
 * Unified Drug Reference surface.
 *
 * One search box runs BOTH directions of the symbiotic relationship:
 *   - drug-name search   (a drug → identity)         → "Drugs" section
 *   - situation matching (a situation → its drugs)   → "For …" section
 * Curated situation chips are always visible for browsing; clicking one searches it.
 *
 * Empty state (rowCount === 0): the "download FDA drug data" prompt + IngestStatus.
 * Once data is loaded: chips + dual-section results, with the FDA-data update control
 * and source citation at the foot.
 */
export default function DrugReferenceIndex({ ingestStatus, rowCount, conditions, remedies }: PageProps) {
  const [query, setQuery] = useState('')
  const [productType, setProductType] = useState<string | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance')
  const [remedyKind, setRemedyKind] = useState<'all' | 'herb' | 'self-care'>('all')

  // Drug-name results.
  const [drugResults, setDrugResults] = useState<DrugSearchResult[]>([])
  const [drugLoading, setDrugLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // Situation results.
  const [situation, setSituation] = useState<ConditionSummary | null>(null)
  const [situationDrugs, setSituationDrugs] = useState<DrugSearchResult[]>([])
  const [situationRemedies, setSituationRemedies] = useState<NaturalRemedy[]>([])
  const [situationLoading, setSituationLoading] = useState(false)

  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [triggering, setTriggering] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [status, setStatus] = useState<DrugIngestStatus | null>(ingestStatus)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Top-level phase derived from the two sub-phases. `busy` = a phase is running.
  const phase = status?.phase ?? 'idle'
  const busy = phase === 'downloading' || phase === 'ingesting'
  // The manual "Ingest into search" button is available once parts are on disk.
  const canIngestFromDisk =
    status?.download.state === 'completed' && status?.ingest.state !== 'running'

  // Group curated conditions by category, preserving curated order.
  const grouped = useMemo(() => {
    const map = new Map<string, ConditionSummary[]>()
    for (const c of conditions) {
      const bucket = map.get(c.category) ?? []
      bucket.push(c)
      map.set(c.category, bucket)
    }
    return Array.from(map.entries())
  }, [conditions])

  /** Drug-name search (one direction). Appends on "Load more". */
  const searchDrugs = useCallback(
    async (
      q: string,
      pt: string | null,
      rt: string | null,
      srt: 'relevance' | 'name',
      off: number,
      append: boolean
    ) => {
      // The Natural pill routes the by-name direction to the curated herb list
      // (client-side, see remedyMatches) — drug_labels isn't queried at all.
      if (pt === NATURAL_FILTER || !q.trim()) {
        setDrugResults([])
        setHasMore(false)
        return
      }
      setDrugLoading(true)
      try {
        const params = new URLSearchParams({ q, limit: String(LIMIT), offset: String(off) })
        if (pt) params.set('product_type', pt)
        if (rt) params.set('route', rt)
        if (srt && srt !== 'relevance') params.set('sort', srt)
        const resp = await fetch(`/api/drug-reference/search?${params}`)
        if (!resp.ok) throw new Error(`Search failed: HTTP ${resp.status}`)
        const json = (await resp.json()) as { results: DrugSearchResult[] }
        const next = json.results ?? []
        setDrugResults(append ? (prev) => [...prev, ...next] : next)
        setHasMore(next.length === LIMIT)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setDrugLoading(false)
      }
    },
    []
  )

  /**
   * Situation search (the other direction). Resolves the query to a curated
   * situation (by slug) or free text, fetches that situation's OTC drugs and
   * natural remedies (Phase 2).
   * Pass an explicit slug (chip / deep link) to force the curated path.
   * opts.route and opts.sort are forwarded to the backend so the situation drug
   * stack respects the active filter controls.
   */
  const searchSituation = useCallback(
    async (
      q: string,
      conds: ConditionSummary[],
      forceSlug?: string,
      opts?: { route: string | null; sort: 'relevance' | 'name' }
    ) => {
      const matched = forceSlug
        ? conds.find((c) => c.slug === forceSlug) ?? null
        : matchSituation(q, conds)
      if (!q.trim() && !forceSlug) {
        setSituation(null)
        setSituationDrugs([])
        setSituationRemedies([])
        return
      }
      setSituationLoading(true)
      try {
        const params = new URLSearchParams()
        if (matched) params.set('slug', matched.slug)
        else params.set('q', q)
        if (opts?.route) params.set('route', opts.route)
        if (opts?.sort && opts.sort !== 'relevance') params.set('sort', opts.sort)
        const resp = await fetch(`/api/conditions/drugs?${params}`)
        if (!resp.ok) throw new Error(`Search failed: HTTP ${resp.status}`)
        const json = (await resp.json()) as ConditionDrugsResult
        setSituation(json.condition ?? matched ?? { slug: '', label: q.trim(), category: 'Search' })
        setSituationDrugs(json.drugs ?? [])
        setSituationRemedies(json.remedies ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        setSituationLoading(false)
      }
    },
    []
  )

  /** Run both directions for a query. */
  const runSearch = useCallback(
    (q: string, pt: string | null, rt: string | null, srt: 'relevance' | 'name') => {
      setError(null)
      setOffset(0)
      setSearched(q.trim().length > 0)
      searchDrugs(q, pt, rt, srt, 0, false)
      searchSituation(q, conditions, undefined, { route: rt, sort: srt })
    },
    [conditions, searchDrugs, searchSituation]
  )

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(val, productType, route, sort), DEBOUNCE_MS)
  }

  const handleFilterChange = (pt: string | null) => {
    setProductType(pt)
    setOffset(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Product-type filter only narrows the drug-name section.
    searchDrugs(query, pt, route, sort, 0, false)
  }

  const handleRouteChange = (rt: string | null) => {
    setRoute(rt)
    setOffset(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchDrugs(query, productType, rt, sort, 0, false)
    // Re-fetch the active situation with the new route filter.
    if (situation) {
      const forceSlug = situation.slug || undefined
      searchSituation(query, conditions, forceSlug, { route: rt, sort })
    }
  }

  const handleSortChange = (srt: 'relevance' | 'name') => {
    setSort(srt)
    setOffset(0)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    searchDrugs(query, productType, route, srt, 0, false)
    // Re-fetch the active situation with the new sort order.
    if (situation) {
      const forceSlug = situation.slug || undefined
      searchSituation(query, conditions, forceSlug, { route, sort: srt })
    }
  }

  /** Click a chip (or follow a deep link): set the box and search that situation. */
  const selectSituation = useCallback(
    (c: ConditionSummary) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      setQuery(c.label)
      setError(null)
      setOffset(0)
      setSearched(true)
      searchDrugs(c.label, productType, route, sort, 0, false)
      searchSituation(c.label, conditions, c.slug)
    },
    [conditions, productType, route, sort, searchDrugs, searchSituation]
  )

  // Honor a ?situation= deep link from the drug-detail reverse link, once.
  useEffect(() => {
    const slug = initialSituationSlug()
    if (!slug) return
    const target = conditions.find((c) => c.slug === slug)
    if (target) selectSituation(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    searchDrugs(query, productType, route, sort, newOffset, true)
  }

  const refreshStatus = async () => {
    const statusResp = await fetch('/api/drug-reference/status')
    if (statusResp.ok) setStatus(await statusResp.json())
  }

  const handleTriggerDownload = async () => {
    if (triggering) return
    setTriggering(true)
    try {
      const resp = await fetch('/api/drug-reference/download', { method: 'POST' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      await refreshStatus()
    } catch {
      // ignore — status will update on next poll
    } finally {
      setTriggering(false)
    }
  }

  const handleIngestFromDisk = async () => {
    if (ingesting) return
    setIngesting(true)
    try {
      const resp = await fetch('/api/drug-reference/ingest', { method: 'POST' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      await refreshStatus()
    } catch {
      // ignore — status will update on next poll
    } finally {
      setIngesting(false)
    }
  }

  // Escape hatch for a wedged ingest: a worker killed mid-ingest (e.g. during an
  // upgrade) can leave the job 'active' with a stale lock, which disables the
  // normal buttons ("Indexing…") until lockDuration elapses. This force-clears
  // that job and restarts ingest from the on-disk parts (no re-download).
  const handleResetIngest = async () => {
    if (resetting) return
    if (
      !window.confirm(
        'Restart the ingest? This clears the current (possibly stuck) ingest job and ' +
          're-runs it from the already-downloaded files.'
      )
    ) {
      return
    }
    setResetting(true)
    try {
      const resp = await fetch('/api/drug-reference/reset-ingest', { method: 'POST' })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      await refreshStatus()
    } catch {
      // ignore — status will update on next poll
    } finally {
      setResetting(false)
    }
  }

  const handleStatusRefresh = async () => {
    try {
      const resp = await fetch('/api/drug-reference/status')
      if (resp.ok) {
        const newStatus = (await resp.json()) as DrugIngestStatus
        setStatus(newStatus)
        if (newStatus.phase === 'ready' && newStatus.rowCount > rowCount) {
          router.reload({ only: ['rowCount', 'ingestStatus'] })
        }
      }
    } catch {
      // ignore
    }
  }

  const isEmpty = rowCount === 0
  const hasQuery = query.trim().length > 0
  const loading = drugLoading || situationLoading

  // Dedupe: a drug shown in the situation section is suppressed from the drug-name
  // section so the same product never appears twice on one screen.
  const situationKeys = useMemo(
    () => new Set(situationDrugs.map(drugKey)),
    [situationDrugs]
  )
  const dedupedDrugResults = useMemo(
    () => drugResults.filter((d) => !situationKeys.has(drugKey(d))),
    [drugResults, situationKeys]
  )

  // Remedy matches for the by-name direction. With the Natural pill active an
  // empty box browses the whole curated list; with a query it narrows by
  // name/common-names/uses. Under Rx/OTC the user asked for drugs specifically,
  // so the remedy block stays out of the way.
  const remedyMatches = useMemo(() => {
    let base: NaturalRemedy[]
    if (productType === NATURAL_FILTER) {
      base = query.trim() ? matchRemedies(remedies, query) : remedies
    } else if (productType === null) {
      base = matchRemedies(remedies, query)
    } else {
      return []
    }
    if (remedyKind === 'all') return base
    return base.filter((r) => (r.kind ?? 'herb') === remedyKind)
  }, [remedies, query, productType, remedyKind])

  // When the Natural pill is active, hide the OTC drugs sub-section in the
  // situation card (user asked for herbs/self-care only).
  const visibleSituationDrugs = productType === NATURAL_FILTER ? [] : situationDrugs

  // When a specific remedyKind filter is active, narrow the situation remedies too.
  // Show remedies only when Natural pill (NATURAL_FILTER) or All-types (null).
  const visibleSituationRemedies = useMemo(() => {
    if (productType !== null && productType !== NATURAL_FILTER) return []
    if (remedyKind === 'all') return situationRemedies
    return situationRemedies.filter((r) => (r.kind ?? 'herb') === remedyKind)
  }, [situationRemedies, productType, remedyKind])

  const showSituationSection =
    situation !== null && (visibleSituationDrugs.length > 0 || visibleSituationRemedies.length > 0)
  const showDrugSection = dedupedDrugResults.length > 0
  const showRemedySection = remedyMatches.length > 0
  const nothingFound =
    searched && !loading && !showSituationSection && !showDrugSection && !showRemedySection

  return (
    <AppLayout>
      <Head title="Drug Reference" />

      <div className="p-4 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
            <h1 className="text-2xl font-bold text-desert-green-darker">Drug Reference</h1>
            {rowCount > 0 && (
              <Link href="/drug-reference/interactions">
                <StyledButton variant="outline" size="sm" onClick={() => {}}>
                  Compare interactions
                </StyledButton>
              </Link>
            )}
          </div>
          <p className="text-sm opacity-70">
            Search a drug by name, or a situation — burn, fever, diarrhea — to see the
            over-the-counter drugs whose offline FDA labels treat it.{' '}
            {rowCount > 0 ? `${rowCount.toLocaleString()} labels.` : ''}
          </p>
        </div>

        {isEmpty ? (
          // ── Empty state ────────────────────────────────────────────────────
          <div className="border-2 border-dashed border-desert-stone-lighter rounded-2xl p-8 text-center bg-desert-white">
            <p className="text-lg font-semibold mb-2 text-desert-green-darker">No FDA drug data yet</p>
            <p className="mb-6 opacity-70">
              Download the openFDA drug-label dataset to enable offline search. Requires ~1.7 GB
              compressed download (~8–10 GB after ingestion).
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <StyledButton
                variant="primary"
                onClick={handleTriggerDownload}
                disabled={triggering || busy}
              >
                {phase === 'downloading'
                  ? 'Downloading…'
                  : phase === 'ingesting'
                    ? 'Indexing…'
                    : triggering
                      ? 'Starting…'
                      : 'Download FDA drug data'}
              </StyledButton>

              {canIngestFromDisk && (
                <StyledButton
                  variant="secondary"
                  onClick={handleIngestFromDisk}
                  disabled={ingesting || busy}
                >
                  {ingesting ? 'Starting…' : 'Ingest into search'}
                </StyledButton>
              )}

              {/* Escape hatch — only while ingest appears to be running. Clears a
                  wedged "Indexing…" state (stale active job from a killed worker)
                  and restarts from the already-downloaded files. */}
              {phase === 'ingesting' && (
                <StyledButton
                  variant="outline"
                  onClick={handleResetIngest}
                  disabled={resetting}
                >
                  {resetting ? 'Restarting…' : 'Restart ingest'}
                </StyledButton>
              )}
            </div>

            {status && (
              <div className="mt-6">
                <IngestStatus status={status} onRefresh={handleStatusRefresh} />
              </div>
            )}
          </div>
        ) : (
          // ── Unified search surface ─────────────────────────────────────────
          <>
            {/* Search box */}
            <div className="relative mb-3">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-desert-stone"
              />
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search a drug or a situation — ibuprofen, heartburn, poison ivy…"
                className="w-full rounded-lg border border-desert-stone-lighter bg-white py-2 pl-10 pr-4 text-sm text-desert-green-darker transition focus:border-desert-green focus:outline-none focus:ring-2 focus:ring-desert-green/20"
              />
            </div>

            {/* OTC / Rx filter pills — narrow the by-name drug section */}
            <div className="flex flex-wrap gap-2 mb-6">
              <FilterPill active={productType === null} onClick={() => handleFilterChange(null)}>
                All
              </FilterPill>
              <FilterPill
                active={productType === PRODUCT_TYPES.OTC}
                tone="olive"
                onClick={() => handleFilterChange(PRODUCT_TYPES.OTC)}
              >
                OTC
              </FilterPill>
              <FilterPill
                active={productType === PRODUCT_TYPES.RX}
                tone="orange"
                onClick={() => handleFilterChange(PRODUCT_TYPES.RX)}
              >
                Rx
              </FilterPill>
              <FilterPill
                active={productType === NATURAL_FILTER}
                tone="olive"
                onClick={() => handleFilterChange(NATURAL_FILTER)}
              >
                Natural
              </FilterPill>

              {/* Secondary controls: route + sort for the drug-name search, or
                  herb/self-care sub-filter when Natural is active. */}
              {productType === NATURAL_FILTER ? (
                <div className="flex items-center gap-2 ml-auto">
                  {(['all', 'herb', 'self-care'] as const).map((k) => (
                    <FilterPill key={k} active={remedyKind === k} onClick={() => setRemedyKind(k)}>
                      {k === 'all' ? 'All kinds' : k === 'herb' ? 'Herbs' : 'Self-care'}
                    </FilterPill>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-auto">
                  <select
                    value={route ?? ''}
                    onChange={(e) => handleRouteChange(e.target.value || null)}
                    className="rounded-lg border border-desert-stone-lighter bg-white px-2 py-1 text-xs text-desert-green-darker focus:border-desert-green focus:outline-none"
                    aria-label="Filter by administration route"
                  >
                    <option value="">Any route</option>
                    {ROUTE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {routeLabel(r)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={sort}
                    onChange={(e) => handleSortChange(e.target.value as 'relevance' | 'name')}
                    className="rounded-lg border border-desert-stone-lighter bg-white px-2 py-1 text-xs text-desert-green-darker focus:border-desert-green focus:outline-none"
                    aria-label="Sort drug results"
                  >
                    <option value="relevance">Best match</option>
                    <option value="name">A–Z</option>
                  </select>
                </div>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-desert-red/30 bg-desert-red/5 p-3 text-sm text-desert-red-dark">
                {error}
              </div>
            )}

            {loading && !showSituationSection && !showDrugSection && (
              <div className="text-center py-8 opacity-60">Searching…</div>
            )}

            {/* ── Situation section (a situation → its drugs + remedies) ──────── */}
            {showSituationSection && (
              <section className={`${CARD_SURFACE} mb-6 overflow-hidden`}>
                {/* Section header */}
                <div className="flex items-center gap-2.5 border-b border-desert-stone-lighter/40 bg-desert-sand/40 px-4 py-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-desert-olive/10 text-desert-olive-dark">
                    <IconFirstAidKit size={18} />
                  </span>
                  <h2 className="text-sm font-bold text-desert-green-darker">
                    For{' '}
                    <span className="text-desert-olive-dark">
                      &ldquo;{situation?.label}&rdquo;
                    </span>
                  </h2>
                  <span className="ml-auto text-xs text-desert-stone">
                    {visibleSituationDrugs.length > 0 && `${visibleSituationDrugs.length} OTC`}
                    {visibleSituationDrugs.length > 0 && visibleSituationRemedies.length > 0 && ' · '}
                    {visibleSituationRemedies.length > 0 && `${visibleSituationRemedies.length} natural`}
                  </span>
                </div>

                {/* OTC drugs sub-section */}
                {visibleSituationDrugs.length > 0 && (
                  <>
                    {visibleSituationRemedies.length > 0 && (
                      <div className="px-4 py-2 bg-desert-white border-b border-desert-stone-lighter/30">
                        <span className="text-xs font-semibold text-desert-stone uppercase tracking-wide">
                          Over-the-counter options
                        </span>
                      </div>
                    )}
                    <div className="divide-y divide-desert-stone-lighter/40">
                      {visibleSituationDrugs.map((d) => (
                        <DrugResultRow key={`sit-${d.id}`} result={d} />
                      ))}
                    </div>
                  </>
                )}

                {/* Natural remedies sub-section */}
                {visibleSituationRemedies.length > 0 && (
                  <div className="border-t border-desert-tan-lighter/40 bg-desert-sand/20">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-desert-tan-lighter/30">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-desert-tan-dark">
                        <IconLeaf size={14} />
                      </span>
                      <span className="text-xs font-semibold text-desert-tan-dark uppercase tracking-wide">
                        Natural remedies
                      </span>
                    </div>
                    <p className="px-4 py-2 text-xs text-desert-stone-dark border-b border-desert-tan-lighter/20">
                      Complementary remedies — limited evidence, not FDA-evaluated. Talk to a
                      clinician before use.
                    </p>
                    <div className="divide-y divide-desert-tan-lighter/30">
                      {visibleSituationRemedies.map((r) => (
                        <SituationRemedyRow key={r.slug} remedy={r} />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* ── Drug-name section (a drug → identity) ─────────────────────── */}
            {showDrugSection && (
              <section className={`${CARD_SURFACE} mb-6 overflow-hidden`}>
                <div className="flex items-center gap-2.5 border-b border-desert-stone-lighter/40 bg-desert-sand/40 px-4 py-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-desert-green/10 text-desert-green">
                    <IconSearch size={18} />
                  </span>
                  <h2 className="text-sm font-bold text-desert-green-darker">Drugs</h2>
                  <span className="ml-auto text-xs text-desert-stone">
                    {dedupedDrugResults.length} match
                    {dedupedDrugResults.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="divide-y divide-desert-stone-lighter/40">
                  {dedupedDrugResults.map((d) => (
                    <DrugResultRow key={`drug-${d.id}`} result={d} />
                  ))}
                </div>
                {hasMore && (
                  <div className="flex justify-center border-t border-desert-stone-lighter/40 p-3">
                    <StyledButton variant="secondary" onClick={handleLoadMore} disabled={drugLoading}>
                      {drugLoading ? 'Loading…' : 'Load more'}
                    </StyledButton>
                  </div>
                )}
              </section>
            )}

            {/* ── Natural remedies by name (or full browse on the Natural pill) ── */}
            {showRemedySection && (
              <section className={`${CARD_SURFACE} mb-6 overflow-hidden`}>
                <div className="flex items-center gap-2.5 border-b border-desert-tan-lighter/40 bg-desert-sand/40 px-4 py-3">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-desert-tan/10 text-desert-tan-dark">
                    <IconLeaf size={18} />
                  </span>
                  <h2 className="text-sm font-bold text-desert-green-darker">Natural remedies</h2>
                  <span className="ml-auto text-xs text-desert-stone">
                    {remedyMatches.length} match{remedyMatches.length !== 1 ? 'es' : ''}
                  </span>
                </div>
                <p className="px-4 py-2 text-xs text-desert-stone-dark border-b border-desert-tan-lighter/20">
                  Complementary remedies — limited evidence, not FDA-evaluated. Talk to a
                  clinician before use.
                </p>
                <div className="divide-y divide-desert-tan-lighter/30">
                  {remedyMatches.map((r) => (
                    <SituationRemedyRow key={`name-${r.slug}`} remedy={r} />
                  ))}
                </div>
              </section>
            )}

            {nothingFound && (
              <div className="text-center py-8 opacity-60">
                No drugs, remedies, or situations match &ldquo;{query}&rdquo;. Try a situation below.
              </div>
            )}

            {/* ── Browse: curated situation chips (always visible) ──────────── */}
            <section className={`${CARD_SURFACE} overflow-hidden`}>
              <div className="border-b border-desert-stone-lighter/40 bg-gradient-to-b from-desert-sand/50 to-transparent px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-desert-olive/10 text-desert-olive-dark">
                    <IconFirstAidKit size={18} />
                  </span>
                  <h2 className="text-sm font-bold text-desert-green-darker">Browse by situation</h2>
                </div>
                <p className="mt-1.5 text-xs text-desert-stone">
                  {hasQuery
                    ? 'Or pick another situation to see its over-the-counter options.'
                    : 'Pick a situation to see the over-the-counter drugs whose FDA labels list it.'}
                </p>
              </div>

              <div className="space-y-5 p-5">
                <SafetyBanner />
                {grouped.map(([category, items]) => (
                  <div key={category}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-desert-tan-dark">
                      {category}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {items.map((c) => {
                        const active = situation?.slug === c.slug
                        return (
                          <button
                            key={c.slug}
                            type="button"
                            onClick={() => selectSituation(c)}
                            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                              active
                                ? 'border-desert-olive bg-desert-olive text-white'
                                : 'border-desert-stone-lighter bg-white text-desert-green-darker hover:border-desert-olive hover:bg-desert-olive/5'
                            }`}
                          >
                            {c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── FDA data update control ───────────────────────────────────── */}
            <div className="mt-8 pt-6 border-t border-desert-stone-lighter/40">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-desert-green-darker">FDA data</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {canIngestFromDisk && (
                    <StyledButton
                      variant="outline"
                      size="sm"
                      onClick={handleIngestFromDisk}
                      disabled={ingesting || busy}
                    >
                      {ingesting ? 'Starting…' : 'Ingest into search'}
                    </StyledButton>
                  )}
                  <StyledButton
                    variant="secondary"
                    onClick={handleTriggerDownload}
                    disabled={triggering || busy}
                  >
                    {phase === 'downloading'
                      ? 'Downloading…'
                      : phase === 'ingesting'
                        ? 'Indexing…'
                        : 'Update FDA data'}
                  </StyledButton>
                </div>
              </div>
              {status && <IngestStatus status={status} onRefresh={handleStatusRefresh} />}
            </div>
          </>
        )}

        {/* ── Source citation (CC0, no-endorsement) ───────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-desert-stone-lighter/40 text-xs text-desert-stone">
          <strong>Source:</strong> U.S. Food &amp; Drug Administration drug labeling, via{' '}
          <strong>openFDA</strong> — public domain (CC0 1.0). NOMAD is not affiliated with or
          endorsed by the FDA. Label data and situation matches are label-text only; do not rely on
          them for medical decisions.
        </footer>
      </div>
    </AppLayout>
  )
}

// ─── Situation remedy row (compact, inside the situation card) ────────────────

function SituationRemedyRow({ remedy }: { remedy: NaturalRemedy }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-desert-tan-dark">
            {remedy.name}
            <span className="ml-2 inline-block rounded-full bg-desert-tan/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-desert-tan-dark align-middle">
              {remedy.kind === 'self-care' ? 'Self-care' : 'Herb'}
            </span>
          </p>
          {remedy.commonNames.length > 0 && (
            <p className="text-xs text-desert-stone">{remedy.commonNames.join(', ')}</p>
          )}
        </div>
        {/* Plain-text attribution — deliberately NOT a link. The card is fully
            self-contained for offline use; nothing on it needs internet. */}
        <span className="flex-shrink-0 text-xs text-desert-stone mt-0.5">
          Source: {remedySourceName(remedy)}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-desert-green-darker">{remedy.uses}</p>
      {remedy.how && (
        <p className="mt-1 text-xs text-desert-green-darker">
          <strong>How:</strong> {remedy.how}
        </p>
      )}
      {remedy.cautions && (
        <p className="mt-1 text-xs text-desert-red-dark">
          <strong>Cautions:</strong> {remedy.cautions}
        </p>
      )}
    </div>
  )
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  active,
  tone = 'green',
  onClick,
  children,
}: {
  active: boolean
  tone?: 'green' | 'olive' | 'orange'
  onClick: () => void
  children: React.ReactNode
}) {
  const activeClass =
    tone === 'orange'
      ? 'bg-desert-orange text-white border-desert-orange'
      : tone === 'olive'
        ? 'bg-desert-olive text-white border-desert-olive'
        : 'bg-desert-green text-white border-desert-green'
  const hoverClass =
    tone === 'orange'
      ? 'hover:border-desert-orange'
      : tone === 'olive'
        ? 'hover:border-desert-olive'
        : 'hover:border-desert-green'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? activeClass
          : `border-desert-stone-lighter bg-white text-desert-green-darker ${hoverClass}`
      }`}
    >
      {children}
    </button>
  )
}
