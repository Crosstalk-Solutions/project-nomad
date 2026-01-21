import vine from '@vinejs/vine'

export const runBenchmarkValidator = vine.compile(
  vine.object({
    benchmark_type: vine.enum(['full', 'system', 'ai']).optional(),
  })
)

export const submitBenchmarkValidator = vine.compile(
  vine.object({
    benchmark_id: vine.string().optional(),
  })
)
