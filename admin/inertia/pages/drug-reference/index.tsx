import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Head, Link, router } from '@inertiajs/react'
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import DrugResultRow from '~/components/drug-reference/DrugResultRow'
import IngredientGroup, { type IngredientGrouping } from '~/components/drug-reference/IngredientGroup'
import DrugDisclaimerModal, { hasAcknowledgedDrugDisclaimer } from '~/components/drug-reference/DrugDisclaimerModal'
import IngestStatus from '~/components/drug-reference/IngestStatus'
import SafetyBanner from '~/components/conditions/SafetyBanner'
import RemedySafetyNote from '~/components/conditions/RemedySafetyNote'
import {
  IconSearch,
  IconFirstAidKit,
  IconLeaf,
  IconPill,
  IconDatabase,
  IconAdjustmentsHorizontal,
  IconX,
  IconChevronDown,
} from '@tabler/icons-react'
import type { DrugSearchResult, DrugIngestStatus } from '../../../types/drug_reference'
import type { ConditionSummary, ConditionDrugsResult, NaturalRemedy } from '../../../types/conditions'
import { remedySourceName } from '../../../util/conditions'
import { PRODUCT_TYPES } from '../../../types/drug_reference'

interface PageProps {
  ingestStatus: DrugIngestStatus | null
  rowCount: number
  conditions: ConditionSummary[]
  remedies: NaturalRemedy[]
  /**
   * Affirmative-content gate (#1040). False by default: the server sends no
   * remedy data and the "Natural" filter is hidden, so only FDA label search and
   * condition→OTC matching show. Flipped on after a clinician content-pass.
   */
  remediesEnabled?: boolean
}

/**
 * Curated administration routes for the "Form" filter — the common openFDA
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

/** Friendly "form" label for a route value (how you take it), plainer than the raw route. */
const ROUTE_FRIENDLY: Record<string, string> = {
  ORAL: 'Oral (pill, liquid)',
  TOPICAL: 'Topical (cream, gel)',
  OPHTHALMIC: 'Eye drops',
  OTIC: 'Ear drops',
  NASAL: 'Nasal spray',
  INHALATION: 'Inhaler',
  SUBLINGUAL: 'Under the tongue',
  RECTAL: 'Rectal',
  VAGINAL: 'Vaginal',
  TRANSDERMAL: 'Skin patch',
  DENTAL: 'Dental',
}

const DEBOUNCE_MS = 350
const LIMIT = 50
/** Max drugs shown per situation card (ranked, so the useful ones are on top). */
const PER_SITUATION_DISPLAY = 25

/** Shared elevated-card surface for the result and detail panels. */
const CARD_SURFACE =
  'rounded-2xl border border-desert-stone-lighter/60 bg-desert-white ' +
  'shadow-[0_1px_2px_rgba(66,68,32,0.04),0_8px_24px_-12px_rgba(66,68,32,0.12)]'

/** Read an initial situation slug from ?situation= (reverse-link deep link). */
function initialSituationSlug(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('situation')
}

/** Stable key for a collapsed drug result (brand+generic identity). */
function drugKey(d: DrugSearchResult): string {
  return `${(d.brand_name ?? '').toLowerCase()}|${(d.generic_name ?? '').toLowerCase()}`
}

/** Normalised active-ingredient group key (order/case-insensitive so combos group cleanly). */
function ingredientKey(d: DrugSearchResult): string {
  return (d.generic_name ?? 'Other')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join(', ')
}

/** How many active ingredients a product lists (homeopathics carry many). */
function ingredientCount(d: DrugSearchResult): number {
  return Math.max(1, (d.generic_name ?? '').split(',').filter((s) => s.trim()).length)
}

/**
 * Rank situation matches so simple, single-ingredient OTC drugs (ibuprofen,
 * acetaminophen) come before the many-ingredient homeopathic products the raw
 * FDA indication match floods in. Not a medical judgement — just "fewer active
 * ingredients first", the same principle as the drug-search grouping. Relevance
 * order is preserved within a tier.
 */
