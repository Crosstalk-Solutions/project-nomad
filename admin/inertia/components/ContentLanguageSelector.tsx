import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import classNames from 'classnames'
import { IconCheck, IconLanguage } from '@tabler/icons-react'
import api from '~/lib/api'
import { useNotifications } from '~/context/NotificationContext'
import { CONTENT_LANGUAGES } from '../../constants/content_languages'
import { parseContentLanguages } from '../../app/utils/content_languages'

export const CONTENT_LANGUAGES_KEY = 'content-languages'

/** Queries whose results depend on the content languages, refreshed on change. */
const DEPENDENT_QUERY_KEYS = ['curated-categories', 'wikipedia-state', 'remote-zim-files']

export interface ContentLanguageSelectorProps {
  disabled?: boolean
  className?: string
}

/**
 * Picks which languages of curated content, Wikipedia packages and Kiwix
 * library results are offered. Saved immediately to `content.languages`.
 * This does not translate the interface.
 */
const ContentLanguageSelector: React.FC<ContentLanguageSelectorProps> = ({
  disabled = false,
  className,
}) => {
  const queryClient = useQueryClient()
  const { addNotification } = useNotifications()

  const { data: selected = ['en'] } = useQuery({
    queryKey: [CONTENT_LANGUAGES_KEY],
    queryFn: async () => {
      const res = await api.getSetting('content.languages')
      return parseContentLanguages(res?.value ?? null) as string[]
    },
    refetchOnWindowFocus: false,
  })

  const save = useMutation({
    mutationFn: async (codes: string[]) => {
      const res = await api.updateSetting('content.languages', codes.join(','))
      if (!res?.success) throw new Error(res?.message || 'Failed to save content languages')
      return codes
    },
    onSuccess: (codes) => {
      queryClient.setQueryData([CONTENT_LANGUAGES_KEY], codes)
      for (const key of DEPENDENT_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save content languages',
      })
    },
  })

  const toggle = (code: string) => {
    if (disabled || save.isPending) return
    const isOn = selected.includes(code)
    // Keep at least one language: an empty selection would offer no content at all.
    if (isOn && selected.length === 1) return
    const next = isOn ? selected.filter((c) => c !== code) : [...selected, code]
    save.mutate(next)
  }

  return (
    <div className={classNames('w-full', className)}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
          <IconLanguage className="w-6 h-6 text-text-primary" />
        </div>
        <h3 className="text-xl font-semibold text-text-primary">Content Languages</h3>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Content languages">
        {CONTENT_LANGUAGES.map((language) => {
          const isOn = selected.includes(language.code)
          const isLastSelected = isOn && selected.length === 1
          return (
            <button
              key={language.code}
              type="button"
              aria-pressed={isOn}
              disabled={disabled || save.isPending || isLastSelected}
              onClick={() => toggle(language.code)}
              className={classNames(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-colors',
                isOn
                  ? 'bg-desert-green border-desert-green text-white'
                  : 'bg-surface-primary border-border-subtle text-text-secondary hover:border-border-default',
                (disabled || save.isPending) && 'opacity-60 cursor-not-allowed',
                isLastSelected && 'cursor-default'
              )}
            >
              {isOn && <IconCheck size={14} />}
              <span lang={language.code}>{language.name}</span>
              <span
                className={classNames(
                  'text-xs uppercase',
                  isOn ? 'text-white/70' : 'text-text-muted'
                )}
              >
                {language.code}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default ContentLanguageSelector
