import { capitalizeFirstLetter } from '~/lib/util'
import classNames from '~/lib/classNames'
import LoadingSpinner from '~/components/LoadingSpinner'
import React, { RefObject } from 'react'

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
}: StyledTableProps<T>) {
  const { className: tableClassName, ...restTableProps } = tableProps

  const leftPadding = compact ? 'pl-2' : 'pl-4 sm:pl-6'

  return (
    <div
      className={classNames(
        'w-full overflow-x-auto bg-white mt-10 ring-1 ring-gray-300 sm:mx-0 sm:rounded-lg p-3 shadow-md',
        className
      )}
      ref={ref}
      {...containerProps}
    >
      <table className="min-w-full overflow-auto" {...restTableProps}>
        <thead className='border-b border-gray-200 '>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className={classNames(
                  'whitespace-nowrap text-left text-sm font-semibold text-gray-900',
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
            data.map((record, recordIdx) => (
              <tr
                data-index={'index' in record ? record.index : recordIdx}
                key={record.id || recordIdx}
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
            ))}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="!text-center ">
                {noDataText}
              </td>
            </tr>
          )}
          {loading && (
            <tr className="!h-16">
              <td colSpan={columns.length} className="!text-center">
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
