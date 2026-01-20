import { inject } from '@adonisjs/core'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from './docker_service.js'
import axios from 'axios'
import { NomadOllamaModel, OllamaModelListing } from '../../types/ollama.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { DownloadModelJob } from '#jobs/download_model_job'

const NOMAD_MODELS_API_BASE_URL = 'https://api.projectnomad.us/api/v1/ollama/models'
const MODELS_CACHE_FILE = path.join(process.cwd(), 'storage', 'ollama-models-cache.json')
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

@inject()
export class OpenWebUIService {
  constructor(private dockerService: DockerService) {}

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
    return new Promise((resolve) => {
      try {
        const container = this.dockerService.docker.getContainer(DockerService.OLLAMA_SERVICE_NAME)
        if (!container) {
          logger.warn('[OpenWebUIService] Ollama container is not running. Cannot download model.')
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
                `[OpenWebUIService] Failed to execute model download command: ${
                  err instanceof Error ? err.message : err
                }`
              )
              resolve({ success: false, message: 'Failed to execute download command.' })
              return
            }

            if (!exec) {
              logger.error('[OpenWebUIService] No exec instance returned from exec command')
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
                    `[OpenWebUIService] Failed to start exec stream: ${
                      startErr instanceof Error ? startErr.message : startErr
                    }`
                  )
                  resolve({ success: false, message: 'Failed to start download stream.' })
                  return
                }

                if (!stream) {
                  logger.error('[OpenWebUIService] No stream returned when starting exec')
                  resolve({ success: false, message: 'No stream available.' })
                  return
                }

                // Create PassThrough streams to capture output
                const stdout = new PassThrough()
                const stderr = new PassThrough()

                // Demultiplex the Docker stream
                this.dockerService.docker.modem.demuxStream(stream, stdout, stderr)

                // Capture and parse stdout (if any)
                stdout.on('data', (chunk) => {
                  const output = chunk.toString()
                  logger.info(`[OpenWebUIService] Model download (stdout): ${output}`)
                })

                // Capture stderr - ollama sends progress/status here (not necessarily errors)
                stderr.on('data', (chunk) => {
                  const output = chunk.toString()

                  // Check if this is an actual error message
                  if (
                    output.toLowerCase().includes('error') ||
                    output.toLowerCase().includes('failed')
                  ) {
                    logger.error(`[OpenWebUIService] Model download error: ${output}`)
                  } else {
                    // This is normal progress/status output from ollama
                    logger.info(`[OpenWebUIService] Model download progress: ${output}`)

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
                              `[OpenWebUIService] ${progressData.status}: ${progressData.percent}% (${progressData.completed}/${progressData.total} bytes)`
                            )
                          } else {
                            logger.info(`[OpenWebUIService] ${progressData.status}`)
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
                    `[OpenWebUIService] Model download process ended for model "${model}"`
                  )
                  resolve({
                    success: true,
                    message: 'Model download completed successfully.',
                  })
                })

