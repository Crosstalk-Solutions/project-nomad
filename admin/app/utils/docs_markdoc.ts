import type { ValidateError } from '@markdoc/markdoc'

/** Markdoc schema for the bundled docs: the custom tags and the node renderers. */
export const markdocConfig = {
  tags: {
    callout: {
      render: 'Callout',
      attributes: {
        type: {
          type: String,
          default: 'info',
          matches: ['info', 'warning', 'error', 'success'],
        },
        title: {
          type: String,
        },
      },
    },
  },
  nodes: {
    heading: {
      render: 'Heading',
      attributes: {
        level: { type: Number, required: true },
        id: { type: String },
      },
    },
    list: {
      render: 'List',
      attributes: {
        ordered: { type: Boolean },
        start: { type: Number },
      },
    },
    list_item: {
      render: 'ListItem',
      attributes: {
        marker: { type: String },
        className: { type: String },
        class: { type: String },
      },
    },
    table: {
      render: 'Table',
    },
    thead: {
      render: 'TableHead',
    },
    tbody: {
      render: 'TableBody',
    },
    tr: {
      render: 'TableRow',
    },
    th: {
      render: 'TableHeader',
    },
    td: {
      render: 'TableCell',
    },
    paragraph: {
      render: 'Paragraph',
    },
    image: {
      render: 'Image',
      attributes: {
        src: { type: String, required: true },
        alt: { type: String },
        title: { type: String },
      },
    },
    link: {
      render: 'Link',
      attributes: {
        href: { type: String, required: true },
        title: { type: String },
      },
    },
    fence: {
      render: 'CodeBlock',
      attributes: {
        content: { type: String },
        language: { type: String },
      },
    },
    code: {
      render: 'InlineCode',
      attributes: {
        content: { type: String },
      },
    },
    hr: {
      render: 'HorizontalRule',
    },
  },
}

/**
 * The validation findings that should stop a doc from rendering.
 *
 * Warnings are not among them. Markdoc warns about a **bold** span hard-wrapped
 * across lines, and transform() renders it fine, so failing on warnings turned a
 * line wrap into a 500 for the whole page (#1427). attribute-undefined is
 * skipped as well, since emojis and special characters can raise it.
 */
export function blockingFindings(errors: ValidateError[]): ValidateError[] {
  return errors.filter(
    (e) =>
      e.error.id !== 'attribute-undefined' &&
      (e.error.level === 'error' || e.error.level === 'critical')
  )
}
