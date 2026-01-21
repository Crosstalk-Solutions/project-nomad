import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class BenchmarkRun extends BaseCommand {
  static commandName = 'benchmark:run'
  static description = 'Run system and/or AI benchmarks to measure server performance'

  @flags.boolean({ description: 'Run system benchmarks only (CPU, memory, disk)', alias: 's' })
  declare systemOnly: boolean

  @flags.boolean({ description: 'Run AI benchmark only', alias: 'a' })
  declare aiOnly: boolean

  @flags.boolean({ description: 'Submit results to repository after completion', alias: 'S' })
  declare submit: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { BenchmarkService } = await import('#services/benchmark_service')
    const benchmarkService = new BenchmarkService()

    // Determine benchmark type
    let benchmarkType: 'full' | 'system' | 'ai' = 'full'
    if (this.systemOnly) {
      benchmarkType = 'system'
    } else if (this.aiOnly) {
      benchmarkType = 'ai'
    }

    this.logger.info(`Starting ${benchmarkType} benchmark...`)
    this.logger.info('')

    try {
      // Run the benchmark
      let result
      switch (benchmarkType) {
        case 'system':
          this.logger.info('Running system benchmarks (CPU, memory, disk)...')
          result = await benchmarkService.runSystemBenchmarks()
          break
        case 'ai':
          this.logger.info('Running AI benchmark...')
          result = await benchmarkService.runAIBenchmark()
          break
        default:
          this.logger.info('Running full benchmark suite...')
          result = await benchmarkService.runFullBenchmark()
      }

      // Display results
      this.logger.info('')
      this.logger.success('Benchmark completed!')
      this.logger.info('')

      this.logger.info('=== Hardware Info ===')
      this.logger.info(`CPU: ${result.cpu_model}`)
      this.logger.info(`Cores: ${result.cpu_cores} physical, ${result.cpu_threads} threads`)
      this.logger.info(`RAM: ${Math.round(result.ram_bytes / (1024 * 1024 * 1024))} GB`)
      this.logger.info(`Disk Type: ${result.disk_type}`)
      if (result.gpu_model) {
        this.logger.info(`GPU: ${result.gpu_model}`)
      }

      this.logger.info('')
      this.logger.info('=== Benchmark Scores ===')
      this.logger.info(`CPU Score: ${result.cpu_score.toFixed(2)}`)
      this.logger.info(`Memory Score: ${result.memory_score.toFixed(2)}`)
      this.logger.info(`Disk Read Score: ${result.disk_read_score.toFixed(2)}`)
      this.logger.info(`Disk Write Score: ${result.disk_write_score.toFixed(2)}`)

      if (result.ai_tokens_per_second) {
        this.logger.info(`AI Tokens/sec: ${result.ai_tokens_per_second.toFixed(2)}`)
        this.logger.info(`AI Time to First Token: ${result.ai_time_to_first_token?.toFixed(2)} ms`)
        this.logger.info(`AI Model: ${result.ai_model_used}`)
      }

      this.logger.info('')
      this.logger.info(`NOMAD Score: ${result.nomad_score.toFixed(2)} / 100`)
      this.logger.info('')
      this.logger.info(`Benchmark ID: ${result.benchmark_id}`)

      // Submit if requested
      if (this.submit) {
        this.logger.info('')
        this.logger.info('Submitting results to repository...')
        try {
          const submitResult = await benchmarkService.submitToRepository(result.benchmark_id)
          this.logger.success(`Results submitted! Repository ID: ${submitResult.repository_id}`)
          this.logger.info(`Your percentile: ${submitResult.percentile}%`)
        } catch (error) {
          this.logger.error(`Failed to submit: ${error.message}`)
        }
      }

    } catch (error) {
      this.logger.error(`Benchmark failed: ${error.message}`)
      this.exitCode = 1
    }
  }
}
