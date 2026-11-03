import { Head, Link } from '@inertiajs/react'
import AppLayout from '~/layouts/AppLayout'
import { IconArrowLeft, IconAlertTriangle, IconFirstAidKit } from '@tabler/icons-react'
import type { DrugLabelDetail } from '../../../types/drug_reference'
import type { ConditionSummary } from '../../../types/conditions'
import { PRODUCT_TYPES } from '../../../types/drug_reference'
import LabelBlocks from '../../components/drug-reference/LabelBlocks'
import { useTranslation, Trans } from 'react-i18next'

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
  const { t } = useTranslation('drug_reference')
  const isRx = label.product_type === PRODUCT_TYPES.RX
  const isOtc = label.product_type === PRODUCT_TYPES.OTC

  const fallbackTitle = t('drug_show.default_title')
  const drugName = label.brand_name ?? label.generic_name ?? t('drug_show.unknown_drug')

  return (
    <AppLayout compact>
      <Head title={label.brand_name ?? label.generic_name ?? fallbackTitle} />

      <div className="p-4 max-w-3xl mx-auto">
        {/* Back nav + comparison entry */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Link
            href="/drug-reference"
            className="inline-flex items-center gap-1 text-sm text-desert-green hover:underline"
          >
            <IconArrowLeft size={16} />
            {t('common_labels.drug_reference')}
          </Link>
          <Link
            href={`/drug-reference/interactions?ids=${label.id}`}
            className="text-xs px-2.5 py-1 rounded border border-desert-green text-desert-green hover:bg-desert-green hover:text-white transition-colors"
          >
            {t('drug_show.add_to_compare')}
          </Link>
        </div>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex flex-wrap items-start gap-2 mb-1">
            <h1 className="text-2xl font-bold">{drugName}</h1>
            {/* OTC / Rx badge */}
            {isRx && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-desert-orange/10 text-desert-orange-dark border border-desert-orange/30">
                {t('result_row.rx_badge')}
              </span>
            )}
            {isOtc && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-desert-olive/10 text-desert-olive-dark border border-desert-olive/30">
                {t('result_row.otc_badge')}
              </span>
            )}
          </div>

          {label.brand_name && label.generic_name && (
            <p className="text-base text-text-secondary italic">{label.generic_name}</p>
          )}

          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {label.manufacturer && (
              <div>
                <dt className="inline font-semibold">{t('drug_show.manufacturer')} </dt>
                <dd className="inline">{label.manufacturer}</dd>
              </div>
            )}
            {label.route && (
              <div>
                <dt className="inline font-semibold">{t('drug_show.route')} </dt>
                <dd className="inline">{label.route}</dd>
              </div>
            )}
            {label.product_ndc && (
              <div>
                <dt className="inline font-semibold">{t('drug_show.ndc')} </dt>
                <dd className="inline font-mono text-xs">{label.product_ndc}</dd>
              </div>
            )}
            {label.source_updated_at && (
              <div>
                <dt className="inline font-semibold">{t('drug_show.label_date')} </dt>
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
                {t('drug_show.boxed_warning')}
              </h2>
            </div>
            <LabelBlocks text={label.boxed_warning} tone="danger" />
          </section>
        )}

        {/* 2. Indications & Usage */}
        {label.indications && (
          <LabelSection title={t('drug_show.indications_title')} body={label.indications} />
        )}

        {/* Reverse link — curated situations this label treats. The other half of
            the symbiotic surface: each chip jumps back to Drug Reference with the
            situation pre-searched. */}
        {situations.length > 0 && (
          <section className="mb-6 rounded-2xl border border-desert-stone-lighter/60 bg-desert-sand/40 p-4">
            <div className="mb-2 flex items-center gap-2">
              <IconFirstAidKit size={18} className="flex-shrink-0 text-desert-olive-dark" />
              <h2 className="text-sm font-bold uppercase tracking-wide text-desert-green-darker">
                {t('drug_show.commonly_used_for')}
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
          <LabelSection title={t('drug_show.dosage_title')} body={label.dosage} />
        )}

        {/* 4. Warnings */}
        {label.warnings && (
          <LabelSection title={t('drug_show.warnings_title')} body={label.warnings} />
        )}

        {/* 5. Drug Interactions — single-drug label text, not a pairwise checker */}
        {label.drug_interactions && (
          <LabelSection
            title={t('drug_show.interactions_title')}
            body={label.drug_interactions}
            footnote={t('drug_show.interactions_footnote')}
          />
        )}

        {/* 6. Contraindications */}
        {label.contraindications && (
          <LabelSection title={t('drug_show.contraindications_title')} body={label.contraindications} />
        )}

        {/* 7. When Using (OTC) */}
        {label.when_using && (
          <LabelSection title={t('drug_show.when_using_title')} body={label.when_using} />
        )}

        {/* 8. Stop Use (OTC) */}
        {label.stop_use && (
          <LabelSection title={t('drug_show.stop_use_title')} body={label.stop_use} />
        )}

        {/* ── Footer citation ───────────────────────────────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-border-subtle text-xs text-text-secondary space-y-1">
          <p>
            <Trans
              ns="drug_reference"
              i18nKey="common_labels.source_notice_short"
              components={{ 0: <strong />, 2: <strong /> }}
            />
          </p>
          <p>
            {t('drug_show.footer_advice')}
          </p>
          {label.set_id && (
            <p className="font-mono opacity-60">{t('drug_show.set_id_label', { id: label.set_id })}</p>
          )}
          <p className="opacity-60">{t('drug_show.last_refreshed', { date: label.ingested_at.slice(0, 10) })}</p>
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
