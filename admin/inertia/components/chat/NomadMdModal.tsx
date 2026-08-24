import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import StyledButton from '~/components/StyledButton'
import MarkdownEditor from '~/components/MarkdownEditor'
import { useNotifications } from '~/context/NotificationContext'
import api from '~/lib/api'

interface NomadMdModalProps {
  aiAssistantName?: string
  onClose: () => void
}

// Seeded into the editor when no NOMAD.md exists yet. Nothing is written to disk
// until the user saves, so this is purely a starting point they can replace.
const NOMAD_MD_TEMPLATE = `# NOMAD.md

<!--
This file holds custom instructions for your AI assistant. Everything here is
sent to the assistant as a system prompt on every chat — use it to set persona,
tone, priorities, and standing rules.

It is also stored on disk at storage/NOMAD.md, so you can edit it directly.
Replace this template with your own instructions, then click Save.
-->

## About me

- (e.g. I'm setting up an off-grid homestead in a cold climate.)

## How the assistant should respond

- Be concise and practical.
- Prioritize safety and proven methods.
`

export default function NomadMdModal({ aiAssistantName, onClose }: NomadMdModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { addNotification } = useNotifications()
  const [content, setContent] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['nomad-md'],
    queryFn: () => api.getNomadMd(),
  })

  // Seed the editor once the file loads: existing content, or the template when empty.
  useEffect(() => {
    if (data && content === null) {
      setContent(data.content.trim().length > 0 ? data.content : NOMAD_MD_TEMPLATE)
    }
  }, [data, content])

  const saveMutation = useMutation({
    mutationFn: (value: string) => api.saveNomadMd(value),
    onSuccess: (result) => {
      if (!result?.success) {
        addNotification({ type: 'error', message: t('chat.nomad_md_modal.save_error') })
        return
      }
      addNotification({ type: 'success', message: t('chat.nomad_md_modal.save_success') })
      queryClient.invalidateQueries({ queryKey: ['nomad-md'] })
      onClose()
    },
    onError: (error: any) => {
      addNotification({ type: 'error', message: error?.message || t('chat.nomad_md_modal.save_error') })
    },
  })

  const assistantName = aiAssistantName?.trim() || t('chat.nomad_md_modal.default_assistant_name')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm transition-opacity">
      <div className="bg-surface-primary rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle shrink-0">
          <div>
            <h2 className="text-2xl font-semibold text-text-primary">NOMAD.md</h2>
            <p className="text-sm text-text-muted mt-1">
              {t('chat.nomad_md_modal.description', { assistantName })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <IconX className="h-6 w-6 text-text-muted" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {isLoading || content === null ? (
            <div className="py-16 text-center text-text-muted">{t('chat.nomad_md_modal.loading')}</div>
          ) : (
            <div className="rounded-lg border border-border-subtle overflow-hidden h-[55vh]">
              <MarkdownEditor initialValue={content} onChange={setContent} className="h-full text-sm" />
            </div>
          )}
          <p className="text-xs text-text-muted mt-3">
            {t('chat.nomad_md_modal.tip_prefix')}{' '}
            <code className="font-mono">storage/NOMAD.md</code>{t('chat.nomad_md_modal.tip_suffix')}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border-subtle shrink-0">
          <StyledButton variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            {t('chat.nomad_md_modal.cancel')}
          </StyledButton>
          <StyledButton
            variant="primary"
            icon="IconCircleCheck"
            onClick={() => content !== null && saveMutation.mutate(content)}
            loading={saveMutation.isPending}
            disabled={content === null}
          >
            {t('chat.nomad_md_modal.save')}
          </StyledButton>
        </div>
      </div>
    </div>
  )
}
