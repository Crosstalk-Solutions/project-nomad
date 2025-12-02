import classNames from '~/lib/classNames'

interface InfoCardProps {
  title: string
  icon?: React.ReactNode
  data: Array<{
    label: string
    value: string | number | undefined
  }>
  variant?: 'default' | 'bordered' | 'elevated'
}

export default function InfoCard({ title, icon, data, variant = 'default' }: InfoCardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'bordered':
        return 'border-2 border-desert-green bg-desert-white'
      case 'elevated':
        return 'bg-desert-white shadow-lg border border-desert-stone-lighter'
      default:
        return 'bg-desert-white border border-desert-stone-light'
    }
  }

  return (
    <div
      className={classNames(
        'rounded-lg overflow-hidden transition-all duration-200 hover:shadow-xl',
        getVariantStyles()
      )}
    >
      <div className="relative bg-desert-green px-6 py-4 overflow-hidden">
        {/* Diagonal line pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 10px,
              rgba(255, 255, 255, 0.1) 10px,
              rgba(255, 255, 255, 0.1) 20px
            )`,
          }}
        />

        <div className="relative flex items-center gap-3">
          {icon && <div className="text-desert-white opacity-80">{icon}</div>}
          <h3 className="text-lg font-bold text-desert-white uppercase tracking-wide">{title}</h3>
        </div>
        <div className="absolute top-0 right-0 w-24 h-24 transform translate-x-8 -translate-y-8">
          <div className="w-full h-full bg-desert-green-dark opacity-30 transform rotate-45" />
        </div>
      </div>
      <div className="p-6">
        <dl className="grid grid-cols-1 gap-4">
          {data.map((item, index) => (
            <div
              key={index}
              className={classNames(
                'flex justify-between items-center py-2 border-b border-desert-stone-lighter last:border-b-0'
              )}
            >
              <dt className="text-sm font-medium text-desert-stone-dark flex items-center gap-2">
                {item.label}
              </dt>
              <dd className={classNames('text-sm font-semibold text-right text-desert-green-dark')}>
                {item.value || 'N/A'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="h-1 bg-desert-green" />
    </div>
  )
}
