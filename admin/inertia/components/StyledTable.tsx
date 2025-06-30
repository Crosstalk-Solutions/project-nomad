import { capitalizeFirstLetter } from '~/lib/util'
import classNames from '~/lib/classNames'
import LoadingSpinner from '~/components/LoadingSpinner'

interface StyledTableProps<T = Record<string, unknown>> {
  loading?: boolean
  tableProps?: React.HTMLAttributes<HTMLTableElement>
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
}

function StyledTable<T>({
  loading = false,
  tableProps = {},
  data = [],
  noDataText = 'No records found',
  onRowClick,
  columns = [],
  className = '',
}: StyledTableProps<T>) {
  const { className: tableClassName, ...restTableProps } = tableProps

  return (
    <div
      className={classNames(
        'w-full overflow-x-auto bg-white mt-10 ring-1 ring-gray-300 sm:mx-0 sm:rounded-lg p-3 shadow-md',
        className
      )}
    >
      <table className="min-w-full" {...restTableProps}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                className="whitespace-nowrap text-left py-3.5 pl-4 pr-3text-sm font-semibold text-gray-900 sm:pl-6"
              >
                {column.title ?? capitalizeFirstLetter(column.accessor.toString())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!loading &&
            data.length !== 0 &&
            data.map((record, recordIdx) => (
              <tr
                key={crypto.randomUUID()}
                onClick={() => onRowClick?.(record)}
                className={onRowClick ? `cursor-pointer hover:bg-gray-100 ` : ''}
              >
                {columns.map((column, index) => (
                  <td
                    key={index}
                    className={classNames(
                      recordIdx === 0 ? '' : 'border-t border-transparent',
                      'relative py-4 pl-4 pr-3 text-sm sm:pl-6 whitespace-nowrap max-w-72 truncate break-words',
                      column.className || ''
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
