import { inject } from '@adonisjs/core'
import { chromium } from 'playwright'
import { SystemService } from './system_service.js'
import logger from '@adonisjs/core/services/logger'
import { DockerService } from './docker_service.js'
import { ServiceSlim } from '../../types/services.js'
import axios from 'axios'

@inject()
export class OpenWebUIService {
  constructor(private systemService: SystemService) {}

  async getOpenWebUIToken(): Promise<{
    token: string
    location: string
  } | null> {
    try {
      const { openWebUIService } = await this.getOpenWebUIAndOllamaServices()
      if (!openWebUIService) {
        logger.warn('[OpenWebUIService] Open WebUI service is not installed.')
        return null
      }

      const location = this.extractOpenWebUIUrl(openWebUIService)
      if (!location) {
        logger.warn('[OpenWebUIService] Could not determine Open WebUI URL.')
        return null
      }

      const browser = await chromium.launch({ headless: true })
      const context = await browser.newContext()
      const page = await context.newPage()

      try {
        await page.goto(location, { waitUntil: 'networkidle' })

        const cookies = await context.cookies()
        const tokenCookie = cookies.find((cookie) => cookie.name === 'token')
        if (tokenCookie) {
          return { token: tokenCookie.value, location }
        }

        return null
      } finally {
        await browser.close()
      }
    } catch (error) {
      logger.error(
        `[OpenWebUIService] Failed to get Open WebUI token: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  async getInstalledModels(): Promise<string[] | null> {
    try {
      const tokenData = await this.getOpenWebUIToken()
      if (!tokenData) {
        logger.warn('[OpenWebUIService] Cannot get installed models without Open WebUI token.')
        return null
      }

      const response = await axios.get(tokenData.location + '/ollama/api/tags', {
        headers: {
          Authorization: `Bearer ${tokenData.token}`,
        },
      })

      if (response.status === 200 && response.data.models && Array.isArray(response.data.models)) {
        console.log("GOT RESPONSE DATA:", response.data)
        return response.data.models as string[]
      }

      logger.warn(
        `[OpenWebUIService] Unexpected response when fetching installed models: ${response.status}`
      )
      return null
    } catch (error) {
      logger.error(
        `[OpenWebUIService] Failed to get installed models: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  private async getOpenWebUIAndOllamaServices(): Promise<{
    openWebUIService: ServiceSlim | null
    ollamaService: ServiceSlim | null
  }> {
    try {
      const services = await this.systemService.getServices({ installedOnly: true })

      const owuiContainer = services.find(
        (service) => service.service_name === DockerService.OPEN_WEBUI_SERVICE_NAME
      )
      const ollamaContainer = services.find(
        (service) => service.service_name === DockerService.OLLAMA_SERVICE_NAME
      )

      return {
        openWebUIService: owuiContainer || null,
        ollamaService: ollamaContainer || null,
      }
    } catch (error) {
      logger.error(
        `[OpenWebUIService] Failed to get Open WebUI and Ollama services: ${error instanceof Error ? error.message : error}`
      )
      return {
        openWebUIService: null,
        ollamaService: null,
      }
    }
  }

  private extractOpenWebUIUrl(service: ServiceSlim): string | null {
    const location = service.ui_location || '3000'
    if (!location || isNaN(Number(location))) {
      logger.warn(`[OpenWebUIService] Invalid Open WebUI location: ${location}`)
      return null
    }
    return `http://localhost:${location}`
  }
}
