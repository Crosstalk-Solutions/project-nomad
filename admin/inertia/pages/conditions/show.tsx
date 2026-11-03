import { Head, Link } from '@inertiajs/react'
import { IconArrowLeft, IconLeaf } from '@tabler/icons-react'
import AppLayout from '~/layouts/AppLayout'
import SafetyBanner from '~/components/conditions/SafetyBanner'
import RemedySafetyNote from '~/components/conditions/RemedySafetyNote'
import DrugResultRow from '~/components/drug-reference/DrugResultRow'
import type { ConditionSummary, NaturalRemedy } from '../../../types/conditions'
import { remedySourceName } from '../../../util/conditions'
import type { DrugSearchResult } from '../../../types/drug_reference'
import { useTranslation, Trans } from 'react-i18next'

interface PageProps {
  condition: ConditionSummary | null
  drugs: DrugSearchResult[]
  remedies: NaturalRemedy[]
  drugRowCount: number
}

/**
 * "When to use what" — condition detail page.
 *
 * Header (condition label + category) + a prominent SafetyBanner + the OTC-first
 * list of drugs whose FDA label indications match this situation. Each row links
 * to its existing Drug Reference detail page. The empty state distinguishes
 * "no FDA data yet" (drugRowCount === 0 → point to Drug Reference) from
 * "data present, but nothing matched this situation".
 */
export default function ConditionsShow({ condition, drugs, remedies, drugRowCount }: PageProps) {
  const { t } = useTranslation('drug_reference')
  const label = condition?.label ?? t('condition_show.default_label')
  const noData = drugRowCount === 0

  return (
    <AppLayout compact>
      <Head title={label} />

      <div className="p-4 max-w-3xl mx-auto">
        {/* Back nav */}
        <div className="mb-4">
          <Link
            href="/drug-reference"
            className="inline-flex items-center gap-1 text-sm text-desert-green hover:underline"
          >
            <IconArrowLeft size={16} />
            {t('common_labels.drug_reference')}
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{label}</h1>
          {condition?.category && (
            <p className="text-sm text-gray-500 mt-0.5">{condition.category}</p>
          )}
        </div>

        {/* Safety banner — hard ship requirement, top of content. */}
        <SafetyBanner />

        {/* Drug list / empty states */}
        {noData ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <p className="text-lg font-semibold mb-2">{t('condition_show.no_data_title')}</p>
            <p className="mb-6 opacity-70">
              {t('condition_show.no_data_desc')}
            </p>
            <Link href="/drug-reference">
              <span className="inline-block rounded bg-desert-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-desert-green-dark">
                {t('condition_show.no_data_cta')}
              </span>
            </Link>
          </div>
        ) : drugs.length === 0 ? (
          <div className="text-center py-8 opacity-60">
            <Trans
              ns="drug_reference"
              i18nKey="condition_show.no_matches"
              values={{ label }}
              components={{
                1: <Link href="/drug-reference" className="text-desert-green hover:underline" />,
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-base font-semibold">{t('condition_show.otc_options')}</h2>
              <span className="text-xs text-gray-500">
                {t('condition_show.results_count', { count: drugs.length })}
              </span>
            </div>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
              {drugs.map((d) => (
                <DrugResultRow key={`${d.id}`} result={d} />
              ))}
            </div>
          </>
        )}

        {/* ── Natural remedies section (Phase 2) ───────────────────────────── */}
        {remedies.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-desert-tan/20 text-desert-tan-dark">
                <IconLeaf size={16} />
              </span>
              <h2 className="text-base font-semibold text-desert-tan-dark">{t('condition_show.natural_remedies')}</h2>
              <span className="text-xs text-desert-stone ml-auto">
                {t('condition_show.remedies_count', { count: remedies.length })}
              </span>
            </div>

            {/* Safety note — co-located with the affirmative remedy guidance,
                not just the page-top banner (upstream PR #1040 requirement). */}
            <div className="mb-3">
              <RemedySafetyNote />
            </div>

            <div className="space-y-3">
              {remedies.map((r) => (
                <NaturalRemedyCard key={r.slug} remedy={r} />
              ))}
            </div>

            {/* Plain-text credit — no link-out; the reference is fully bundled. */}
            <p className="mt-3 text-xs text-desert-stone">
              {t('condition_show.sources_credit')}
            </p>
          </div>
        )}

        {/* ── Source citation ───────────────────────────────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>
            <Trans
              ns="drug_reference"
              i18nKey="common_labels.source_notice"
              components={{ 0: <strong />, 2: <strong /> }}
            />
          </p>
        </footer>
      </div>
    </AppLayout>
  )
}

// ─── Natural remedy card ──────────────────────────────────────────────────────

function NaturalRemedyCard({ remedy }: { remedy: NaturalRemedy }) {
  const { t } = useTranslation('drug_reference')

  return (
    <div className="rounded-lg border border-desert-tan-lighter/60 bg-desert-white overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 bg-desert-tan/10 px-4 py-3 border-b border-desert-tan-lighter/40">
        <div>
          <p className="font-semibold text-sm text-desert-tan-dark">
            {remedy.name}
            <span className="ml-2 inline-block rounded-full bg-desert-tan/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-desert-tan-dark align-middle">
              {remedy.kind === 'self-care' ? t('condition_show.card.self_care') : t('condition_show.card.herb')}
            </span>
          </p>
          {remedy.commonNames.length > 0 && (
            <p className="text-xs text-desert-stone mt-0.5">{remedy.commonNames.join(', ')}</p>
          )}
        </div>
        {/* Plain-text attribution — deliberately NOT a link. The card is fully
            self-contained for offline use; nothing on it needs internet. */}
        <span className="flex-shrink-0 text-xs text-desert-stone mt-0.5">
          {t('condition_show.card.source_prefix', { source: remedySourceName(remedy) })}
        </span>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-2 text-sm">
        <p className="text-desert-green-darker">{remedy.uses}</p>
        {remedy.how && (
          <p className="text-xs text-desert-green-darker bg-desert-sand/40 rounded px-2 py-1.5 border border-desert-stone-lighter/40">
            <strong>{t('condition_show.card.how_label')}</strong> {remedy.how}
          </p>
        )}
        <p className="text-xs text-desert-stone-dark border-l-2 border-desert-tan-lighter pl-2">
          <strong className="text-desert-tan-dark">{t('condition_show.card.evidence_label')}</strong> {remedy.evidence}
        </p>
        <p className="text-xs text-desert-red-dark bg-desert-red/5 rounded px-2 py-1.5 border border-desert-red-lighter/30">
          <strong>{t('condition_show.card.cautions_label')}</strong> {remedy.cautions}
        </p>
      </div>
    </div>
  )
}
