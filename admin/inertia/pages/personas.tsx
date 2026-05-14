import { useMemo, useState } from 'react'
import { Head, Link } from '@inertiajs/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconArrowLeft } from '@tabler/icons-react'

import api from '~/lib/api'
import StyledButton from '~/components/StyledButton'
import LoadingSpinner from '~/components/LoadingSpinner'
import classNames from '~/lib/classNames'
import { useNotifications } from '~/context/NotificationContext'
import { PersonaKey } from '../../types/chat'

interface Detail {
  key: PersonaKey
  label: string
  description: string
  systemPrompt: string
  defaults: { label: string; description: string; systemPrompt: string }
  hasOverride: boolean
}

function PersonaEditor({
  detail,
  onSaved,
  onReset,
}: {
  detail: Detail
  onSaved: () => void
  onReset: () => void
}) {
  const queryClient = useQueryClient()
  const { addNotification } = useNotifications()
  const [draft, setDraft] = useState({
    label: detail.label,
    description: detail.description,
    systemPrompt: detail.systemPrompt,
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      const payload: { label?: string | null; description?: string | null; systemPrompt?: string | null } = {
        // Send null when the user has reverted a field to its default — this
        // clears the override on that field so future default changes flow through.
        label: draft.label === detail.defaults.label ? null : draft.label,
        description: draft.description === detail.defaults.description ? null : draft.description,
        systemPrompt: draft.systemPrompt === detail.defaults.systemPrompt ? null : draft.systemPrompt,
      }
      return api.updatePersonaOverride(detail.key, payload)
    },
    onSuccess: () => {
      addNotification({ message: `${detail.label} persona saved`, type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      onSaved()
    },
    onError: () => addNotification({ message: 'Failed to save persona', type: 'error' }),
  })

  const resetMutation = useMutation({
    mutationFn: () => api.resetPersonaOverride(detail.key),
    onSuccess: () => {
      addNotification({ message: `${detail.label} persona reset to default`, type: 'success' })
      queryClient.invalidateQueries({ queryKey: ['personas'] })
      onReset()
    },
    onError: () => addNotification({ message: 'Failed to reset persona', type: 'error' }),
  })

  const dirty = useMemo(
    () =>
      draft.label !== detail.label ||
      draft.description !== detail.description ||
      draft.systemPrompt !== detail.systemPrompt,
    [draft, detail]
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        updateMutation.mutate()
      }}
      className="max-w-3xl space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{detail.label}</h2>
          <p className="text-sm text-text-muted mt-1">
            Persona key: <code>{detail.key}</code>
          </p>
        </div>
        {detail.hasOverride && (
          <span className="text-xs uppercase tracking-wide px-2 py-1 bg-amber-100 text-amber-800 rounded">
            Override active
          </span>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Label</label>
        <input
          type="text"
          value={draft.label}
          maxLength={60}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="w-full px-3 py-2 border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-surface-primary"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Description</label>
        <textarea
          value={draft.description}
          maxLength={500}
          rows={2}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full px-3 py-2 border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-surface-primary resize-y"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">System prompt</label>
        <textarea
          value={draft.systemPrompt}
          maxLength={20000}
          rows={18}
          onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
          className="w-full px-3 py-2 border border-border-default rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-desert-green focus:border-transparent bg-surface-primary resize-y"
        />
        <p className="text-xs text-text-muted mt-1">
          Injected as the system message at the start of every chat using this persona. Empty
          fields fall back to the built-in default.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <StyledButton
          type="submit"
          variant="primary"
          disabled={!dirty || updateMutation.isPending}
          loading={updateMutation.isPending}
        >
          Save
        </StyledButton>
        <StyledButton
          type="button"
          variant="outline"
          icon="IconRestore"
          disabled={!detail.hasOverride || resetMutation.isPending}
          loading={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
        >
          Reset to default
        </StyledButton>
        {dirty && <span className="text-sm text-text-muted">Unsaved changes</span>}
      </div>
    </form>
  )
}

export default function PersonasPage(props: {
  settings?: { chatPersonasEnabled?: boolean }
}) {
  const personasEnabled = props.settings?.chatPersonasEnabled ?? true
  const [selectedKey, setSelectedKey] = useState<PersonaKey | null>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['personas', 'list'],
    queryFn: () => api.listPersonasWithOverrides(),
  })
  const personas = listData?.personas ?? []
  const activeKey = selectedKey ?? personas[0]?.key ?? null

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['personas', 'detail', activeKey],
    queryFn: () => (activeKey ? api.getPersonaDetail(activeKey) : null),
    enabled: !!activeKey,
  })

  return (
    <div className="w-full h-screen flex flex-col bg-surface-primary">
      <Head title="Personas" />

      <div className="px-6 py-3 border-b border-border-subtle bg-surface-secondary flex items-center h-[75px] flex-shrink-0">
        <Link href="/chat" className="flex items-center text-text-secondary hover:text-text-primary">
          <IconArrowLeft className="mr-2" size={20} />
          <span>Back to Chat</span>
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-text-primary">Personas</h1>
      </div>

      {!personasEnabled && (
        <div className="px-6 py-3 border-b border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
          Chat personas are currently <strong>disabled in Settings</strong>. Edits below are saved, but the chat will not use them until you re-enable personas under <Link href="/settings/models" className="underline">Settings → AI Assistant</Link>.
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="w-72 border-r border-border-subtle bg-surface-secondary overflow-y-auto">
          {listLoading && <LoadingSpinner className="m-4" />}
          {!listLoading && (
            <ul className="py-2">
              {personas.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(p.key)}
                    className={classNames(
                      'w-full text-left px-4 py-3 flex flex-col gap-1 border-l-4 transition-colors',
                      activeKey === p.key
                        ? 'border-desert-green bg-surface-primary'
                        : 'border-transparent hover:bg-surface-primary'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text-primary">{p.label}</span>
                      {p.hasOverride && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                          edited
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-text-muted line-clamp-2">{p.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          {detailLoading && <LoadingSpinner />}
          {!detailLoading && !detail && (
            <div className="text-text-muted">Select a persona to view or edit.</div>
          )}
          {detail && (
            // Keying on persona key remounts the form when the user picks a different persona,
            // which re-seeds the draft state without a useEffect → setState ping-pong.
            <PersonaEditor
              key={detail.key}
              detail={detail}
              onSaved={() => {
                /* refetch handled via query invalidation */
              }}
              onReset={() => {
                /* refetch handled via query invalidation */
              }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
