import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { BenchmarkService } from '#services/benchmark_service'
import { runBenchmarkValidator, submitBenchmarkValidator } from '#validators/benchmark'
import { RunBenchmarkJob } from '#jobs/run_benchmark_job'
import type { BenchmarkType } from '../../types/benchmark.js'
import { randomUUID } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'

@inject()
export default class BenchmarkController {
  constructor(private benchmarkService: BenchmarkService) {}

  /**
   * Inicia uma execução de benchmark (de forma assíncrona pela fila de tarefas
   * ou de forma síncrona, se solicitado).
   */
  async run({ request, response }: HttpContext) {
    const payload = await request.validateUsing(runBenchmarkValidator)
    const benchmarkType: BenchmarkType = payload.benchmark_type || 'full'
    const runSync = request.input('sync') === 'true' || request.input('sync') === true

    // Verifica se já existe um benchmark em execução.
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'Já existe um benchmark em execução.',
        current_benchmark_id: status.benchmarkId,
      })
    }

    // Executa de forma síncrona, se solicitado
    // (útil para desenvolvimento local sem Redis).
    if (runSync) {
      try {
        let result
        switch (benchmarkType) {
          case 'full':
            result = await this.benchmarkService.runFullBenchmark()
            break
          case 'system':
            result = await this.benchmarkService.runSystemBenchmarks()
            break
          case 'ai':
            result = await this.benchmarkService.runAIBenchmark()
            break
          default:
            result = await this.benchmarkService.runFullBenchmark()
        }
        return response.send({
          success: true,
          benchmark_id: result.benchmark_id,
          nomad_score: result.nomad_score,
          result,
        })
      } catch (error) {
        logger.error({ err: error }, '[BenchmarkController] Falha ao executar o benchmark')
        return response.status(500).send({
          success: false,
          error: 'Ocorreu um erro interno durante a execução do benchmark.',
        })
      }
    }

    // Gera um ID para o benchmark e envia a tarefa para execução assíncrona.
    const benchmarkId = randomUUID()
    const { job, created } = await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: benchmarkType,
      include_ai: benchmarkType === 'full' || benchmarkType === 'ai',
    })

    return response.status(201).send({
      success: true,
      job_id: job?.id || benchmarkId,
      benchmark_id: benchmarkId,
      message: created
        ? `Benchmark do tipo ${benchmarkType} iniciado.`
        : 'A tarefa do benchmark já existe.',
    })
  }

  /**
   * Executa apenas os testes de desempenho do sistema (CPU, memória e disco).
   */
  async runSystem({ response }: HttpContext) {
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'Já existe um benchmark em execução.',
      })
    }

    const benchmarkId = randomUUID()
    await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: 'system',
      include_ai: false,
    })

    return response.status(201).send({
      success: true,
      benchmark_id: benchmarkId,
      message: 'Benchmark do sistema iniciado.',
    })
  }

  /**
   * Executa apenas o benchmark de inteligência artificial.
   */
  async runAI({ response }: HttpContext) {
    const status = this.benchmarkService.getStatus()
    if (status.status !== 'idle') {
      return response.status(409).send({
        success: false,
        error: 'Já existe um benchmark em execução.',
      })
    }

    const benchmarkId = randomUUID()
    await RunBenchmarkJob.dispatch({
      benchmark_id: benchmarkId,
      benchmark_type: 'ai',
      include_ai: true,
    })

    return response.status(201).send({
      success: true,
      benchmark_id: benchmarkId,
      message: 'Benchmark de inteligência artificial iniciado.',
    })
  }

  /**
   * Obtém todos os resultados dos benchmarks.
   */
  async results({}: HttpContext) {
    const results = await this.benchmarkService.getAllResults()
    return {
      results,
      total: results.length,
    }
  }

  /**
   * Obtém o resultado mais recente de benchmark.
   */
  async latest({}: HttpContext) {
    const result = await this.benchmarkService.getLatestResult()
    if (!result) {
      return { result: null }
    }
    return { result }
  }

  /**
   * Obtém um resultado específico de benchmark pelo ID.
   */
  async show({ params, response }: HttpContext) {
    const result = await this.benchmarkService.getResultById(params.id)
    if (!result) {
      return response.status(404).send({
        error: 'Resultado do benchmark não encontrado.',
      })
    }
    return { result }
  }

  /**
   * Envia os resultados do benchmark para o repositório central.
   */
  async submit({ request, response }: HttpContext) {
    const payload = await request.validateUsing(submitBenchmarkValidator)
    const anonymous = request.input('anonymous') === true || request.input('anonymous') === 'true'

    try {
      const submitResult = await this.benchmarkService.submitToRepository(payload.benchmark_id, anonymous)
      return response.send({
        success: true,
        repository_id: submitResult.repository_id,
        percentile: submitResult.percentile,
      })
    } catch (error) {
      // Utiliza o código de status do serviço, se disponível;
      // caso contrário, utiliza 400 como padrão.
      const statusCode = (error as any).statusCode || 400
      logger.error({ err: error }, '[BenchmarkController] Falha ao enviar o benchmark')

      // Retorna à interface uma explicação clara e útil, em vez de uma
      // mensagem genérica. O limite de requisições (429) é uma causa comum,
      // por isso é tratado separadamente. Nos demais casos, utiliza os detalhes
      // do erro do repositório ou da validação do serviço e, se não houver,
      // apresenta uma mensagem genérica segura.
      let errorMessage: string
      if (statusCode === 429) {
        errorMessage = 'Você só pode enviar um benchmark por hora. Aguarde um pouco e tente novamente.'
      } else {
        errorMessage =
          (error as any).detail || (error as any).message || 'Falha ao enviar os resultados do benchmark.'
      }

      return response.status(statusCode).send({
        success: false,
        error: errorMessage,
      })
    }
  }

  /**
   * Atualiza a identificação do construtor associada a um resultado de benchmark.
   */
  async updateBuilderTag({ request, response }: HttpContext) {
    const benchmarkId = request.input('benchmark_id')
    const builderTag = request.input('builder_tag')

    if (!benchmarkId) {
      return response.status(400).send({
        success: false,
        error: 'O campo benchmark_id é obrigatório.',
      })
    }

    const result = await this.benchmarkService.getResultById(benchmarkId)
    if (!result) {
      return response.status(404).send({
        success: false,
        error: 'Resultado do benchmark não encontrado.',
      })
    }

    // Valida o formato da identificação do construtor, caso tenha sido fornecida.
    if (builderTag) {
      const tagPattern = /^[A-Za-z]+-[A-Za-z]+-\d{4}$/
      if (!tagPattern.test(builderTag)) {
        return response.status(400).send({
          success: false,
          error: 'Formato inválido para a identificação do construtor. Formato esperado: Palavra-Palavra-0000.',
        })
      }
    }

    result.builder_tag = builderTag || null
    await result.save()

    return response.send({
      success: true,
      builder_tag: result.builder_tag,
    })
  }

  /**
   * Obtém estatísticas de comparação do repositório central.
   */
  async comparison({}: HttpContext) {
    const stats = await this.benchmarkService.getComparisonStats()
    return { stats }
  }

  /**
   * Obtém o estado atual do benchmark.
   */
  async status({}: HttpContext) {
    return this.benchmarkService.getStatus()
  }

  /**
   * Verifica se o painel deve exibir o aviso para executar novamente
   * o benchmark utilizando o Score v2.
   */
  async rerunBanner({}: HttpContext) {
    return { show: await this.benchmarkService.shouldShowRerunBanner() }
  }

  /**
   * Obtém as configurações dos benchmarks.
   */
  async settings({}: HttpContext) {
    const { default: BenchmarkSetting } = await import('#models/benchmark_setting')
    return await BenchmarkSetting.getAllSettings()
  }

  /**
   * Atualiza as configurações dos benchmarks.
   */
  async updateSettings({ request, response }: HttpContext) {
    const { default: BenchmarkSetting } = await import('#models/benchmark_setting')
    const body = request.body()

    if (body.allow_anonymous_submission !== undefined) {
      await BenchmarkSetting.setValue(
        'allow_anonymous_submission',
        body.allow_anonymous_submission ? 'true' : 'false'
      )
    }

    return response.send({
      success: true,
      settings: await BenchmarkSetting.getAllSettings(),
    })
  }
}
```
