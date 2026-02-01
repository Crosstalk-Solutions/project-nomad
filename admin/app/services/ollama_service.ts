import { inject } from '@adonisjs/core'
import { ChatRequest, Ollama } from 'ollama'
import { NomadOllamaModel } from '../../types/ollama.js'
import { FALLBACK_RECOMMENDED_OLLAMA_MODELS } from '../../constants/ollama.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import { DownloadModelJob } from '#jobs/download_model_job'
import { PassThrough } from 'node:stream'
import { SERVICE_NAMES } from '../../constants/service_names.js'

const NOMAD_MODELS_API_BASE_URL = 'https://api.projectnomad.us/api/v1/ollama/models'
const MODELS_CACHE_FILE = path.join(process.cwd(), 'storage', 'ollama-models-cache.json')
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

@inject()
export class OllamaService {
  private ollama: Ollama | null = null
  private ollamaInitPromise: Promise<void> | null = null

  constructor() {}

  private async _initializeOllamaClient() {
    if (!this.ollamaInitPromise) {
      this.ollamaInitPromise = (async () => {
        const dockerService = new (await import('./docker_service.js')).DockerService()
        const qdrantUrl = await dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
        if (!qdrantUrl) {
          throw new Error('Ollama service is not installed or running.')
        }
        this.ollama = new Ollama({ host: qdrantUrl })
      })()
    }
    return this.ollamaInitPromise
  }

  private async _ensureDependencies() {
    if (!this.ollama) {
      await this._initializeOllamaClient()
    }
  }

  /** We need to call this in the DownloadModelJob, so it can't be private,
   * but shouldn't be called directly (dispatch job instead)
   */
  async _downloadModel(
    model: string,
    onProgress?: (progress: {
      status: string
      completed?: number
      total?: number
      percent?: number
    }) => void
  ): Promise<{ success: boolean; message: string }> {
    return new Promise(async (resolve) => {
      try {
        const dockerService = new (await import('./docker_service.js')).DockerService()
        const container = dockerService.docker.getContainer(SERVICE_NAMES.OLLAMA)
        if (!container) {
          logger.warn('[OllamaService] Ollama container is not running. Cannot download model.')
          resolve({
            success: false,
            message: 'Ollama is not running. Please start Ollama and try again.',
          })
          return
        }

        container.exec(
          {
            Cmd: ['ollama', 'pull', model],
            AttachStdout: true,
            AttachStderr: true,
          },
          (err, exec) => {
            if (err) {
              logger.error(
                `[OllamaService] Failed to execute model download command: ${
                  err instanceof Error ? err.message : err
                }`
              )
              resolve({ success: false, message: 'Failed to execute download command.' })
              return
            }

            if (!exec) {
              logger.error('[OllamaService] No exec instance returned from exec command')
              resolve({ success: false, message: 'Failed to create exec instance.' })
              return
            }

            exec.start(
              {
                hijack: true,
                stdin: false,
              },
              (startErr, stream) => {
                if (startErr) {
                  logger.error(
                    `[OllamaService] Failed to start exec stream: ${
                      startErr instanceof Error ? startErr.message : startErr
                    }`
                  )
                  resolve({ success: false, message: 'Failed to start download stream.' })
                  return
                }

                if (!stream) {
                  logger.error('[OllamaService] No stream returned when starting exec')
                  resolve({ success: false, message: 'No stream available.' })
                  return
                }

                // Create PassThrough streams to capture output
                const stdout = new PassThrough()
                const stderr = new PassThrough()

                // Demultiplex the Docker stream
                dockerService.docker.modem.demuxStream(stream, stdout, stderr)

                // Capture and parse stdout (if any)
                stdout.on('data', (chunk) => {
                  const output = chunk.toString()
                  logger.info(`[OllamaService] Model download (stdout): ${output}`)
                })

                // Capture stderr - ollama sends progress/status here (not necessarily errors)
                stderr.on('data', (chunk) => {
                  const output = chunk.toString()

                  // Check if this is an actual error message
                  if (
                    output.toLowerCase().includes('error') ||
                    output.toLowerCase().includes('failed')
                  ) {
                    logger.error(`[OllamaService] Model download error: ${output}`)
                  } else {
                    // This is normal progress/status output from ollama
                    logger.info(`[OllamaService] Model download progress: ${output}`)

                    // Parse JSON progress if available
                    try {
                      const lines = output
                        .split('\n')
                        .filter(
                          (line: any) => typeof line.trim() === 'string' && line.trim().length > 0
                        )
                      for (const line of lines) {
                        const parsed = JSON.parse(line)
                        if (parsed.status) {
                          const progressData: {
                            status: string
                            completed?: number
                            total?: number
                            percent?: number
                          } = {
                            status: parsed.status,
                          }

                          // Extract byte progress if available
                          if (parsed.completed !== undefined && parsed.total !== undefined) {
                            progressData.completed = parsed.completed
                            progressData.total = parsed.total
                            progressData.percent = Math.round(
                              (parsed.completed / parsed.total) * 100
                            )
                          }

                          // Call progress callback
                          if (onProgress) {
                            onProgress(progressData)
                          }

                          // Log structured progress
                          if (progressData.percent !== undefined) {
                            logger.info(
                              `[OllamaService] ${progressData.status}: ${progressData.percent}% (${progressData.completed}/${progressData.total} bytes)`
                            )
                          } else {
                            logger.info(`[OllamaService] ${progressData.status}`)
                          }
                        }
                      }
                    } catch {
                      // Not JSON, already logged above
                    }
                  }
                })

                // Handle stream end
                stream.on('end', () => {
                  logger.info(
                    `[OllamaService] Model download process ended for model "${model}"`
                  )
                  resolve({
                    success: true,
                    message: 'Model download completed successfully.',
                  })
                })

                // Handle stream errors
                stream.on('error', (streamErr) => {
                  logger.error(
                    `[OllamaService] Error during model download stream: ${
                      streamErr instanceof Error ? streamErr.message : streamErr
                    }`
                  )
                  resolve({
                    success: false,
                    message: 'Error occurred during model download.',
                  })
                })
              }
            )
          }
        )
      } catch (error) {
        logger.error(
          `[OllamaService] Failed to download model "${model}": ${
            error instanceof Error ? error.message : error
          }`
        )
        resolve({ success: false, message: 'Failed to download model.' })
      }
    })
  }