                // Handle stream errors
                stream.on('error', (streamErr) => {
                  logger.error(
                    `[OpenWebUIService] Error during model download stream: ${
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
          `[OpenWebUIService] Failed to download model "${model}": ${
            error instanceof Error ? error.message : error
          }`
        )
        resolve({ success: false, message: 'Failed to download model.' })
      }
    })
  }

  async deleteModel(model: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      try {
        const container = this.dockerService.docker.getContainer(DockerService.OLLAMA_SERVICE_NAME)
        if (!container) {
          logger.warn('[OpenWebUIService] Ollama container is not running. Cannot remove model.')
          resolve({
            success: false,
            message: 'Ollama is not running. Please start Ollama and try again.',
          })
          return
        }

        container.exec(
          {
            Cmd: ['ollama', 'rm', model],
            AttachStdout: true,
            AttachStderr: true,
          },
          (err, exec) => {
            if (err) {
              logger.error(
                `[OpenWebUIService] Failed to execute model remove command: ${
                  err instanceof Error ? err.message : err
                }`
              )
              resolve({ success: false, message: 'Failed to execute remove command.' })
              return
            }

            if (!exec) {
              logger.error('[OpenWebUIService] No exec instance returned from remove command')
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
                    `[OpenWebUIService] Failed to start exec stream for remove: ${
                      startErr instanceof Error ? startErr.message : startErr
                    }`
                  )
                  resolve({ success: false, message: 'Failed to start remove command.' })
                  return
                }

                if (!stream) {
                  logger.error('[OpenWebUIService] No stream returned for remove command')
                  resolve({ success: false, message: 'No stream available.' })
                  return
                }

                const stdout = new PassThrough()
                const stderr = new PassThrough()
                let output = ''
                let errorOutput = ''

                this.dockerService.docker.modem.demuxStream(stream, stdout, stderr)

                stdout.on('data', (chunk) => {
                  output += chunk.toString()
                })

                stderr.on('data', (chunk) => {
                  errorOutput += chunk.toString()
                })

                stream.on('end', () => {
                  if (errorOutput) {
                    logger.error(`[OpenWebUIService] Error removing model: ${errorOutput}`)
                    resolve({
                      success: false,
                      message: errorOutput.trim() || 'Failed to remove model.',
                    })
                    return
                  }

                  logger.info(`[OpenWebUIService] Successfully removed model "${model}"`)
                  if (output) {
                    logger.info(`[OpenWebUIService] Remove output: ${output}`)
                  }

                  resolve({
                    success: true,
                    message: 'Model removed successfully.',
                  })
                })

                stream.on('error', (streamErr) => {
                  logger.error(
                    `[OpenWebUIService] Stream error during model remove: ${
                      streamErr instanceof Error ? streamErr.message : streamErr
                    }`
                  )
                  resolve({
                    success: false,
                    message: 'Error occurred while removing model.',
                  })
                })
              }
            )
          }
        )
      } catch (error) {
        logger.error(
          `[OpenWebUIService] Failed to remove model "${model}": ${
            error instanceof Error ? error.message : error
          }`
        )
        resolve({ success: false, message: 'Failed to remove model.' })
      }
    })
  }

  async dispatchModelDownload(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`[OpenWebUIService] Dispatching model download for ${modelName} via job queue`)

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
        `[OpenWebUIService] Failed to dispatch model download for ${modelName}: ${error instanceof Error ? error.message : error}`
      )
      return {
        success: false,
        message: 'Failed to queue model download. Please try again.',
      }
    }
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
        return null
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
        `[OpenWebUIService] Failed to get available models: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  async getInstalledModels(): Promise<OllamaModelListing[] | null> {
    return new Promise((resolve) => {
      try {
        const container = this.dockerService.docker.getContainer(DockerService.OLLAMA_SERVICE_NAME)
        if (!container) {
          logger.warn('[OpenWebUIService] Ollama container is not running. Cannot list models.')
          resolve(null)
          return
        }

        container.exec(
          {
            Cmd: ['ollama', 'list'],
            AttachStdout: true,
            AttachStderr: true,
          },
          (err, exec) => {
            if (err) {
              logger.error(
                `[OpenWebUIService] Failed to execute ollama list command: ${
                  err instanceof Error ? err.message : err
                }`
              )
              resolve(null)
              return
            }

            if (!exec) {
              logger.error('[OpenWebUIService] No exec instance returned from ollama list')
              resolve(null)
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
                    `[OpenWebUIService] Failed to start exec stream for ollama list: ${
                      startErr instanceof Error ? startErr.message : startErr
                    }`
                  )
                  resolve(null)
                  return
                }

                if (!stream) {
                  logger.error('[OpenWebUIService] No stream returned for ollama list')
                  resolve(null)
                  return
                }

                const stdout = new PassThrough()
                const stderr = new PassThrough()
                let output = ''
                let errorOutput = ''

                this.dockerService.docker.modem.demuxStream(stream, stdout, stderr)

                stdout.on('data', (chunk) => {
                  output += chunk.toString()
                })

                stderr.on('data', (chunk) => {
                  errorOutput += chunk.toString()
                })

                stream.on('end', () => {
                  if (errorOutput) {
                    logger.error(
                      `[OpenWebUIService] Error from ollama list command: ${errorOutput}`
                    )
                  }

                  if (!output) {
                    logger.info('[OpenWebUIService] No models installed')
                    resolve([])
                    return
                  }

                  try {
                    // Parse the tabular output from ollama list
                    // Expected format:
                    // NAME                    ID              SIZE      MODIFIED
                    // llama2:latest          abc123def456    3.8 GB    2 days ago
                    const lines = output.split('\n').filter((line) => line.trim())

                    // Skip header line and parse model entries
                    const models: OllamaModelListing[] = []
                    for (let i = 1; i < lines.length; i++) {
                      const line = lines[i].trim()
                      if (!line) continue

                      // Split by whitespace (2+ spaces to handle columns with spaces)
                      const parts = line.split(/\s{2,}/)

                      if (parts.length >= 4) {
                        models.push({
                          name: parts[0].trim(),
                          id: parts[1].trim(),
                          size: parts[2].trim(),
                          modified: parts[3].trim(),
                        })
                      }
                    }

                    logger.info(`[OpenWebUIService] Found ${models.length} installed models`)
                    resolve(models)
                  } catch (parseError) {
                    logger.error(
                      `[OpenWebUIService] Failed to parse ollama list output: ${
                        parseError instanceof Error ? parseError.message : parseError
                      }`
                    )
                    logger.debug(`[OpenWebUIService] Raw output: ${output}`)
                    resolve(null)
                  }
                })

                stream.on('error', (streamErr) => {
                  logger.error(
                    `[OpenWebUIService] Stream error during ollama list: ${
                      streamErr instanceof Error ? streamErr.message : streamErr
                    }`
                  )
                  resolve(null)
                })
              }
            )
          }
        )
      } catch (error) {
        logger.error(
          `[OpenWebUIService] Failed to get installed models: ${
            error instanceof Error ? error.message : error
          }`
        )
        resolve(null)
      }
    })
  }

