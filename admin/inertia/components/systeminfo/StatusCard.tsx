export type StatusCardProps = {
  title: string
  value: string | number
}

export default function StatusCard({ title, value }: StatusCardProps) {
  return (
    <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-desert-stone-dark">{title}</span>
        <div className="w-2 h-2 bg-desert-olive rounded-full animate-pulse" />
      </div>
      <div className="text-2xl font-bold text-desert-green">{value}</div>
    </div>
  )
}
