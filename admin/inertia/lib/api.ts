import axios, { AxiosInstance } from 'axios'
import { ListRemoteZimFilesResponse, ListZimFilesResponse } from '../../types/zim'
import { ServiceSlim } from '../../types/services'
import { FileEntry } from '../../types/files'
import { SystemInformationResponse } from '../../types/system'
import { CuratedCollectionWithStatus, DownloadJobWithProgress } from '../../types/downloads'
import { catchInternal } from './util'

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

  async getInternetStatus() {
    return catchInternal(async () => {
      const response = await this.client.get<boolean>('/system/internet-status')
      return response.data
    })()
  }

  async getSystemInfo() {
    return catchInternal(async () => {
      const response = await this.client.get<SystemInformationResponse>('/system/info')
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

  async listServices() {
    return catchInternal(async () => {
      const response = await this.client.get<Array<ServiceSlim>>('/system/services')
      return response.data
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
}

export default new API()
