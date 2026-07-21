import { parseLabelSection, isLabelSectionHeader, type LabelBlock } from '../../../util/drug_interactions'

/**
 * Renders flattened FDA label section text as readable blocks: bullet lists, the
 * muted section header, and paragraphs whose subsection number ("7.1") shows as a
 * small badge. FDA wording is kept verbatim (see util/drug_interactions.ts); this
 * only structures it. Shared by the interaction comparison view and the
 * single-drug detail page.
 */
export default function LabelBlocks({
  text,
  tone = 'default',
}: {
  text: string | null | undefined
  tone?: 'default' | 'danger'
}) {
  const blocks = parseLabelSection(text)
  if (blocks.length === 0) return null
  const bodyColor = tone === 'danger' ? 'text-red-800' : 'text-gray-800'
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <LabelBlockView key={i} block={block} bodyColor={bodyColor} />
      ))}
    </div>
  )
}

function LabelBlockView({ block, bodyColor }: { block: LabelBlock; bodyColor: string }) {
  if (block.bullets) {
    return (
      <ul className={`list-disc pl-5 space-y-1.5 text-sm ${bodyColor} leading-relaxed`}>
        {block.bullets.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
  }

  if (isLabelSectionHeader(block.text)) {
    return (
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {block.text!.replace(/^\s*\d{1,2}\s+/, '')}
      </p>
    )
  }

  return (
    <p className={`text-sm ${bodyColor} leading-relaxed`}>
      {block.label && (
        <span className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-semibold align-baseline">
          {block.label}
        </span>
      )}
      {block.text}
    </p>
  )
}
