export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-6">
      <table className="min-w-full divide-y divide-gray-300 border border-gray-300">
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-gray-200 bg-white">{children}</tbody>
}

export function TableRow({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300 last:border-r-0">
      {children}
    </th>
  )
}

export function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-6 py-4 text-sm text-gray-700 border-r border-gray-200 last:border-r-0">
      {children}
    </td>
  )
}