  private async retrieveAndRefreshModels(
    sort?: 'pulls' | 'name'
  ): Promise<NomadOllamaModel[] | null> {
    try {
      const cachedModels = await this.readModelsFromCache()
      if (cachedModels) {
        logger.info('[OpenWebUIService] Using cached available models data')
        return this.sortModels(cachedModels, sort)
      }

      logger.info('[OpenWebUIService] Fetching fresh available models from API')
      const response = await axios.get(NOMAD_MODELS_API_BASE_URL)
      if (!response.data || !Array.isArray(response.data.models)) {
        logger.warn(
          `[OpenWebUIService] Invalid response format when fetching available models: ${JSON.stringify(response.data)}`
        )
        return null
      }

      const models = response.data.models as NomadOllamaModel[]

      await this.writeModelsToCache(models)
      return this.sortModels(models, sort)
    } catch (error) {
      logger.error(
        `[OpenWebUIService] Failed to retrieve models from Nomad API: ${
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
        logger.info('[OpenWebUIService] Cache is stale, will fetch fresh data')
        return null
      }

      const cacheData = await fs.readFile(MODELS_CACHE_FILE, 'utf-8')
      const models = JSON.parse(cacheData) as NomadOllamaModel[]

      if (!Array.isArray(models)) {
        logger.warn('[OpenWebUIService] Invalid cache format, will fetch fresh data')
        return null
      }

      return models
    } catch (error) {
      // Cache doesn't exist or is invalid
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(
          `[OpenWebUIService] Error reading cache: ${error instanceof Error ? error.message : error}`
        )
      }
      return null
    }
  }

  private async writeModelsToCache(models: NomadOllamaModel[]): Promise<void> {
    try {
      await fs.mkdir(path.dirname(MODELS_CACHE_FILE), { recursive: true })
      await fs.writeFile(MODELS_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8')
      logger.info('[OpenWebUIService] Successfully cached available models')
    } catch (error) {
      logger.warn(
        `[OpenWebUIService] Failed to write models cache: ${error instanceof Error ? error.message : error}`
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
