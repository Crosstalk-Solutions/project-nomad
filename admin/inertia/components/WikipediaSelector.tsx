import { formatBytes } from '~/lib/util'
import { WikipediaOption, WikipediaCurrentSelection } from '../../types/downloads'
import classNames from 'classnames'
import { IconCheck, IconDownload, IconWorld } from '@tabler/icons-react'
import StyledButton from './StyledButton'
import LoadingSpinner from './LoadingSpinner'

export interface WikipediaSelectorProps {
  options: WikipediaOption[]
  currentSelection: WikipediaCurrentSelection | null
  selectedOptionId: string | null // for wizard (pending selection)
  onSelect: (optionId: string) => void
  disabled?: boolean
  showSubmitButton?: boolean // true for Content Explorer, false for wizard
  onSubmit?: () => void
  isSubmitting?: boolean
}

const WikipediaSelector: React.FC<WikipediaSelectorProps> = ({
  options,
  currentSelection,
  selectedOptionId,
  onSelect,
  disabled = false,
  showSubmitButton = false,
  onSubmit,
  isSubmitting = false,
}) => {
  // Determine which option to highlight
  const highlightedOptionId = selectedOptionId ?? currentSelection?.optionId ?? null

  // Check if current selection is downloading
  const isDownloading = currentSelection?.status === 'downloading'

  return (
    <div className="w-full">
      {/* Header with Wikipedia branding */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
          <IconWorld className="w-6 h-6 text-gray-700" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Wikipedia</h3>
          <p className="text-sm text-gray-500">Select your preferred Wikipedia package</p>
        </div>
      </div>

      {/* Downloading status message */}
      {isDownloading && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
          <LoadingSpinner className='size-5' />
          <span className="text-sm text-blue-700">
            Downloading Wikipedia... This may take a while for larger packages.
          </span>
        </div>
      )}

      {/* Options grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((option) => {
          const isSelected = highlightedOptionId === option.id
          const isInstalled =
            currentSelection?.optionId === option.id && currentSelection?.status === 'installed'
          const isCurrentDownloading =
            currentSelection?.optionId === option.id && currentSelection?.status === 'downloading'
          const isPending = selectedOptionId === option.id && selectedOptionId !== currentSelection?.optionId

          return (
            <div
              key={option.id}
              onClick={() => !disabled && !isCurrentDownloading && onSelect(option.id)}
              className={classNames(
                'relative p-4 rounded-lg border-2 transition-all',
                disabled || isCurrentDownloading
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer hover:shadow-md',
                isInstalled
                  ? 'border-desert-green bg-desert-green/10'
                  : isSelected
                    ? 'border-lime-500 bg-lime-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              {/* Status badges */}
              <div className="absolute top-2 right-2 flex gap-1">
                {isInstalled && (
                  <span className="text-xs bg-desert-green text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                    <IconCheck size={12} />
                    Installed
                  </span>
                )}
                {isPending && !isInstalled && (
                  <span className="text-xs bg-lime-500 text-white px-2 py-0.5 rounded-full">
                    Selected
                  </span>
                )}
                {isCurrentDownloading && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                    <IconDownload size={12} />
                    Downloading
                  </span>
                )}
              </div>

              {/* Option content */}
              <div className="pr-16 flex flex-col h-full">
                <h4 className="text-lg font-semibold text-gray-900 mb-1">{option.name}</h4>
                <p className="text-sm text-gray-600 mb-3 flex-grow">{option.description}</p>
                <div className="flex items-center gap-3">
                  {/* Radio indicator */}
                  <div
                    className={classNames(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                      isSelected
                        ? isInstalled
                          ? 'border-desert-green bg-desert-green'
                          : 'border-lime-500 bg-lime-500'
                        : 'border-gray-300'
                    )}
                  >
                    {isSelected && <IconCheck size={12} className="text-white" />}
                  </div>
                  <span
                    className={classNames(
                      'text-sm font-medium px-2 py-1 rounded',
                      option.size_mb === 0 ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {option.size_mb === 0 ? 'No download' : formatBytes(option.size_mb * 1024 * 1024, 1)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit button for Content Explorer mode */}
      {showSubmitButton && selectedOptionId && selectedOptionId !== currentSelection?.optionId && (
        <div className="mt-4 flex justify-end">
          <StyledButton
            variant="primary"
            onClick={onSubmit}
            disabled={isSubmitting || disabled}
            loading={isSubmitting}
            icon="IconDownload"
          >
            {selectedOptionId === 'none' ? 'Remove Wikipedia' : 'Download Selected'}
          </StyledButton>
        </div>
      )}
    </div>
  )
}

export default WikipediaSelector
