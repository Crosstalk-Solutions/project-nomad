import React from 'react'
import Markdoc from '@markdoc/markdoc'
import { Heading } from './markdoc/Heading'
import { List } from './markdoc/List'
import { ListItem } from './markdoc/ListItem'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './markdoc/Table'

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

// Component mapping for Markdoc
const components = {
  Callout,
  Heading,
  List,
  ListItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
}

interface MarkdocRendererProps {
  content: any // Markdoc transformed content
}

const MarkdocRenderer: React.FC<MarkdocRendererProps> = ({ content }) => {
  return <div className="tracking-wide">{Markdoc.renderers.react(content, React, { components })}</div>
}

export default MarkdocRenderer
