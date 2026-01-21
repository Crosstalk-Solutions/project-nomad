import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class BenchmarkSubmit extends BaseCommand {
  static commandName = 'benchmark:submit'
  static description = 'Submit benchmark results to the community repository'

  @flags.string({ description: 'Benchmark ID to submit (defaults to latest)', alias: 'i' })
  declare benchmarkId: string

  @flags.boolean({ description: 'Skip confirmation prompt', alias: 'y' })
  declare yes: boolean

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { BenchmarkService } = await import('#services/benchmark_service')
    const benchmarkService = new BenchmarkService()

    try {
      // Get the result to submit
      const result = this.benchmarkId
        ? await benchmarkService.getResultById(this.benchmarkId)
        : await benchmarkService.getLatestResult()

      if (!result) {
        this.logger.error('No benchmark result found.')
        this.logger.info('Run "node ace benchmark:run" first to create a benchmark.')
        this.exitCode = 1
        return
      }

      if (result.submitted_to_repository) {
        this.logger.warning(`Benchmark ${result.benchmark_id} has already been submitted.`)
        this.logger.info(`Repository ID: ${result.repository_id}`)
        return
      }

      // Show what will be submitted
      this.logger.info('')
      this.logger.info('=== Data to be submitted ===')
      this.logger.info('')
      this.logger.info('Hardware Information:')
      this.logger.info(`  CPU Model: ${result.cpu_model}`)
      this.logger.info(`  CPU Cores: ${result.cpu_cores}`)
      this.logger.info(`  CPU Threads: ${result.cpu_threads}`)
      this.logger.info(`  RAM: ${Math.round(result.ram_bytes / (1024 * 1024 * 1024))} GB`)
      this.logger.info(`  Disk Type: ${result.disk_type}`)
      if (result.gpu_model) {
        this.logger.info(`  GPU: ${result.gpu_model}`)
      }
      this.logger.info('')
      this.logger.info('Benchmark Scores:')
      this.logger.info(`  CPU Score: ${result.cpu_score.toFixed(2)}`)
      this.logger.info(`  Memory Score: ${result.memory_score.toFixed(2)}`)
      this.logger.info(`  Disk Read: ${result.disk_read_score.toFixed(2)}`)
      this.logger.info(`  Disk Write: ${result.disk_write_score.toFixed(2)}`)
      if (result.ai_tokens_per_second) {
        this.logger.info(`  AI Tokens/sec: ${result.ai_tokens_per_second.toFixed(2)}`)
        this.logger.info(`  AI TTFT: ${result.ai_time_to_first_token?.toFixed(2)} ms`)
      }
      this.logger.info(`  NOMAD Score: ${result.nomad_score.toFixed(2)}`)
      this.logger.info('')
      this.logger.info('Privacy Notice:')
      this.logger.info('  - Only the information shown above will be submitted')
      this.logger.info('  - No IP addresses, hostnames, or personal data is collected')
      this.logger.info('  - Submissions are completely anonymous')
      this.logger.info('')

      // Confirm submission
      if (!this.yes) {
        const confirm = await this.prompt.confirm(
          'Do you want to submit this benchmark to the community repository?'
        )
        if (!confirm) {
          this.logger.info('Submission cancelled.')
          return
        }
      }

      // Submit
      this.logger.info('Submitting benchmark...')
      const submitResult = await benchmarkService.submitToRepository(result.benchmark_id)

      this.logger.success('Benchmark submitted successfully!')
      this.logger.info('')
      this.logger.info(`Repository ID: ${submitResult.repository_id}`)
      this.logger.info(`Your percentile: ${submitResult.percentile}%`)
      this.logger.info('')
      this.logger.info('Thank you for contributing to the NOMAD community!')

    } catch (error) {
      this.logger.error(`Submission failed: ${error.message}`)
      this.exitCode = 1
    }
  }
}
