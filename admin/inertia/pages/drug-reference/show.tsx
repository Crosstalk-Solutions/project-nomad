import { Head, Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import AppLayout from '~/layouts/AppLayout'
import { IconArrowLeft, IconAlertTriangle, IconFirstAidKit } from '@tabler/icons-react'
import type { DrugLabelDetail } from '../../../types/drug_reference'
import type { ConditionSummary } from '../../../types/conditions'
import { PRODUCT_TYPES } from '../../../types/drug_reference'
import LabelBlocks from '../../components/drug-reference/LabelBlocks'

interface PageProps {
  label: DrugLabelDetail
  /** Curated situations this label treats (matched from its indications text). */
  situations?: ConditionSummary[]
}

/**
 * Drug Reference detail page.
 *
 * Renders sections in fixed clinical order, each shown only if present.
 * Boxed Warning appears first as a prominent red callout.
 * Drug Interactions carries a note that this is single-drug label text.
 */
export default function DrugReferenceShow({ label, situations = [] }: PageProps) {
  const { t } = useTranslation()
  const isRx = label.product_type === PRODUCT_TYPES.RX
  const isOtc = label.product_type === PRODUCT_TYPES.OTC

  return (
    <AppLayout compact>
      <Head title={label.brand_name ?? label.generic_name ?? t('drug_reference.show.unknown_drug')} />

      <div className="p-4 max-w-3xl mx-auto">
        {/* Back nav + comparison entry */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Link
            href="/drug-reference"
            className="inline-flex items-center gap-1 text-sm text-desert-green hover:underline"
          >
            <IconArrowLeft size={16} />
            {t('drug_reference.show.back_link')}
          </Link>
          <Link
            href={`/drug-reference/interactions?ids=${label.id}`}
            className="text-xs px-2.5 py-1 rounded border border-desert-green text-desert-green hover:bg-desert-green hover:text-white transition-colors"
          >
            {t('drug_reference.show.add_to_comparison')}
          </Link>
        </div>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h1 className="text-2xl font-bold">
              {label.brand_name ?? label.generic_name ?? t('drug_reference.show.unknown_drug')}
            </h1>
            {/* OTC / Rx badge */}
            {isRx && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-desert-orange/10 text-desert-orange-dark border border-desert-orange/30">
                {t('drug_reference.show.badge_rx')}
              </span>
            )}
            {isOtc && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-desert-olive/10 text-desert-olive-dark border border-desert-olive/30">
                {t('drug_reference.show.badge_otc')}
              </span>
            )}
          </div>

          {label.brand_name && label.generic_name && (
            <p className="text-base text-text-secondary italic">{label.generic_name}</p>
          )}

          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {label.manufacturer && (
              <div>
                <dt className="inline font-semibold">{t('drug_reference.show.manufacturer')} </dt>
                <dd className="inline">{label.manufacturer}</dd>
              </div>
            )}
            {label.route && (
              <div>
                <dt className="inline font-semibold">{t('drug_reference.show.route')} </dt>
                <dd className="inline">{label.route}</dd>
              </div>
            )}
            {label.product_ndc && (
              <div>
                <dt className="inline font-semibold">{t('drug_reference.show.ndc')} </dt>
                <dd className="inline font-mono text-xs">{label.product_ndc}</dd>
              </div>
            )}
            {label.source_updated_at && (
              <div>
                <dt className="inline font-semibold">{t('drug_reference.show.label_date')} </dt>
                <dd className="inline">{label.source_updated_at}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* ── Fixed clinical section order ─────────────────────────────────── */}

        {/* 1. Boxed Warning — red callout, most serious */}
        {label.boxed_warning && (
          <section className="mb-6 border-2 border-red-600 rounded-lg p-4 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <IconAlertTriangle size={20} className="text-red-600 flex-shrink-0" />
              <h2 className="text-base font-bold text-red-700 uppercase tracking-wide">
                {t('drug_reference.show.boxed_warning')}
              </h2>
            </div>
            <LabelBlocks text={label.boxed_warning} tone="danger" />
          </section>
        )}

        {/* 2. Indications & Usage */}
        {label.indications && (
          <LabelSection title={t('drug_reference.show.section_indications')} body={label.indications} />
        )}

        {/* Reverse link — curated situations this label treats. The other half of
            the symbiotic surface: each chip jumps back to Drug Reference with the
            situation pre-searched. */}
        {situations.length > 0 && (
          <section className="mb-6 rounded-2xl border border-desert-stone-lighter/60 bg-desert-sand/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <IconFirstAidKit size={18} className="flex-shrink-0 text-desert-olive-dark" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-desert-green-darker">
                {t('drug_reference.show.commonly_used_for')}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {situations.map((s) => (
                <Link
                  key={s.slug}
                  href={`/drug-reference?situation=${encodeURIComponent(s.slug)}`}
                  className="rounded-full border border-desert-olive/40 bg-surface-primary px-3 py-1 text-sm text-desert-olive-dark transition-colors hover:border-desert-olive hover:bg-desert-olive hover:text-white"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 3. Dosage & Administration */}
        {label.dosage && (
          <LabelSection title={t('drug_reference.show.section_dosage')} body={label.dosage} />
        )}

        {/* 4. Warnings */}
        {label.warnings && (
          <LabelSection title={t('drug_reference.show.section_warnings')} body={label.warnings} />
        )}

        {/* 5. Drug Interactions — single-drug label text, not a pairwise checker */}
        {label.drug_interactions && (
          <LabelSection
            title={t('drug_reference.show.section_drug_interactions')}
            body={label.drug_interactions}
            footnote={t('drug_reference.show.drug_interactions_footnote')}
          />
        )}

        {/* 6. Contraindications */}
        {label.contraindications && (
          <LabelSection title={t('drug_reference.show.section_contraindications')} body={label.contraindications} />
        )}

        {/* 7. When Using (OTC) */}
        {label.when_using && (
          <LabelSection title={t('drug_reference.show.section_when_using')} body={label.when_using} />
        )}

        {/* 8. Stop Use (OTC) */}
        {label.stop_use && (
          <LabelSection title={t('drug_reference.show.section_stop_use')} body={label.stop_use} />
        )}

        {/* ── Footer citation ───────────────────────────────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-border-subtle text-xs text-text-secondary space-y-1">
          <p>
            <strong>{t('drug_reference.show.footer_source_label')}</strong>{' '}
            {t('drug_reference.show.footer_source_text_before')}{' '}
            <strong>openFDA</strong>{' '}
            {t('drug_reference.show.footer_source_text_after')}
          </p>
          <p>
            {t('drug_reference.show.footer_disclaimer')}
          </p>
          {label.set_id && (
            <p className="font-mono opacity-60">set_id: {label.set_id}</p>
          )}
          <p className="opacity-60">{t('drug_reference.show.footer_last_refreshed', { date: label.ingested_at.slice(0, 10) })}</p>
        </footer>
      </div>
    </AppLayout>
  )
}

// ─── Section component ────────────────────────────────────────────────────────

function LabelSection({
  title,
  body,
  footnote,
}: {
  title: string
  body: string
  footnote?: string
}) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold mb-2 border-b border-border-subtle pb-1">{title}</h2>
      <LabelBlocks text={body} />
      {footnote && (
        <p className="mt-2 text-xs text-text-secondary italic">{footnote}</p>
      )}
    </section>
  )
}
