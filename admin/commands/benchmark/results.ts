import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class BenchmarkResults extends BaseCommand {
  static commandName = 'benchmark:results'
  static description = 'Display benchmark results'

  @flags.boolean({ description: 'Show only the latest result', alias: 'l' })
  declare latest: boolean

  @flags.string({ description: 'Output format (table, json)', default: 'table' })
  declare format: string

  @flags.string({ description: 'Show specific benchmark by ID', alias: 'i' })
  declare id: string

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { DockerService } = await import('#services/docker_service')
    const { BenchmarkService } = await import('#services/benchmark_service')
    const dockerService = new DockerService()
    const benchmarkService = new BenchmarkService(dockerService)

    try {
      let results

      if (this.id) {
        const result = await benchmarkService.getResultById(this.id)
        results = result ? [result] : []
      } else if (this.latest) {
        const result = await benchmarkService.getLatestResult()
        results = result ? [result] : []
      } else {
        results = await benchmarkService.getAllResults()
      }

      if (results.length === 0) {
        this.logger.info('No benchmark results found.')
        this.logger.info('Run "node ace benchmark:run" to create a benchmark.')
        return
      }

      if (this.format === 'json') {
        console.log(JSON.stringify(results, null, 2))
        return
      }

      // Table format
      for (const result of results) {
        this.logger.info('')
        this.logger.info(`=== Benchmark ${result.benchmark_id} ===`)
        this.logger.info(`Type: ${result.benchmark_type}`)
        this.logger.info(`Date: ${result.created_at}`)
        this.logger.info('')

        this.logger.info('Hardware:')
        this.logger.info(`  CPU: ${result.cpu_model}`)
        this.logger.info(`  Cores: ${result.cpu_cores} physical, ${result.cpu_threads} threads`)
        this.logger.info(`  RAM: ${Math.round(result.ram_bytes / (1024 * 1024 * 1024))} GB`)
        this.logger.info(`  Disk: ${result.disk_type}`)
        if (result.gpu_model) {
          this.logger.info(`  GPU: ${result.gpu_model}`)
        }
        this.logger.info('')

        this.logger.info('Scores:')
        this.logger.info(`  CPU: ${result.cpu_score.toFixed(2)}`)
        this.logger.info(`  Memory: ${result.memory_score.toFixed(2)}`)
        this.logger.info(`  Disk Read: ${result.disk_read_score.toFixed(2)}`)
        this.logger.info(`  Disk Write: ${result.disk_write_score.toFixed(2)}`)

        if (result.ai_tokens_per_second) {
          this.logger.info(`  AI Tokens/sec: ${result.ai_tokens_per_second.toFixed(2)}`)
          this.logger.info(`  AI TTFT: ${result.ai_time_to_first_token?.toFixed(2)} ms`)
        }
        this.logger.info('')

        this.logger.info(`NOMAD Score: ${result.nomad_score.toFixed(2)} / 100`)

        if (result.submitted_to_repository) {
          this.logger.info(`Submitted: Yes (${result.repository_id})`)
        } else {
          this.logger.info('Submitted: No')
        }
        this.logger.info('')
      }

      this.logger.info(`Total results: ${results.length}`)

    } catch (error) {
      this.logger.error(`Failed to retrieve results: ${error.message}`)
      this.exitCode = 1
    }
  }
}