  /**
   * Synchronous version of model download (waits for completion). Should only be used for
   * small models or in contexts where a background job is incompatible.
   * @param model Model name to download
   * @returns Success status and message
   */
  async downloadModelSync(model: string): Promise<{ success: boolean; message: string }> {
    try {
      // See if model is already installed
      const installedModels = await this.getModels()
      if (installedModels && installedModels.some((m) => m.name === model)) {
        logger.info(`[OllamaService] Model "${model}" is already installed.`)
        return { success: true, message: 'Model is already installed.' }
      }

      const dockerService = new (await import('./docker_service.js')).DockerService()
      
      const ollamAPIURL = await dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
      if (!ollamAPIURL) {
        logger.warn('[OllamaService] Ollama service is not running. Cannot download model.')
        return {
          success: false,
          message: 'Ollama is not running. Please start Ollama and try again.',
        }
      }

      // 10 minutes timeout for large model downloads
      await axios.post(`${ollamAPIURL}/api/pull`, { name: model }, { timeout: 600000 })

      logger.info(`[OllamaService] Model "${model}" downloaded via API.`)
      return { success: true, message: 'Model downloaded successfully.' }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to download model "${model}": ${
          error instanceof Error ? error.message : error
        }`
      )
      return { success: false, message: 'Failed to download model.' }
    }
  }

  async dispatchModelDownload(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`[OllamaService] Dispatching model download for ${modelName} via job queue`)

      await DownloadModelJob.dispatch({
        modelName,
      })

      return {
        success: true,
        message:
          'Model download has been queued successfully. It will start shortly after Ollama and Open WebUI are ready (if not already).',
      }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to dispatch model download for ${modelName}: ${error instanceof Error ? error.message : error}`
      )
      return {
        success: false,
        message: 'Failed to queue model download. Please try again.',
      }
    }
  }

  public async getClient() {
    await this._ensureDependencies()
    return this.ollama!
  }

  public async chat(chatRequest: ChatRequest & { stream?: boolean }) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }
    return await this.ollama.chat({
      ...chatRequest,
      stream: false,
    })
  }

  public async deleteModel(modelName: string) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }

    return await this.ollama.delete({
      model: modelName,
    })
  }

  public async getModels(includeEmbeddings = false) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }
    const response = await this.ollama.list()
    if (includeEmbeddings) {
      return response.models
    }
    // Filter out embedding models
    return response.models.filter((model) => !model.name.includes('embed'))
  }

  async getAvailableModels(
    { sort, recommendedOnly }: { sort?: 'pulls' | 'name'; recommendedOnly?: boolean } = {
      sort: 'pulls',
      recommendedOnly: false,
    }
  ): Promise<NomadOllamaModel[] | null> {
    try {
      const models = await this.retrieveAndRefreshModels(sort)
      if (!models) {
        // If we fail to get models from the API, return the fallback recommended models
        logger.warn(
          '[OllamaService] Returning fallback recommended models due to failure in fetching available models'
        )
        return FALLBACK_RECOMMENDED_OLLAMA_MODELS
      }

      if (!recommendedOnly) {
        return models
      }

      // If recommendedOnly is true, only return the first three models (if sorted by pulls, these will be the top 3)
      const sortedByPulls = sort === 'pulls' ? models : this.sortModels(models, 'pulls')
      const firstThree = sortedByPulls.slice(0, 3)

      // Only return the first tag of each of these models (should be the most lightweight variant)
      const recommendedModels = firstThree.map((model) => {
        return {
          ...model,
          tags: model.tags && model.tags.length > 0 ? [model.tags[0]] : [],
        }
      })
      return recommendedModels
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to get available models: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  private async retrieveAndRefreshModels(
    sort?: 'pulls' | 'name'
  ): Promise<NomadOllamaModel[] | null> {
    try {
      const cachedModels = await this.readModelsFromCache()
      if (cachedModels) {
        logger.info('[OllamaService] Using cached available models data')
        return this.sortModels(cachedModels, sort)
      }

      logger.info('[OllamaService] Fetching fresh available models from API')
      const response = await axios.get(NOMAD_MODELS_API_BASE_URL)
      if (!response.data || !Array.isArray(response.data.models)) {
        logger.warn(
          `[OllamaService] Invalid response format when fetching available models: ${JSON.stringify(response.data)}`
        )
        return null
      }

      const models = response.data.models as NomadOllamaModel[]

      await this.writeModelsToCache(models)
      return this.sortModels(models, sort)
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to retrieve models from Nomad API: ${
          error instanceof Error ? error.message : error
        }`
      )
      return null
    }
  }

  private async readModelsFromCache(): Promise<NomadOllamaModel[] | null> {
    try {
      const stats = await fs.stat(MODELS_CACHE_FILE)
      const cacheAge = Date.now() - stats.mtimeMs

      if (cacheAge > CACHE_MAX_AGE_MS) {
        logger.info('[OllamaService] Cache is stale, will fetch fresh data')
        return null
      }

      const cacheData = await fs.readFile(MODELS_CACHE_FILE, 'utf-8')
      const models = JSON.parse(cacheData) as NomadOllamaModel[]

      if (!Array.isArray(models)) {
        logger.warn('[OllamaService] Invalid cache format, will fetch fresh data')
        return null
      }

      return models
    } catch (error) {
      // Cache doesn't exist or is invalid
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(
          `[OllamaService] Error reading cache: ${error instanceof Error ? error.message : error}`
        )
      }
      return null
    }
  }

  private async writeModelsToCache(models: NomadOllamaModel[]): Promise<void> {
    try {
      await fs.mkdir(path.dirname(MODELS_CACHE_FILE), { recursive: true })
      await fs.writeFile(MODELS_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8')
      logger.info('[OllamaService] Successfully cached available models')
    } catch (error) {
      logger.warn(
        `[OllamaService] Failed to write models cache: ${error instanceof Error ? error.message : error}`
      )
    }
  }

  private sortModels(models: NomadOllamaModel[], sort?: 'pulls' | 'name'): NomadOllamaModel[] {
    if (sort === 'pulls') {
      // Sort by estimated pulls (it should be a string like "1.2K", "500", "4M" etc.)
      models.sort((a, b) => {
        const parsePulls = (pulls: string) => {
          const multiplier = pulls.endsWith('K')
            ? 1_000
            : pulls.endsWith('M')
              ? 1_000_000
              : pulls.endsWith('B')
                ? 1_000_000_000
                : 1
          return parseFloat(pulls) * multiplier
        }
        return parsePulls(b.estimated_pulls) - parsePulls(a.estimated_pulls)
      })
    } else if (sort === 'name') {
      models.sort((a, b) => a.name.localeCompare(b.name))
    }

    // Always sort model.tags by the size field in descending order
    // Size is a string like '75GB', '8.5GB', '2GB' etc. Smaller models first
    models.forEach((model) => {
      if (model.tags && Array.isArray(model.tags)) {
        model.tags.sort((a, b) => {
          const parseSize = (size: string) => {
            const multiplier = size.endsWith('KB')
              ? 1 / 1_000
              : size.endsWith('MB')
                ? 1 / 1_000_000
                : size.endsWith('GB')
                  ? 1
                  : size.endsWith('TB')
                    ? 1_000
                    : 0 // Unknown size format
            return parseFloat(size) * multiplier
          }
          return parseSize(a.size) - parseSize(b.size)
        })
      }
    })

    return models
  }
}