function rankSituationDrugs(drugs: DrugSearchResult[]): DrugSearchResult[] {
  return drugs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      const diff = ingredientCount(a.d) - ingredientCount(b.d)
      return diff !== 0 ? diff : a.i - b.i
    })
    .map((x) => x.d)
}

/**
 * Group collapsed drug results by active ingredient, single-ingredient groups
 * first (P2 — the recognizable thing a user typed), then combination products.
 * Within a rank tier, larger groups (more products) come first.
 */
function groupByIngredient(results: DrugSearchResult[]): IngredientGrouping[] {
  const map = new Map<string, IngredientGrouping>()
  for (const d of results) {
    const key = ingredientKey(d)
    let g = map.get(key)
    if (!g) {
      const parts = key.split(', ')
      const label = parts
        .map((p) => (p ? p.charAt(0) + p.slice(1).toLowerCase() : p))
        .join(' + ')
      g = { key, label: label || 'Other', single: parts.length <= 1, products: [] }
      map.set(key, g)
    }
    g.products.push(d)
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.single !== b.single) return a.single ? -1 : 1
    return b.products.length - a.products.length
  })
}

/**
 * Unified Drug Reference surface — three tabs:
 *   1. Search by drug   — name search, results grouped by active ingredient.
 *   2. By situation      — multi-select symptoms → intersection + per-situation groups.
 *   3. FDA data          — download/ingest status + source.
 *
 * Empty state (rowCount === 0) keeps the prominent "download FDA drug data"
 * prompt; the tabs only appear once data is installed.
 */
