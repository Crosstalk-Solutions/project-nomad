import vine from '@vinejs/vine'

export const runBenchmarkValidator = vine.compile(
  vine.object({
    benchmark_type: vine.enum(['full', 'system', 'ai']).optional(),
  })
)

export const cancelBenchmarkValidator = vine.compile(
  vine.object({
    // Also delete the AI benchmark model if this run downloaded it.
    delete_model: vine.boolean().optional(),
  })
)

export const submitBenchmarkValidator = vine.compile(
  vine.object({
    benchmark_id: vine.string().optional(),
  })
)
