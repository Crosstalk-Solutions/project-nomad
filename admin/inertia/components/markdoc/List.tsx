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
    ? 'list-decimal list-outside !ml-12 mb-4 space-y-1' 
    : 'list-disc list-outside !ml-12 mb-4 space-y-1'
  const Tag = ordered ? 'ol' : 'ul'
  return (
    // @ts-ignore
    <Tag start={ordered ? start : undefined} className={className}>
      {children}
    </Tag>
  )
}
