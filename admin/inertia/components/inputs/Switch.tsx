import clsx from 'clsx'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  id?: string
  /** Renders a third, visually distinct "mixed" state (e.g. a collection
   * toggle whose member files aren't uniformly active/inactive) instead of
   * the normal on/off look. Clicking a mixed switch always resolves to the
   * less-destructive direction -- turning everything on -- regardless of
   * `checked`. */
  indeterminate?: boolean
}

export default function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  indeterminate = false,
}: SwitchProps) {
  const switchId = id || `switch-${label?.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <div className="flex items-center justify-between py-2">
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <label
              htmlFor={switchId}
              className="text-base font-medium text-text-primary cursor-pointer"
            >
              {label}
            </label>
          )}
          {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
        </div>
      )}
      <div className="flex items-center ml-4">
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={indeterminate ? 'mixed' : checked}
          disabled={disabled}
          onClick={() => !disabled && onChange(indeterminate ? true : !checked)}
          className={clsx(
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-desert-green focus:ring-offset-2',
            indeterminate ? 'bg-amber-400' : checked ? 'bg-desert-green' : 'bg-border-default',
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          )}
        >
          <span
            className={clsx(
              'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0',
              'transition duration-200 ease-in-out',
              indeterminate ? 'translate-x-2.5' : checked ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        </button>
      </div>
    </div>
  )
}