export default function DrugReferenceIndex({
  ingestStatus,
  rowCount,
  conditions,
  remediesEnabled = false,
}: PageProps) {
  // ── Tab 1: drug-name search ────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [productType, setProductType] = useState<string | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const [sort, setSort] = useState<'relevance' | 'name'>('relevance')
  const [drugResults, setDrugResults] = useState<DrugSearchResult[]>([])
  const [drugLoading, setDrugLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [drugSearched, setDrugSearched] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Tab 2: situations (multi-select) ───────────────────────────────────────
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [sitResults, setSitResults] = useState<
    Record<string, { label: string; drugs: DrugSearchResult[]; remedies: NaturalRemedy[]; loading: boolean }>
  >({})
  const [browseOpen, setBrowseOpen] = useState(true)

  // ── Tab 3 / ingest ─────────────────────────────────────────────────────────
  const [triggering, setTriggering] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [status, setStatus] = useState<DrugIngestStatus | null>(ingestStatus)

  const [error, setError] = useState<string | null>(null)
  const [tabIndex, setTabIndex] = useState(0)

  // First-open disclaimer gate (per-browser, localStorage). Checked after mount
  // to avoid an SSR/hydration mismatch on window.localStorage.
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  useEffect(() => {
    if (!hasAcknowledgedDrugDisclaimer()) setShowDisclaimer(true)
  }, [])

  const phase = status?.phase ?? 'idle'
  const busy = phase === 'downloading' || phase === 'ingesting'
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

  // ── Drug-name search ────────────────────────────────────────────────────────
  const searchDrugs = useCallback(
    async (
      q: string,
      pt: string | null,
      rt: string | null,
      srt: 'relevance' | 'name',
      off: number,
      append: boolean
    ) => {
      if (!q.trim()) {
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

  const runDrugSearch = useCallback(
    (q: string, pt: string | null, rt: string | null, srt: 'relevance' | 'name') => {
      setError(null)
      setOffset(0)
      setDrugSearched(q.trim().length > 0)
      searchDrugs(q, pt, rt, srt, 0, false)
    },
    [searchDrugs]
  )

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runDrugSearch(val, productType, route, sort), DEBOUNCE_MS)
  }
  const handleFilterChange = (pt: string | null) => {
    setProductType(pt)
    runDrugSearch(query, pt, route, sort)
  }
  const handleRouteChange = (rt: string | null) => {
    setRoute(rt)
    runDrugSearch(query, productType, rt, sort)
  }
  const handleSortChange = (srt: 'relevance' | 'name') => {
    setSort(srt)
    runDrugSearch(query, productType, route, srt)
  }
  const handleLoadMore = () => {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    searchDrugs(query, productType, route, sort, newOffset, true)
  }

  const ingredientGroups = useMemo(() => groupByIngredient(drugResults), [drugResults])
  const drugNothing = drugSearched && !drugLoading && drugResults.length === 0

  // Auto-collapse the filter drawer once results land (keeps controls on top, tidy).
  useEffect(() => {
    if (drugResults.length > 0) setFiltersOpen(false)
  }, [drugResults.length > 0])

  // ── Situation search (multi-select) ─────────────────────────────────────────
  const fetchSituation = useCallback(
    async (c: ConditionSummary, rt: string | null, srt: 'relevance' | 'name') => {
      setSitResults((prev) => ({
        ...prev,
        [c.slug]: { label: c.label, drugs: prev[c.slug]?.drugs ?? [], remedies: prev[c.slug]?.remedies ?? [], loading: true },
      }))
      try {
        // Pull a wide result set (200) and rank single-ingredient drugs first, so
        // real OTC options surface above the homeopathic flood — and so the
        // cross-situation intersection can actually find the common drugs.
        const params = new URLSearchParams({ slug: c.slug, limit: '200' })
        if (rt) params.set('route', rt)
        if (srt && srt !== 'relevance') params.set('sort', srt)
        const resp = await fetch(`/api/conditions/drugs?${params}`)
        if (!resp.ok) throw new Error(`Search failed: HTTP ${resp.status}`)
        const json = (await resp.json()) as ConditionDrugsResult
        setSitResults((prev) => ({
          ...prev,
          [c.slug]: {
            label: c.label,
            drugs: rankSituationDrugs(json.drugs ?? []),
            remedies: json.remedies ?? [],
            loading: false,
          },
        }))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setSitResults((prev) => ({ ...prev, [c.slug]: { label: c.label, drugs: [], remedies: [], loading: false } }))
      }
    },
    []
  )

  const toggleSituation = useCallback(
    (c: ConditionSummary) => {
      setError(null)
      setSelectedSlugs((prev) => {
        if (prev.includes(c.slug)) return prev.filter((s) => s !== c.slug)
        return [...prev, c.slug]
      })
      if (!selectedSlugs.includes(c.slug)) fetchSituation(c, route, sort)
    },
    [selectedSlugs, fetchSituation, route, sort]
  )

  // Re-fetch selected situations when route/sort change.
  useEffect(() => {
    for (const slug of selectedSlugs) {
      const c = conditions.find((x) => x.slug === slug)
      if (c) fetchSituation(c, route, sort)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, sort])

  // Honor a ?situation= deep link — jump to the situation tab and select it.
  useEffect(() => {
    const slug = initialSituationSlug()
    if (!slug) return
    const target = conditions.find((c) => c.slug === slug)
    if (target) {
      setTabIndex(1)
      setSelectedSlugs([target.slug])
      fetchSituation(target, null, 'relevance')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Intersection ("treats all of these") — drugs present in EVERY selected situation.
  const intersection = useMemo(() => {
    const ready = selectedSlugs.map((s) => sitResults[s]).filter((r) => r && !r.loading)
    if (ready.length < 2 || ready.length !== selectedSlugs.length) return []
    const lists = ready.map((r) => r!.drugs)
    if (lists.some((l) => l.length === 0)) return []
    const [first, ...rest] = lists
    const keySets = rest.map((l) => new Set(l.map(drugKey)))
    return first.filter((d) => keySets.every((ks) => ks.has(drugKey(d))))
  }, [selectedSlugs, sitResults])
  const intersectionKeys = useMemo(() => new Set(intersection.map(drugKey)), [intersection])

  const anySituationSelected = selectedSlugs.length > 0
  const situationLoading = selectedSlugs.some((s) => sitResults[s]?.loading)

  // Auto-collapse the browse list once a situation is picked.
  useEffect(() => {
    if (selectedSlugs.length > 0) setBrowseOpen(false)
  }, [selectedSlugs.length > 0])

  // ── Ingest handlers ─────────────────────────────────────────────────────────
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
      // status will update on next poll
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
      // status will update on next poll
    } finally {
      setIngesting(false)
    }
  }
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
      // status will update on next poll
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

  // ── Empty state (no tabs until data is installed) ──────────────────────────
  if (isEmpty) {
    return (
      <AppLayout compact>
        <Head title="Drug Reference" />
        <div className="p-4 max-w-4xl mx-auto">
          <PageHeader rowCount={rowCount} />
          <DrugDisclaimerModal open={showDisclaimer} onAcknowledge={() => setShowDisclaimer(false)} />
          <div className="border-2 border-dashed border-desert-stone-lighter rounded-2xl p-8 text-center bg-desert-white">
            <p className="text-lg font-semibold mb-2 text-desert-green-darker">No FDA drug data yet</p>
            <p className="mb-6 opacity-70">
              Download the openFDA drug-label dataset to enable offline search. Requires ~1.7 GB
              compressed download (~8–10 GB after ingestion).
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <StyledButton variant="primary" onClick={handleTriggerDownload} disabled={triggering || busy}>
                {phase === 'downloading'
                  ? 'Downloading…'
                  : phase === 'ingesting'
                    ? 'Indexing…'
                    : triggering
                      ? 'Starting…'
                      : 'Download FDA drug data'}
              </StyledButton>
              {canIngestFromDisk && (
                <StyledButton variant="secondary" onClick={handleIngestFromDisk} disabled={ingesting || busy}>
                  {ingesting ? 'Starting…' : 'Ingest into search'}
                </StyledButton>
              )}
              {phase === 'ingesting' && (
                <StyledButton variant="outline" onClick={handleResetIngest} disabled={resetting}>
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
          <SourceFooter />
        </div>
      </AppLayout>
    )
  }

  const tabClass = ({ selected }: { selected: boolean }) =>
    `flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
      selected
        ? 'border-desert-green text-desert-green-darker'
        : 'border-transparent text-desert-stone hover:text-desert-green-darker hover:border-desert-stone-lighter'
    }`

  return (
    <AppLayout compact>
      <Head title="Drug Reference" />
      <div className="p-4 max-w-4xl mx-auto">
        <PageHeader rowCount={rowCount} />
        <DrugDisclaimerModal open={showDisclaimer} onAcknowledge={() => setShowDisclaimer(false)} />

        <TabGroup selectedIndex={tabIndex} onChange={setTabIndex}>
          <TabList className="mb-5 flex gap-1 border-b border-desert-stone-lighter/50">
            <Tab className={tabClass}>
              <IconSearch size={16} /> Search by drug
            </Tab>
            <Tab className={tabClass}>
              <IconFirstAidKit size={16} /> By situation
            </Tab>
            <Tab className={tabClass}>
              <IconDatabase size={16} /> FDA data
            </Tab>
          </TabList>

          {error && (
            <div className="mb-4 rounded-lg border border-desert-red/30 bg-desert-red/5 p-3 text-sm text-desert-red-dark">
              {error}
            </div>
          )}

          <TabPanels>
            {/* ══ Tab 1: Search by drug ══════════════════════════════════════ */}
            <TabPanel>
              {/* Controls (always on top) */}
              <div className="relative mb-3">
                <IconSearch
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-desert-stone"
                />
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  autoFocus
                  placeholder="Search a medicine by name — ibuprofen, Benadryl, loratadine…"
                  className="w-full rounded-lg border border-desert-stone-lighter bg-surface-primary py-2.5 pl-10 pr-4 text-sm text-desert-green-darker transition focus:border-desert-green focus:outline-none focus:ring-2 focus:ring-desert-green/20"
                />
              </div>

              {/* Collapsible filter drawer */}
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <FilterPill active={productType === null} onClick={() => handleFilterChange(null)}>
                    All
                  </FilterPill>
                  <FilterPill
                    active={productType === PRODUCT_TYPES.OTC}
                    tone="olive"
                    onClick={() => handleFilterChange(PRODUCT_TYPES.OTC)}
                  >
                    Over-the-counter
                  </FilterPill>
                  <FilterPill
                    active={productType === PRODUCT_TYPES.RX}
                    tone="orange"
                    onClick={() => handleFilterChange(PRODUCT_TYPES.RX)}
                  >
                    Prescription
                  </FilterPill>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((o) => !o)}
                    className="ml-auto flex items-center gap-1 rounded-full border border-desert-stone-lighter bg-surface-primary px-3 py-1 text-xs text-desert-green-darker hover:border-desert-green"
                  >
                    <IconAdjustmentsHorizontal size={14} />
                    {route ? ROUTE_FRIENDLY[route] : 'Form'} · {sort === 'name' ? 'A–Z' : 'Best match'}
                    <IconChevronDown size={14} className={filtersOpen ? 'rotate-180 transition' : 'transition'} />
                  </button>
                </div>
                {filtersOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-desert-stone-lighter/60 bg-desert-sand/20 p-3">
                    <label className="flex items-center gap-2 text-xs text-desert-green-darker">
                      Form (how you take it)
                      <select
                        value={route ?? ''}
                        onChange={(e) => handleRouteChange(e.target.value || null)}
                        className="rounded-lg border border-desert-stone-lighter bg-surface-primary px-2 py-1 text-xs text-desert-green-darker focus:border-desert-green focus:outline-none"
                      >
                        <option value="">Any form</option>
                        {ROUTE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {ROUTE_FRIENDLY[r]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-desert-green-darker">
                      Sort
                      <select
                        value={sort}
                        onChange={(e) => handleSortChange(e.target.value as 'relevance' | 'name')}
                        className="rounded-lg border border-desert-stone-lighter bg-surface-primary px-2 py-1 text-xs text-desert-green-darker focus:border-desert-green focus:outline-none"
                      >
                        <option value="relevance">Best match</option>
                        <option value="name">A–Z</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {drugLoading && drugResults.length === 0 && (
                <div className="text-center py-8 opacity-60">Searching…</div>
              )}

              {!drugSearched && (
                <div className="rounded-2xl border border-dashed border-desert-stone-lighter/70 p-8 text-center text-sm text-desert-stone">
                  Type a medicine name above to search {rowCount.toLocaleString()} FDA drug labels.
                  <br />
                  Looking for something to treat a symptom instead? Try the{' '}
                  <button className="font-semibold text-desert-green underline" onClick={() => setTabIndex(1)}>
                    By situation
                  </button>{' '}
                  tab.
                </div>
              )}

              {ingredientGroups.length > 0 && (
                <section className={`${CARD_SURFACE} mb-6 overflow-hidden`}>
                  <div className="flex items-center gap-2.5 border-b border-desert-stone-lighter/40 bg-desert-sand/40 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-desert-green/10 text-desert-green">
                      <IconPill size={18} />
                    </span>
                    <h2 className="text-sm font-bold text-desert-green-darker">
                      {ingredientGroups.length} ingredient{ingredientGroups.length !== 1 ? 's' : ''}
                    </h2>
                    <span className="ml-auto text-xs text-desert-stone">
                      {drugResults.length} product{drugResults.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-desert-stone-lighter/40">
                    {ingredientGroups.map((g, i) => (
                      <IngredientGroup key={g.key} group={g} defaultOpen={i === 0} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center border-t border-desert-stone-lighter/40 p-3">
                      <StyledButton variant="secondary" onClick={handleLoadMore} disabled={drugLoading}>
                        {drugLoading ? 'Loading…' : 'Load more products'}
                      </StyledButton>
                    </div>
                  )}
                </section>
              )}

              {drugNothing && (
                <div className="text-center py-8 opacity-60">
                  No medicines match &ldquo;{query}&rdquo;.
                </div>
              )}
            </TabPanel>

            {/* ══ Tab 2: By situation ════════════════════════════════════════ */}
            <TabPanel>
              <SafetyBanner />

              {/* Selected situations + collapsible browser (controls on top) */}
              <div className="my-4">
                {anySituationSelected && (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-desert-stone">Selected:</span>
                    {selectedSlugs.map((slug) => {
                      const c = conditions.find((x) => x.slug === slug)
                      if (!c) return null
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => toggleSituation(c)}
                          className="flex items-center gap-1 rounded-full border border-desert-olive bg-desert-olive px-3 py-1 text-sm text-white"
                        >
                          {c.label}
                          <IconX size={14} />
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSlugs([])
                        setBrowseOpen(true)
                      }}
                      className="text-xs text-desert-stone underline hover:text-desert-green-darker"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setBrowseOpen((o) => !o)}
                  className="flex items-center gap-1 rounded-full border border-desert-stone-lighter bg-surface-primary px-3 py-1 text-xs text-desert-green-darker hover:border-desert-olive"
                >
                  <IconFirstAidKit size={14} />
                  {anySituationSelected ? 'Add another situation' : 'Pick one or more situations'}
                  <IconChevronDown size={14} className={browseOpen ? 'rotate-180 transition' : 'transition'} />
                </button>

                {browseOpen && (
                  <div className="mt-3 space-y-4 rounded-2xl border border-desert-stone-lighter/60 bg-desert-sand/20 p-4">
                    {grouped.map(([category, items]) => (
                      <div key={category}>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-desert-tan-dark">
                          {category}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {items.map((c) => {
                            const active = selectedSlugs.includes(c.slug)
                            return (
                              <button
                                key={c.slug}
                                type="button"
                                onClick={() => toggleSituation(c)}
                                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                                  active
                                    ? 'border-desert-olive bg-desert-olive text-white'
                                    : 'border-desert-stone-lighter bg-surface-primary text-desert-green-darker hover:border-desert-olive hover:bg-desert-olive/5'
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
                )}
              </div>

              {!anySituationSelected && (
                <div className="rounded-2xl border border-dashed border-desert-stone-lighter/70 p-8 text-center text-sm text-desert-stone">
                  Pick a situation (or a few) above to see the over-the-counter drugs whose FDA labels list it.
                </div>
              )}

              {situationLoading && (
                <div className="text-center py-6 opacity-60">Finding options…</div>
              )}

              {/* Intersection — treats ALL selected situations */}
              {intersection.length > 0 && (
                <section className={`${CARD_SURFACE} mb-6 overflow-hidden ring-2 ring-desert-olive/30`}>
                  <div className="flex items-center gap-2.5 border-b border-desert-olive/20 bg-desert-olive/10 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-desert-olive/20 text-desert-olive-dark">
                      <IconFirstAidKit size={18} />
                    </span>
                    <h2 className="text-sm font-bold text-desert-olive-dark">
                      Treats all {selectedSlugs.length} selected
                    </h2>
                    <span className="ml-auto text-xs text-desert-stone">{intersection.length} OTC</span>
                  </div>
                  <div className="divide-y divide-desert-stone-lighter/40">
                    {intersection.map((d) => (
                      <DrugResultRow key={`isect-${d.id}`} result={d} />
                    ))}
                  </div>
                </section>
              )}

              {/* Per-situation groups — shown only as a fallback when nothing treats
                  ALL selected (intersection empty), or for a single situation. */}
              {!situationLoading && intersection.length === 0 && selectedSlugs.length >= 2 && (
                <p className="mb-3 text-sm text-desert-stone">
                  No single option treats all {selectedSlugs.length} of these — here are options for each
                  situation.
                </p>
              )}
              {!situationLoading &&
                intersection.length === 0 &&
                selectedSlugs.map((slug) => {
                  const r = sitResults[slug]
                  if (!r || r.loading) return null
                const allDrugs = r.drugs.filter((d) => !intersectionKeys.has(drugKey(d)))
                const drugs = allDrugs.slice(0, PER_SITUATION_DISPLAY)
                const remediesShown = remediesEnabled ? r.remedies : []
                if (allDrugs.length === 0 && remediesShown.length === 0) {
                  return (
                    <p key={slug} className="mb-4 text-sm text-desert-stone">
                      No additional OTC options found for <strong>{r.label}</strong>.
                    </p>
                  )
                }
                return (
                  <section key={slug} className={`${CARD_SURFACE} mb-6 overflow-hidden`}>
                    <div className="flex items-center gap-2.5 border-b border-desert-stone-lighter/40 bg-desert-sand/40 px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-desert-olive/10 text-desert-olive-dark">
                        <IconFirstAidKit size={18} />
                      </span>
                      <h2 className="text-sm font-bold text-desert-green-darker">
                        For <span className="text-desert-olive-dark">&ldquo;{r.label}&rdquo;</span>
                      </h2>
                      <span className="ml-auto text-xs text-desert-stone">
                        {allDrugs.length} OTC
                        {allDrugs.length > PER_SITUATION_DISPLAY ? ` · top ${PER_SITUATION_DISPLAY}` : ''}
                      </span>
                    </div>
                    {drugs.length > 0 && (
                      <div className="divide-y divide-desert-stone-lighter/40">
                        {drugs.map((d) => (
                          <DrugResultRow key={`sit-${slug}-${d.id}`} result={d} />
                        ))}
                      </div>
                    )}
                    {remediesShown.length > 0 && (
                      <div className="border-t border-desert-tan-lighter/40 bg-desert-sand/20">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-desert-tan-lighter/30">
                          <IconLeaf size={14} className="text-desert-tan-dark" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-desert-tan-dark">
                            Natural remedies
                          </span>
                        </div>
                        <div className="border-b border-desert-tan-lighter/20 p-3">
                          <RemedySafetyNote />
                        </div>
                        <div className="divide-y divide-desert-tan-lighter/30">
                          {remediesShown.map((rem) => (
                            <SituationRemedyRow key={rem.slug} remedy={rem} />
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )
              })}
            </TabPanel>

            {/* ══ Tab 3: FDA data ════════════════════════════════════════════ */}
            <TabPanel>
              <div className={`${CARD_SURFACE} p-5`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-desert-green-darker">FDA drug data</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {canIngestFromDisk && (
                      <StyledButton variant="outline" size="sm" onClick={handleIngestFromDisk} disabled={ingesting || busy}>
                        {ingesting ? 'Starting…' : 'Ingest into search'}
                      </StyledButton>
                    )}
                    <StyledButton variant="secondary" size="sm" onClick={handleTriggerDownload} disabled={triggering || busy}>
                      {phase === 'downloading'
                        ? 'Downloading…'
                        : phase === 'ingesting'
                          ? 'Indexing…'
                          : 'Update FDA data'}
                    </StyledButton>
                  </div>
                </div>
                <p className="mb-4 text-xs text-desert-stone">
                  {rowCount.toLocaleString()} drug labels installed. Updating re-checks openFDA for a newer
                  dataset and refreshes the offline copy.
                </p>
                {status && <IngestStatus status={status} onRefresh={handleStatusRefresh} />}
              </div>
            </TabPanel>
          </TabPanels>
        </TabGroup>

        <SourceFooter />
      </div>
    </AppLayout>
  )
}

// ─── Page header ──────────────────────────────────────────────────────────────

function PageHeader({ rowCount }: { rowCount: number }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-desert-green-darker">Drug Reference</h1>
        {rowCount > 0 && (
          <Link href="/drug-reference/interactions">
            <StyledButton variant="outline" size="sm" onClick={() => {}}>
              Compare label warnings
            </StyledButton>
          </Link>
        )}
      </div>
      <p className="text-sm opacity-70">
        Look up a medicine by name, or start from a symptom to find over-the-counter options — all from
        offline FDA drug labels.
      </p>
    </div>
  )
}

// ─── Source citation ──────────────────────────────────────────────────────────

function SourceFooter() {
  return (
    <footer className="mt-8 pt-4 border-t border-desert-stone-lighter/40 text-xs text-desert-stone">
      <strong>Source:</strong> U.S. Food &amp; Drug Administration drug labeling, via{' '}
      <strong>openFDA</strong> — public domain (CC0 1.0). NOMAD is not affiliated with or endorsed by the
      FDA. Label data and situation matches are label-text only; do not rely on them for medical decisions.
    </footer>
  )
}

// ─── Situation remedy row ─────────────────────────────────────────────────────

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
        active ? activeClass : `border-desert-stone-lighter bg-surface-primary text-desert-green-darker ${hoverClass}`
      }`}
    >
      {children}
    </button>
  )
}
