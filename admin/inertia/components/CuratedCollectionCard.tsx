import { formatBytes } from '~/lib/util'
import DynamicIcon, { DynamicIconName } from './DynamicIcon'
import type { CollectionWithStatus } from '../../types/collections'
import classNames from 'classnames'
import { IconCircleCheck } from '@tabler/icons-react'

export interface CuratedCollectionCardProps {
  collection: CollectionWithStatus
  onClick?: (collection: CollectionWithStatus) => void;
  size?: 'small' | 'large'
}

const CuratedCollectionCard: React.FC<CuratedCollectionCardProps> = ({ collection, onClick, size = 'small' }) => {
  const totalSizeBytes = collection.resources?.reduce(
    (acc, resource) => acc + resource.size_mb * 1024 * 1024,
    0
  )
  return (
    <div
      className={classNames(
        'flex flex-col bg-desert-green rounded-lg p-6 text-white border border-b-desert-green shadow-sm hover:shadow-lg transition-shadow cursor-pointer',
        { 'opacity-65 cursor-not-allowed !hover:shadow-sm': collection.all_installed },
        { 'h-56': size === 'small', 'h-80': size === 'large' }
      )}
      onClick={() => {
        if (collection.all_installed) {
          return
        }
        if (onClick) {
          onClick(collection)
        }
      }}
    >
      <div className="flex items-center mb-4">
        <div className="flex justify-between w-full items-center">
          <div className="flex">
            <DynamicIcon icon={collection.icon as DynamicIconName} className="w-6 h-6 mr-2" />
            <h3 className="text-lg font-semibold">{collection.name}</h3>
          </div>
          {collection.all_installed && (
            <div className="flex items-center">
              <IconCircleCheck
                className="w-5 h-5 text-lime-400 ml-2"
                title="All items downloaded"
              />
              <p className="text-lime-400 text-sm ml-1">All items downloaded</p>
            </div>
          )}
        </div>
      </div>
      <p className="text-gray-200 grow">{collection.description}</p>
      <p className="text-gray-200 text-xs mt-2">
        Items: {collection.resources?.length} | Size: {formatBytes(totalSizeBytes, 0)}
      </p>
    </div>
  )
}
export default CuratedCollectionCard
