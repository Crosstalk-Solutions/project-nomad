import { useState } from 'react'
import { formatBytes } from '~/lib/util'
import { WikipediaOption, WikipediaCurrentSelection, WikipediaLanguage } from '../../types/downloads'
import classNames from 'classnames'
import { IconCheck, IconDownload, IconWorld, IconAlertTriangle, IconLanguage } from '@tabler/icons-react'
import StyledButton from './StyledButton'
import LoadingSpinner from './LoadingSpinner'

export interface WikipediaSelectorProps {
  options: WikipediaOption[]
  languages: WikipediaLanguage[]
  currentSelection: WikipediaCurrentSelection | null
  selectedOptionId: string | null
  selectedLanguage: string             // iso1 code, e.g. "en"
  onSelect: (optionId: string) => void
  onLanguageChange: (iso1: string) => void
  disabled?: boolean
  showSubmitButton?: boolean
  onSubmit?: () => void
  isSubmitting?: boolean
}

const WikipediaSelector: React.FC<WikipediaSelectorProps> = ({
  options,
  languages,
  currentSelection,
  selectedOptionId,
  selectedLanguage,
  onSelect,
  onLanguageChange,
  disabled = false,
  showSubmitButton = false,
  onSubmit,
  isSubmitting = false,
}) => {
  const highlightedOptionId = selectedOptionId ?? currentSelection?.optionId ?? null
  const isDownloading = currentSelection?.status === 'downloading'
  const isFailed = currentSelection?.status === 'failed'

  // Resolve size for current language
  const getSizeForLang = (option: WikipediaOption): number => {
    if (option.size_mb_by_lang && selectedLanguage in option.size_mb_by_lang) {
      return option.size_mb_by_lang[selectedLanguage]
    }
    return option.size_mb
  }

  // Find current language label
  const currentLang = languages.find((l) => l.iso1 === selectedLanguage)

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
            <IconWorld className="w-6 h-6 text-text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-text-primary">Wikipedia</h3>
            <p className="text-sm text-text-muted">Select your preferred Wikipedia package</p>
          </div>
        </div>

        {/* Language selector */}
        <div className="flex items-center gap-2">
          <IconLanguage className="w-4 h-4 text-text-muted" />
          <select
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={disabled || isDownloading}
            className={classNames(
              'text-sm rounded-md border border-border-subtle bg-surface-primary text-text-primary',
              'px-3 py-1.5 pr-8 focus:outline-none focus:ring-2 focus:ring-lime-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {languages.map((lang) => (
              <option key={lang.iso1} value={lang.iso1}>
                {lang.name_local} ({lang.iso1.toUpperCase()})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Language info banner */}
      {currentLang && selectedLanguage !== 'en' && (
        <div className="mb-4 p-2.5 bg-surface-secondary border border-border-subtle rounded-lg">
          <p className="text-xs text-text-muted">
            Showing Wikipedia in{' '}
            <span className="font-medium text-text-primary">{currentLang.name_local}</span>
            {' '}· Sizes may vary from English edition
          </p>
        </div>
      )}

      {/* Downloading status */}
      {isDownloading && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
          <LoadingSpinner fullscreen={false} iconOnly className="size-4" />
          <span className="text-sm text-blue-700">
            Downloading Wikipedia... This may take a while for larger packages.
          </span>
        </div>
      )}

      {/* Failed status */}
      {isFailed && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconAlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700">
              Wikipedia download failed. Select a package and try again.
            </span>
          </div>
        </div>
      )}

      {/* Options grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((option) => {
          const isSelected = highlightedOptionId === option.id
          const isInstalled =
            currentSelection?.optionId === option.id &&
            currentSelection?.status === 'installed' &&
            currentSelection?.language === selectedLanguage
          const isCurrentDownloading =
            currentSelection?.optionId === option.id && currentSelection?.status === 'downloading'
          const isCurrentFailed =
            currentSelection?.optionId === option.id && currentSelection?.status === 'failed'
          const isPending =
            selectedOptionId === option.id && selectedOptionId !== currentSelection?.optionId

          const sizeBytes = getSizeForLang(option) * 1024 * 1024

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
                    : 'border-border-subtle bg-surface-primary hover:border-border-default'
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
                {isCurrentFailed && (
                  <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                    <IconAlertTriangle size={12} />
                    Failed
                  </span>
                )}
              </div>

              {/* Option content */}
              <div className="pr-16 flex flex-col h-full">
                <h4 className="text-lg font-semibold text-text-primary mb-1">{option.name}</h4>
                <p className="text-sm text-text-secondary mb-3 flex-grow">{option.description}</p>
                <div className="flex items-center gap-3">
                  <div
                    className={classNames(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0',
                      isSelected
                        ? isInstalled
                          ? 'border-desert-green bg-desert-green'
                          : 'border-lime-500 bg-lime-500'
                        : 'border-border-default'
                    )}
                  >
                    {isSelected && <IconCheck size={12} className="text-white" />}
                  </div>
                  <span
                    className={classNames(
                      'text-sm font-medium px-2 py-1 rounded',
                      getSizeForLang(option) === 0
                        ? 'bg-surface-secondary text-text-muted'
                        : 'bg-surface-secondary text-text-secondary'
                    )}
                  >
                    {getSizeForLang(option) === 0
                      ? 'No download'
                      : formatBytes(sizeBytes, 1)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Submit button */}
      {showSubmitButton &&
        selectedOptionId &&
        (selectedOptionId !== currentSelection?.optionId ||
          currentSelection?.language !== selectedLanguage ||
          isFailed) && (
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
