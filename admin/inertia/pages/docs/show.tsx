import { Head } from '@inertiajs/react'
import MarkdocRenderer from '~/components/MarkdocRenderer'
import DocsLayout from '~/layouts/DocsLayout'

export default function Show({ content }: { content: any; }) {
  return (
    <DocsLayout>
      <Head title={'Documentation'} />
      <div className="xl:pl-80 py-6">
        <MarkdocRenderer content={content} />
      </div>
    </DocsLayout>
  )
}
