import axios, { AxiosInstance } from 'axios'
import { ListRemoteZimFilesResponse, ListZimFilesResponse } from '../../types/zim'
import { ServiceSlim } from '../../types/services'
import { FileEntry } from '../../types/files'
import { SystemInformationResponse, SystemUpdateStatus } from '../../types/system'
import {
  CuratedCategory,
  CuratedCollectionWithStatus,
  DownloadJobWithProgress,
  WikipediaState,
} from '../../types/downloads'
import { catchInternal } from './util'
import { NomadOllamaModel, OllamaChatRequest } from '../../types/ollama'
import { ChatResponse, ModelResponse } from 'ollama'
import BenchmarkResult from '#models/benchmark_result'
import { BenchmarkType, RunBenchmarkResponse, SubmitBenchmarkResponse, UpdateBuilderTagResponse } from '../../types/benchmark'

class API {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async affectService(service_name: string, action: 'start' | 'stop' | 'restart') {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/services/affect',
        { service_name, action }
      )
      return response.data
    })()
  }

  async deleteModel(model: string): Promise<{ success: boolean; message: string }> {
    return catchInternal(async () => {
      const response = await this.client.delete('/ollama/models', { data: { model } })
      return response.data
    })()
  }

  async downloadBaseMapAssets() {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean }>('/maps/download-base-assets')
      return response.data
    })()
  }

  async downloadMapCollection(slug: string): Promise<{
    message: string
    slug: string
    resources: string[] | null
  }> {
    return catchInternal(async () => {
      const response = await this.client.post('/maps/download-collection', { slug })
      return response.data
    })()
  }

  async downloadModel(model: string): Promise<{ success: boolean; message: string }> {
    return catchInternal(async () => {
      const response = await this.client.post('/ollama/models', { model })
      return response.data
    })()
  }

  async downloadZimCollection(slug: string): Promise<{
    message: string
    slug: string
    resources: string[] | null
  }> {
    return catchInternal(async () => {
      const response = await this.client.post('/zim/download-collection', { slug })
      return response.data
    })()
  }

  async downloadRemoteMapRegion(url: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ message: string; filename: string; url: string }>(
        '/maps/download-remote',
        { url }
      )
      return response.data
    })()
  }

  async downloadRemoteMapRegionPreflight(url: string) {
    return catchInternal(async () => {
      const response = await this.client.post<
        { filename: string; size: number } | { message: string }
      >('/maps/download-remote-preflight', { url })
      return response.data
    })()
  }

  async downloadRemoteZimFile(url: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ message: string; filename: string; url: string }>(
        '/zim/download-remote',
        { url }
      )
      return response.data
    })()
  }

  async fetchLatestMapCollections(): Promise<{ success: boolean } | undefined> {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean }>(
        '/maps/fetch-latest-collections'
      )
      return response.data
    })()
  }

  async fetchLatestZimCollections(): Promise<{ success: boolean } | undefined> {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean }>('/zim/fetch-latest-collections')
      return response.data
    })()
  }

  async forceReinstallService(service_name: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean; message: string }>(
        `/system/services/force-reinstall`,
        { service_name }
      )
      return response.data
    })()
  }

  async getInternetStatus() {
    return catchInternal(async () => {
      const response = await this.client.get<boolean>('/system/internet-status')
      return response.data
    })()
  }

  async getInstalledModels() {
    return catchInternal(async () => {
      const response = await this.client.get<ModelResponse[]>('/ollama/installed-models')
      return response.data
    })()
  }

  async getRecommendedModels(): Promise<NomadOllamaModel[] | undefined> {
    return catchInternal(async () => {
      const response = await this.client.get<NomadOllamaModel[]>('/ollama/models', {
        params: { sort: 'pulls', recommendedOnly: true },
      })
      return response.data
    })()
  }

  async sendChatMessage(chatRequest: OllamaChatRequest) {
    return catchInternal(async () => {
      const response = await this.client.post<ChatResponse>('/ollama/chat', chatRequest)
      return response.data
    })()
  }

  async getBenchmarkResults() {
    return catchInternal(async () => {
      const response = await this.client.get<BenchmarkResult[]>('/benchmark/results')
      return response.data
    })()
  }

  async getLatestBenchmarkResult() {
    return catchInternal(async () => {
      const response = await this.client.get<BenchmarkResult>('/benchmark/results/latest')
      return response.data
    })()
  }

  async getChatSessions() {
    return catchInternal(async () => {
      const response = await this.client.get<
        Array<{
          id: string
          title: string
          model: string | null
          timestamp: string
          lastMessage: string | null
        }>
      >('/chat/sessions')
      return response.data
    })()
  }

  async getChatSession(sessionId: string) {
    return catchInternal(async () => {
      const response = await this.client.get<{
        id: string
        title: string
        model: string | null
        timestamp: string
        messages: Array<{
          id: string
          role: 'system' | 'user' | 'assistant'
          content: string
          timestamp: string
        }>
      }>(`/chat/sessions/${sessionId}`)
      return response.data
    })()
  }

  async createChatSession(title: string, model?: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{
        id: string
        title: string
        model: string | null
        timestamp: string
      }>('/chat/sessions', { title, model })
      return response.data
    })()
  }

  async updateChatSession(sessionId: string, data: { title?: string; model?: string }) {
    return catchInternal(async () => {
      const response = await this.client.put<{
        id: string
        title: string
        model: string | null
        timestamp: string
      }>(`/chat/sessions/${sessionId}`, data)
      return response.data
    })()
  }

  async deleteChatSession(sessionId: string) {
    return catchInternal(async () => {
      await this.client.delete(`/chat/sessions/${sessionId}`)
    })()
  }

  async deleteAllChatSessions() {
    return catchInternal(async () => {
      const response = await this.client.delete<{ success: boolean; message: string }>(
        '/chat/sessions/all'
      )
      return response.data
    })()
  }

  async addChatMessage(sessionId: string, role: 'system' | 'user' | 'assistant', content: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{
        id: string
        role: 'system' | 'user' | 'assistant'
        content: string
        timestamp: string
      }>(`/chat/sessions/${sessionId}/messages`, { role, content })
      return response.data
    })()
  }

  async getStoredRAGFiles() {
    return catchInternal(async () => {
      const response = await this.client.get<{ files: string[] }>('/rag/files')
      return response.data.files
    })()
  }

  async getSystemInfo() {
    return catchInternal(async () => {
      const response = await this.client.get<SystemInformationResponse>('/system/info')
      return response.data
    })()
  }

  async getSystemServices() {
    return catchInternal(async () => {
      const response = await this.client.get<Array<ServiceSlim>>('/system/services')
      return response.data
    })()
  }

  async getSystemUpdateStatus() {
    return catchInternal(async () => {
      const response = await this.client.get<SystemUpdateStatus>('/system/update/status')
      return response.data
    })()
  }

  async getSystemUpdateLogs() {
    return catchInternal(async () => {
      const response = await this.client.get<{ logs: string }>('/system/update/logs')
      return response.data
    })()
  }

  async healthCheck() {
    return catchInternal(async () => {
      const response = await this.client.get<{ status: string }>('/health', {
        timeout: 5000,
      })
      return response.data
    })()
  }

  async installService(service_name: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/services/install',
        { service_name }
      )
      return response.data
    })()
  }

  async listCuratedMapCollections() {
    return catchInternal(async () => {
      const response = await this.client.get<CuratedCollectionWithStatus[]>(
        '/maps/curated-collections'
      )
      return response.data
    })()
  }

  async listCuratedZimCollections() {
    return catchInternal(async () => {
      const response = await this.client.get<CuratedCollectionWithStatus[]>(
        '/zim/curated-collections'
      )
      return response.data
    })()
  }

  async listCuratedCategories() {
    return catchInternal(async () => {
      const response = await this.client.get<CuratedCategory[]>('/easy-setup/curated-categories')
      return response.data
    })()
  }

  async saveInstalledTier(categorySlug: string, tierSlug: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean }>('/zim/save-installed-tier', {
        categorySlug,
        tierSlug,
      })
      return response.data
    })()
  }

  async listDocs() {
    return catchInternal(async () => {
      const response = await this.client.get<Array<{ title: string; slug: string }>>('/docs/list')
      return response.data
    })()
  }

  async listMapRegionFiles() {
    return catchInternal(async () => {
      const response = await this.client.get<{ files: FileEntry[] }>('/maps/regions')
      return response.data.files
    })()
  }

  async listRemoteZimFiles({
    start = 0,
    count = 12,
    query,
  }: {
    start?: number
    count?: number
    query?: string
  }) {
    return catchInternal(async () => {
      return await this.client.get<ListRemoteZimFilesResponse>('/zim/list-remote', {
        params: {
          start,
          count,
          query,
        },
      })
    })()
  }

  async listZimFiles() {
    return catchInternal(async () => {
      return await this.client.get<ListZimFilesResponse>('/zim/list')
    })()
  }

  async listDownloadJobs(filetype?: string): Promise<DownloadJobWithProgress[] | undefined> {
    return catchInternal(async () => {
      const endpoint = filetype ? `/downloads/jobs/${filetype}` : '/downloads/jobs'
      const response = await this.client.get<DownloadJobWithProgress[]>(endpoint)
      return response.data
    })()
  }

  async runBenchmark(type: BenchmarkType, sync: boolean = false) {
    return catchInternal(async () => {
      const response = await this.client.post<RunBenchmarkResponse>(
        `/benchmark/run${sync ? '?sync=true' : ''}`,
        { benchmark_type: type },
      )
      return response.data
    })()
  }

  async startSystemUpdate() {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/update'
      )
      return response.data
    })()
  }

  async submitBenchmark(benchmark_id: string, anonymous: boolean) {
    return catchInternal(async () => {
      const response = await this.client.post<SubmitBenchmarkResponse>('/benchmark/submit', { benchmark_id, anonymous })
      return response.data
    })()
  }

  async subscribeToReleaseNotes(email: string) {
    return catchInternal(async () => {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/subscribe-release-notes',
        { email }
      )
      return response.data
    })()
  }

  // Wikipedia selector methods

  async getWikipediaState(): Promise<WikipediaState | undefined> {
    return catchInternal(async () => {
      const response = await this.client.get<WikipediaState>('/zim/wikipedia')
      return response.data
    })()
  }

  async selectWikipedia(
    optionId: string
  ): Promise<{ success: boolean; jobId?: string; message?: string } | undefined> {
    return catchInternal(async () => {
      const response = await this.client.post<{
        success: boolean
        jobId?: string
        message?: string
      }>('/zim/wikipedia/select', { optionId })
      return response.data
    })()
  }

  async updateBuilderTag(benchmark_id: string, builder_tag: string) {
    return catchInternal(async () => {
      const response = await this.client.post<UpdateBuilderTagResponse>(
        '/benchmark/builder-tag',
        { benchmark_id, builder_tag }
      )
      return response.data
    })()
  }

  async uploadDocument(file: File) {
    return catchInternal(async () => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await this.client.post<{ message: string; file_path: string }>(
        '/rag/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )
      return response.data
    })()
  }
}

export default new API()
