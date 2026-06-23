import { useState, useCallback, useRef, useEffect } from 'react'
import { Head, Link } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import InteractionColumn from '~/components/drug-reference/InteractionColumn'
import IngestStatus from '~/components/drug-reference/IngestStatus'
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react'
import type { DrugSearchResult, DrugIngestStatus, DrugInteractionEntry } from '../../../types/drug_reference'
import { MAX_COMPARE, parseCompareIds } from '../../../util/compare_ids'

interface PageProps {
  ingestStatus: DrugIngestStatus | null
  rowCount: number
}

const DEBOUNCE_MS = 350

/**
 * Drug Reference — side-by-side interaction comparison page.
 *
 * Selection is URL-driven (?ids=1,2,3) so the view is shareable/bookmarkable.
 * The drug picker reuses the /api/drug-reference/search call + DrugResultRow.
 * Each selected drug renders as one InteractionColumn with removable header.
 *
 * This is NOT a pairwise checker — it surfaces each drug's own FDA-labeled
 * drug_interactions text side-by-side. A prominent amber disclaimer makes
 * this clear at all times.
 */
export default function DrugReferenceInteractions({ ingestStatus, rowCount }: PageProps) {
  // ── Selection state (URL-driven) ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    if (typeof window === 'undefined') return []
    const raw = new URLSearchParams(window.location.search).get('ids') ?? ''
    return parseCompareIds(raw)
  })

  // ── Picker state ───────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [pickerResults, setPickerResults] = useState<DrugSearchResult[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [pickerSearched, setPickerSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Comparison data ────────────────────────────────────────────────────────
  const [entries, setEntries] = useState<DrugInteractionEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // ── Sync URL when selection changes ───────────────────────────────────────
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedIds.length > 0) {
      url.searchParams.set('ids', selectedIds.join(','))
    } else {
      url.searchParams.delete('ids')
    }
    window.history.replaceState({}, '', url.toString())
  }, [selectedIds])

  // ── Load entries when selection changes ───────────────────────────────────
  useEffect(() => {
    if (selectedIds.length === 0) {
      setEntries([])
      return
    }
    setLoadingEntries(true)
    const params = new URLSearchParams({ ids: selectedIds.join(',') })
    fetch(`/api/drug-reference/interactions?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: { entries: DrugInteractionEntry[] }) => {
        setEntries(json.entries ?? [])
      })
      .catch(() => {
        setEntries([])
      })
      .finally(() => setLoadingEntries(false))
  }, [selectedIds])

  // ── Picker search ──────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setPickerResults([])
      setPickerSearched(false)
      return
    }
    setPickerLoading(true)
    setPickerError(null)
    try {
      const params = new URLSearchParams({ q, limit: '20' })
      const resp = await fetch(`/api/drug-reference/search?${params}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = (await resp.json()) as { results: DrugSearchResult[] }
      setPickerResults(json.results ?? [])
      setPickerSearched(true)
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setPickerLoading(false)
    }
  }, [])

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), DEBOUNCE_MS)
  }

  // ── Selection actions ──────────────────────────────────────────────────────
  const addId = (id: number) => {
    if (selectedIds.includes(id)) return
    if (selectedIds.length >= MAX_COMPARE) return
    setSelectedIds((prev) => [...prev, id])
  }

  const removeId = (id: number) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id))
  }

  const isEmpty = rowCount === 0
  const atMax = selectedIds.length >= MAX_COMPARE

  return (
    <AppLayout>
      <Head title="Compare Drug Interactions" />

      <div className="p-4 max-w-7xl mx-auto">
        {/* Back nav */}
        <Link
          href="/drug-reference"
          className="inline-flex items-center gap-1 text-sm text-desert-green hover:underline mb-4"
        >
          <IconArrowLeft size={16} />
          Drug Reference
        </Link>

        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1">Compare Drug Interactions</h1>
          <p className="text-sm opacity-70">
            View each drug's FDA-labeled interaction warnings side by side. Select up to {MAX_COMPARE} drugs.
          </p>
        </div>

        {/* ── Prominent amber disclaimer — always visible ──────────────────── */}
        <div className="flex gap-3 items-start bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-6">
          <IconAlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900 leading-relaxed">
            <strong>This shows each drug's own FDA-labeled interaction warnings, individually.</strong>{' '}
            It is <strong>not</strong> a cross-drug interaction checker and is{' '}
            <strong>not</strong> a substitute for professional medical review. Absence of text
            here does not mean a drug is safe to combine.
          </p>
        </div>

        {isEmpty ? (
          // ── Empty state (no data ingested) ─────────────────────────────────
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <p className="text-lg font-semibold mb-2">No FDA drug data yet</p>
            <p className="mb-6 opacity-70">
              Download the openFDA drug-label dataset to enable offline search and comparison.
            </p>
            <Link href="/drug-reference">
              <StyledButton variant="primary" onClick={() => {}}>
                Go to Drug Reference to download data
              </StyledButton>
            </Link>
            {ingestStatus && (
              <div className="mt-6 text-left">
                <IngestStatus status={ingestStatus} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Drug picker ───────────────────────────────────────────────── */}
            <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Select drugs to compare</h2>
                {atMax && (
                  <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-0.5">
                    Maximum {MAX_COMPARE} drugs reached
                  </span>
                )}
              </div>

              {/* Selected chips */}
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {entries.map((entry) => (
                    <span
                      key={entry.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-desert-green text-white"
                    >
                      {entry.brand_name ?? entry.generic_name ?? `ID ${entry.id}`}
                      <button
                        type="button"
                        onClick={() => removeId(entry.id)}
                        aria-label={`Remove ${entry.brand_name ?? entry.generic_name}`}
                        className="hover:opacity-70 transition-opacity leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {/* Show placeholder chips for ids still loading */}
                  {selectedIds
                    .filter((id) => !entries.find((e) => e.id === id))
                    .map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-300 text-gray-600 animate-pulse"
                      >
                        #{id}
                        <button
                          type="button"
                          onClick={() => removeId(id)}
                          aria-label={`Remove drug ${id}`}
                          className="hover:opacity-70 transition-opacity leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              )}

              {/* Search input */}
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                placeholder="Search for a drug to add…"
                disabled={atMax}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-desert-green disabled:bg-gray-100 disabled:text-gray-400"
              />

              {/* Picker results */}
              {pickerLoading && (
                <div className="mt-2 text-xs text-gray-500">Searching…</div>
              )}
              {pickerError && (
                <div className="mt-2 text-xs text-red-600">{pickerError}</div>
              )}
              {pickerSearched && pickerResults.length === 0 && !pickerLoading && (
                <div className="mt-2 text-xs text-gray-500">No results for "{query}"</div>
              )}
              {pickerResults.length > 0 && !atMax && (
                <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200 max-h-64 overflow-y-auto bg-white">
                  {pickerResults.map((r) => (
                    <PickerRow
                      key={r.id}
                      result={r}
                      selected={selectedIds.includes(r.id)}
                      onAdd={() => addId(r.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Comparison columns ────────────────────────────────────────── */}
            {selectedIds.length === 0 ? (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                <p className="text-sm">Select drugs above to compare their labeled interaction warnings.</p>
              </div>
            ) : loadingEntries ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">Loading…</p>
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, entries.length)}, minmax(0, 1fr))`,
                }}
              >
                {entries.map((entry) => (
                  <InteractionColumn key={entry.id} entry={entry} onRemove={removeId} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Source citation (CC0, no-endorsement) ───────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
          <strong>Source:</strong> U.S. Food &amp; Drug Administration drug labeling, via{' '}
          <strong>openFDA</strong> — public domain (CC0 1.0). NOMAD is not affiliated with or
          endorsed by the FDA. Label data is provided as-is; do not rely on it for medical
          decisions.
        </footer>
      </div>
    </AppLayout>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Picker row ───────────────────────────────────────────────────────────────

interface PickerRowProps {
  result: DrugSearchResult
  selected: boolean
  onAdd: () => void
}

function PickerRow({ result, selected, onAdd }: PickerRowProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
      {/* Reuse the same visual pattern as DrugResultRow but without a Link */}
      <div className="min-w-0 flex-1 mr-3">
        <span className="text-sm font-medium text-gray-900 block truncate">
          {result.brand_name ?? result.generic_name ?? 'Unknown'}
        </span>
        {result.brand_name && result.generic_name && (
          <span className="text-xs text-gray-500 italic">{result.generic_name}</span>
        )}
      </div>
      {selected ? (
        <span className="text-xs text-desert-green font-semibold flex-shrink-0">Added</span>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="text-xs px-2.5 py-1 rounded border border-desert-green text-desert-green hover:bg-desert-green hover:text-white transition-colors flex-shrink-0"
        >
          Add
        </button>
      )}
    </div>
  )
}
