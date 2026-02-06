import { Head } from '@inertiajs/react'
import MarkdocRenderer from '~/components/MarkdocRenderer'
import DocsLayout from '~/layouts/DocsLayout'

export default function Show({ content }: { content: any; }) {
  return (
    <DocsLayout>
      <Head title={'Documentation'} />
      <div className="xl:pl-80 pt-14 xl:pt-8 pb-8 px-6 sm:px-8 lg:px-12">
        <div className="max-w-4xl">
          <MarkdocRenderer content={content} />
        </div>
      </div>
    </DocsLayout>
  )
}
