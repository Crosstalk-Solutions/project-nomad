import React, { JSX } from 'react'
import Markdoc from '@markdoc/markdoc'

// Custom components for Markdoc tags
const Callout = ({
  type = 'info',
  title,
  children,
}: {
  type?: string
  title?: string
  children: React.ReactNode
}) => {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  }

  return (
    // @ts-ignore
    <div className={`border-l-4 p-4 mb-4 ${styles[type]}`}>
      {title && <h4 className="font-semibold mb-2">{title}</h4>}
      {children}
    </div>
  )
}

const Heading = ({
  level,
  id,
  children,
}: {
  level: number
  id: string
  children: React.ReactNode
}) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  const sizes = {
    1: 'text-3xl font-bold',
    2: 'text-2xl font-semibold',
    3: 'text-xl font-semibold',
    4: 'text-lg font-semibold',
    5: 'text-base font-semibold',
    6: 'text-sm font-semibold',
  }

  return (
    // @ts-ignore
    <Tag id={id} className={`${sizes[level]} mb-4 mt-6`}>
      {children}
    </Tag>
  )
}

// Component mapping for Markdoc
const components = {
  Callout,
  Heading,
}

interface MarkdocRendererProps {
  content: any // Markdoc transformed content
}

const MarkdocRenderer: React.FC<MarkdocRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-lg max-w-none">
      {Markdoc.renderers.react(content, React, { components })}
    </div>
  )
}

export default MarkdocRenderer
