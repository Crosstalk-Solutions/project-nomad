import { Head } from '@inertiajs/react'
import MarkdocRenderer from '~/components/MarkdocRenderer'
import DocsLayout from '~/layouts/DocsLayout'

export default function Show({ content, title }: { content: any; title: string }) {
  return (
    <DocsLayout>
      <Head title={`${title} | Documentation | Project N.O.M.A.D.`} />
      <div className="xl:pl-80 py-6">
        <h1 className='font-semibold text-xl'>{title}</h1>
        <MarkdocRenderer content={content} />
      </div>
    </DocsLayout>
  )
}
