import { useState } from 'react'
import { IconMovie } from '@tabler/icons-react'
import api from '~/lib/api'
import useCreatorPacks from '~/hooks/useCreatorPacks'
import useDownloads from '~/hooks/useDownloads'
import { useNotifications } from '~/context/NotificationContext'
import CreatorPackCard from '~/components/CreatorPackCard'
import StyledModal from '~/components/StyledModal'
import { formatBytes } from '~/lib/util'
import type { CreatorPackWithStatus } from '../../types/collections'

/**
 * Install-on-click grid of Creator Packs + a confirm modal. Shared by the
 * Content Explorer block and the /settings/creator-packs page. Renders NOTHING
 * when the build isn't configured (fork / key unset) — a fork never sees a
 * broken install button. The Easy Setup wizard does NOT use this (it needs
 * selection semantics, not install-on-click) and drives CreatorPackCard itself.
 */
const CreatorPacksSection: React.FC = () => {
  const { configured, packs, invalidate: invalidateCreatorPacks } = useCreatorPacks()
  const { invalidate: invalidateDownloads } = useDownloads({ filetype: 'zim' })
  const { addNotification } = useNotifications()

  const [packToInstall, setPackToInstall] = useState<CreatorPackWithStatus | null>(null)
  const [installing, setInstalling] = useState(false)

  if (!configured) return null

  const handleConfirm = async () => {
    if (!packToInstall) return
    setInstalling(true)
    try {
      await api.installCreatorPack(packToInstall.id)
      addNotification({ message: `Started installing "${packToInstall.name}"`, type: 'success' })
      invalidateCreatorPacks()
      invalidateDownloads()
      setPackToInstall(null)
    } catch (error) {
      console.error('Error installing creator pack:', error)
      addNotification({ message: 'An error occurred while starting the install.', type: 'error' })
    } finally {
      setInstalling(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 mt-8 mb-4">
        <div className="w-10 h-10 rounded-full bg-surface-primary border border-border-subtle flex items-center justify-center shadow-sm">
          <IconMovie className="w-6 h-6 text-text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-text-primary">Creator Packs</h3>
          <p className="text-sm text-text-muted">
            Branded video collections from creators, for offline viewing
          </p>
        </div>
      </div>

      {packs.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packs.map((pack) => (
            <CreatorPackCard key={pack.id} pack={pack} onClick={setPackToInstall} />
          ))}
        </div>
      ) : (
        <p className="text-text-muted mt-4">No creator packs available.</p>
      )}

      <StyledModal
        open={!!packToInstall}
        title={packToInstall ? `Install ${packToInstall.name}?` : 'Install Creator Pack'}
        onClose={() => !installing && setPackToInstall(null)}
        onCancel={() => setPackToInstall(null)}
        onConfirm={handleConfirm}
        confirmText={
          packToInstall?.available_update_version ? 'Update pack' : 'Install pack'
        }
        confirmIcon="IconDownload"
        confirmLoading={installing}
        icon={<IconMovie className="w-6 h-6" />}
      >
        {packToInstall && (
          <div className="space-y-3 text-text-secondary">
            <p>
              {packToInstall.video_count} videos from {packToInstall.creator}, about{' '}
              {formatBytes(packToInstall.size_mb * 1024 * 1024, 0)}. It will download in the
              background and appear in Kiwix when ready.
            </p>
            <p className="text-sm text-text-muted">
              Licensed content — personal use, not for redistribution.
            </p>
          </div>
        )}
      </StyledModal>
    </>
  )
}

export default CreatorPacksSection
