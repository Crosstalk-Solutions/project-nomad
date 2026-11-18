import { useState } from 'react'
import StyledButton from '~/components/StyledButton'
import StyledModal from '~/components/StyledModal'
import api from '~/lib/api'
import type { BenchmarkRunHook } from '~/hooks/useBenchmarkRun'

/**
 * "Cancel benchmark" for the live run view. Asks first, and for runs with an AI
 * stage offers to delete the AI benchmark model if this run downloaded it. The
 * run itself reports 'cancelled' over the progress channel, which ends the
 * running view, so this component only needs to send the request.
 */
export default function CancelBenchmarkButton({ run }: { run: BenchmarkRunHook }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteModel, setDeleteModel] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const includesAI = run.stages.some((stage) => stage.status === 'running_ai')

  const confirm = async () => {
    setError(null)
    setRequested(true)
    const res = await api.cancelBenchmark(includesAI && deleteModel)
    if (!res?.success) {
      setRequested(false)
      setError('Could not cancel the benchmark. Please try again.')
      return
    }
    setConfirmOpen(false)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <StyledButton
        variant="outline"
        icon="IconPlayerStop"
        onClick={() => setConfirmOpen(true)}
        disabled={requested}
        loading={requested}
      >
        {requested ? 'Cancelling...' : 'Cancel Benchmark'}
      </StyledButton>
      {error && <p className="text-sm text-desert-red">{error}</p>}
      <StyledModal
        open={confirmOpen}
        title="Cancel benchmark?"
        onClose={() => !requested && setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
        cancelText="Keep Running"
        onConfirm={confirm}
        confirmText="Cancel Benchmark"
        confirmVariant="danger"
        confirmLoading={requested}
      >
        <div className="space-y-4 text-left">
          <p className="text-sm text-text-muted">
            The benchmark stops within a few seconds and results from this run are not saved.
          </p>
          {includesAI && (
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deleteModel}
                onChange={(e) => setDeleteModel(e.target.checked)}
                className="accent-desert-orange h-4 w-4 mt-0.5 rounded"
              />
              <span className="text-sm text-text-primary">
                Also delete the AI benchmark model if this run downloaded it (about 4.9 GB). A model
                you already had is never deleted. If unchecked, a partial download is kept and the
                next AI benchmark resumes it.
              </span>
            </label>
          )}
        </div>
      </StyledModal>
    </div>
  )
}
