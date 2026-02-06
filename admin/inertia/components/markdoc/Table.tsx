export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto my-6 rounded-lg border border-desert-tan-lighter shadow-sm">
      <table className="min-w-full divide-y divide-desert-tan-lighter">
        {children}
      </table>
    </div>
  )
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-desert-green-dark">{children}</thead>
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-desert-tan-lighter/50 bg-white">{children}</tbody>
}

export function TableRow({ children }: { children: React.ReactNode }) {
  return <tr className="hover:bg-desert-sand/40 transition-colors">{children}</tr>
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-left text-sm font-semibold text-desert-white tracking-wide">
      {children}
    </th>
  )
}

export function TableCell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-5 py-3.5 text-sm text-desert-green-darker">
      {children}
    </td>
  )
}
