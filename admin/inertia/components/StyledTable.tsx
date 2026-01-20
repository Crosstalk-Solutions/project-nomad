import { capitalizeFirstLetter } from '~/lib/util'
import classNames from '~/lib/classNames'
import LoadingSpinner from '~/components/LoadingSpinner'
import React, { RefObject, useState } from 'react'

export type StyledTableProps<T extends { [key: string]: any }> = {
  loading?: boolean
  tableProps?: React.HTMLAttributes<HTMLTableElement>
  tableRowStyle?: React.CSSProperties
  tableBodyClassName?: string
  tableBodyStyle?: React.CSSProperties
  data?: T[]
  noDataText?: string
  onRowClick?: (record: T) => void
  columns?: {
    accessor: keyof T
    title?: React.ReactNode
    render?: (record: T, index: number) => React.ReactNode
    className?: string
  }[]
  className?: string
  rowLines?: boolean
  ref?: RefObject<HTMLDivElement | null>
  containerProps?: React.HTMLAttributes<HTMLDivElement>
  compact?: boolean
  expandable?: {
    expandedRowRender: (record: T, index: number) => React.ReactNode
    defaultExpandedRowKeys?: (string | number)[]
    onExpandedRowsChange?: (expandedKeys: (string | number)[]) => void
    expandIconColumnIndex?: number
  }
}

function StyledTable<T extends { [key: string]: any }>({
  loading = false,
  tableProps = {},
  tableRowStyle = {},
  tableBodyClassName = '',
  tableBodyStyle = {},
  data = [],
  noDataText = 'No records found',
  onRowClick,
  columns = [],
  className = '',
  ref,
  containerProps = {},
  rowLines = true,
  compact = false,
  expandable,
}: StyledTableProps<T>) {
  const { className: tableClassName, ...restTableProps } = tableProps

  const [expandedRowKeys, setExpandedRowKeys] = useState<(string | number)[]>(
    expandable?.defaultExpandedRowKeys || []
  )

  const leftPadding = compact ? 'pl-2' : 'pl-4 sm:pl-6'

  const isRowExpanded = (record: T, index: number) => {
    const key = record.id ?? index
    return expandedRowKeys.includes(key)
  }

  const toggleRowExpansion = (record: T, index: number, event: React.MouseEvent) => {
    event.stopPropagation()
    const key = record.id ?? index
    const newExpandedKeys = expandedRowKeys.includes(key)
      ? expandedRowKeys.filter((k) => k !== key)
      : [...expandedRowKeys, key]
    setExpandedRowKeys(newExpandedKeys)
    expandable?.onExpandedRowsChange?.(newExpandedKeys)
  }

  return (
    <div
      className={classNames(
        'w-full overflow-x-auto bg-white ring-1 ring-gray-300 sm:mx-0 sm:rounded-lg p-1 shadow-md',
        className
      )}
      ref={ref}
      {...containerProps}
    >
      <table className="min-w-full overflow-auto" {...restTableProps}>
        <thead className='border-b border-gray-200 '>
          <tr>
            {expandable && (
              <th
                className={classNames(
                  'whitespace-nowrap text-left font-semibold text-gray-900 w-12',
                  compact ? `${leftPadding} py-2` : `${leftPadding} py-4  pr-3`
                )}
              />
            )}
            {columns.map((column, index) => (
              <th
                key={index}
                className={classNames(
                  'whitespace-nowrap text-left font-semibold text-gray-900',
                  compact ? `${leftPadding} py-2` : `${leftPadding} py-4  pr-3`
                )}
              >
                {column.title ?? capitalizeFirstLetter(column.accessor.toString())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tableBodyClassName} style={tableBodyStyle}>
          {!loading &&
            data.length !== 0 &&
            data.map((record, recordIdx) => {
              const isExpanded = expandable && isRowExpanded(record, recordIdx)
              return (
                <React.Fragment key={record.id || recordIdx}>
                  <tr
                    data-index={'index' in record ? record.index : recordIdx}
                    onClick={() => onRowClick?.(record)}
                    style={{
                      ...tableRowStyle,
                      height: 'height' in record ? record.height : 'auto',
                      transform:
                        'translateY' in record ? 'translateY(' + record.transformY + 'px)' : undefined,
                    }}
                    className={classNames(
                      rowLines ? 'border-b border-gray-200' : '',
                      onRowClick ? `cursor-pointer hover:bg-gray-100 ` : ''
                    )}
                  >
                    {expandable && (
                      <td
                        className={classNames(
                          'text-sm whitespace-nowrap text-left w-12',
                          compact ? `${leftPadding} py-2` : `${leftPadding} py-4 pr-3`
                        )}
                        onClick={(e) => toggleRowExpansion(record, recordIdx, e)}
                      >
                        <button
                          className="text-gray-500 hover:text-gray-700 focus:outline-none"
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          <svg
                            className={classNames(
                              'w-5 h-5 transition-transform',
                              isExpanded ? 'rotate-90' : ''
                            )}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      </td>
                    )}
                    {columns.map((column, index) => (
                      <td
                        key={index}
                        className={classNames(
                          'relative text-sm whitespace-nowrap max-w-72 truncate break-words text-left',
                          column.className || '',
                          compact ? `${leftPadding} py-2` : `${leftPadding} py-4 pr-3`
                        )}
                      >
                        {column.render
                          ? column.render(record, index)
                          : (record[column.accessor] as React.ReactNode)}
                      </td>
                    ))}
                  </tr>
                  {expandable && isExpanded && (
                    <tr className="bg-gray-50">
                      <td colSpan={columns.length + 1}>
                        {expandable.expandedRowRender(record, recordIdx)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length + (expandable ? 1 : 0)} className="!text-center py-8 text-gray-500">
                {noDataText}
              </td>
            </tr>
          )}
          {loading && (
            <tr className="!h-16">
              <td colSpan={columns.length + (expandable ? 1 : 0)} className="!text-center">
                <LoadingSpinner fullscreen={false} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default StyledTable
