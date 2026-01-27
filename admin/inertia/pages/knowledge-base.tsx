import { Head } from '@inertiajs/react'
import { useState } from 'react'
import FileUploader from '~/components/file-uploader'
import StyledButton from '~/components/StyledButton'
import AppLayout from '~/layouts/AppLayout'

export default function KnowledgeBase() {
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  return (
    <AppLayout>
      <Head title="Knowledge Base" />
      <main className="px-6 lg:px-12 py-6 lg:py-8">
        <div className="bg-white rounded-lg border shadow-md overflow-hidden">
          <div className="p-6">
            <FileUploader
              minFiles={1}
              maxFiles={1}
              onUpload={(files) => {
                setLoading(true)
                setFiles(Array.from(files))
                setLoading(false)
              }}
            />
            <div className="flex justify-center gap-4 my-6">
              <StyledButton
                variant="primary"
                size="lg"
                icon="ArrowUpCircleIcon"
                onClick={() => {}}
                disabled={files.length === 0 || loading}
                loading={loading}
              >
                Upload
              </StyledButton>
            </div>
          </div>
          <div className="border-t bg-white p-6">
            <h3 className="text-lg font-semibold text-desert-green mb-4">
              Why upload documents to your Knowledge Base?
            </h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                  1
                </div>
                <div>
                  <p className="font-medium text-desert-stone-dark">
                    AI Assistant Knowledge Base Integration
                  </p>
                  <p className="text-sm text-desert-stone">
                    When you upload documents to your Knowledge Base, NOMAD processes and embeds the
                    content, making it directly accessible to the AI Assistant. This allows the AI
                    Assistant to reference your specific documents during conversations, providing
                    more accurate and personalized responses based on your uploaded data.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                  2
                </div>
                <div>
                  <p className="font-medium text-desert-stone-dark">
                    Enhanced Document Processing with OCR
                  </p>
                  <p className="text-sm text-desert-stone">
                    NOMAD includes built-in Optical Character Recognition (OCR) capabilities,
                    allowing it to extract text from image-based documents such as scanned PDFs or
                    photos. This means that even if your documents are not in a standard text
                    format, NOMAD can still process and embed their content for AI access.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-desert-green text-white flex items-center justify-center text-sm font-bold">
                  3
                </div>
                <div>
                  <p className="font-medium text-desert-stone-dark">
                    Information Library Integration
                  </p>
                  <p className="text-sm text-desert-stone">
                    NOMAD will automatically discover and extract any content you save to your
                    Information Library (if installed), making it instantly available to the AI
                    Assistant without any extra steps.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  )
}
