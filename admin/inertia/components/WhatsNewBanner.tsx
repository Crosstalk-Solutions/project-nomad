import { useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import Alert from '~/components/Alert'

/**
 * Post-upgrade "what's new" highlights shown once on the dashboard.
 *
 * `version` is the release line (major.minor) these highlights describe. The
 * banner only renders when the running build's major.minor matches, so it
 * appears after a user upgrades into the line and every patch within it, then
 * disappears on the next minor. Dismissal is remembered per-line in
 * localStorage, so dismissing v1.34 won't suppress a future v1.35 note.
 *
 * To surface a new release's highlights: bump `version` and replace
 * `highlights`. No schema or migration needed.
 */
const WHATS_NEW = {
  version: '1.34',
}

/** Extract the major.minor line (e.g. "1.34.2" -> "1.34"). Returns null for
 *  non-numeric versions like the dev server's "dev". */
function majorMinor(version: string | undefined | null): string | null {
  const match = (version ?? '').match(/^(\d+)\.(\d+)/)
  return match ? `${match[1]}.${match[2]}` : null
}

export default function WhatsNewBanner() {
  const { t } = useTranslation()
  const { appVersion } = usePage<{ appVersion: string }>().props
  const storageKey = `nomad:whatsnew-dismissed:${WHATS_NEW.version}`

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  })

  // Only surface highlights for the release they describe, and only until the
  // user dismisses that line.
  if (dismissed || majorMinor(appVersion) !== WHATS_NEW.version) {
    return null
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, 'true')
    } catch {
      // localStorage unavailable (private mode, etc.) — banner just re-shows
      // next load, which is acceptable.
    }
  }

  const highlights = [
    t('common.whats_new.highlight_creator_packs'),
    t('common.whats_new.highlight_medication_reference'),
    t('common.whats_new.highlight_benchmark_score'),
    t('common.whats_new.highlight_nomad_md'),
    t('common.whats_new.highlight_knowledge_base'),
  ]

  return (
    <div className="flex justify-center items-center p-4 w-full">
      <Alert
        title={t('common.whats_new.title')}
        type="info-inverted"
        variant="solid"
        className="w-full"
        dismissible
        onDismiss={handleDismiss}
        buttonProps={{
          variant: 'primary',
          children: t('common.whats_new.see_release_notes'),
          icon: 'IconBook',
          onClick: () => router.visit('/docs/release-notes'),
        }}
      >
        <ul className="mt-1 list-disc list-inside space-y-1 text-white text-opacity-90 text-sm leading-relaxed">
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </Alert>
    </div>
  )
}
