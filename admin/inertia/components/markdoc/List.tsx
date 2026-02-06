export function List({
  ordered = false,
  start,
  children,
}: {
  ordered?: boolean
  start?: number
  children: React.ReactNode
}) {
  const className = ordered
    ? 'list-decimal list-outside ml-6 mb-5 space-y-2 marker:text-desert-orange marker:font-semibold'
    : 'list-disc list-outside ml-6 mb-5 space-y-2 marker:text-desert-orange'
  const Tag = ordered ? 'ol' : 'ul'
  return (
    // @ts-ignore
    <Tag start={ordered ? start : undefined} className={className}>
      {children}
    </Tag>
  )
}
