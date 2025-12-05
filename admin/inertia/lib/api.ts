import axios, { AxiosInstance } from 'axios'
import { ListRemoteZimFilesResponse, ListZimFilesResponse } from '../../types/zim'
import { ServiceSlim } from '../../types/services'
import { FileEntry } from '../../types/files'
import { SystemInformationResponse } from '../../types/system'
import { CuratedCollectionWithStatus } from '../../types/downloads'

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

  async listDocs() {
    try {
      const response = await this.client.get<Array<{ title: string; slug: string }>>('/docs/list')
      return response.data
    } catch (error) {
      console.error('Error listing docs:', error)
      throw error
    }
  }

  async listMapRegionFiles() {
    try {
      const response = await this.client.get<{ files: FileEntry[] }>('/maps/regions')
      return response.data.files
    } catch (error) {
      console.error('Error listing map region files:', error)
      throw error
    }
  }

  async downloadBaseMapAssets() {
    try {
      const response = await this.client.post<{ success: boolean }>('/maps/download-base-assets')
      return response.data
    } catch (error) {
      console.error('Error downloading base map assets:', error)
      throw error
    }
  }

  async downloadRemoteMapRegion(url: string) {
    try {
      const response = await this.client.post<{ message: string; filename: string; url: string }>(
        '/maps/download-remote',
        { url }
      )
      return response.data
    } catch (error) {
      console.error('Error downloading remote map region:', error)
      throw error
    }
  }

  async downloadRemoteMapRegionPreflight(url: string) {
    try {
      const response = await this.client.post<
        { filename: string; size: number } | { message: string }
      >('/maps/download-remote-preflight', { url })
      return response.data
    } catch (error) {
      console.error('Error preflighting remote map region download:', error)
      throw error
    }
  }

  async listServices() {
    try {
      const response = await this.client.get<Array<ServiceSlim>>('/system/services')
      return response.data
    } catch (error) {
      console.error('Error listing services:', error)
      throw error
    }
  }

  async installService(service_name: string) {
    try {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/services/install',
        { service_name }
      )
      return response.data
    } catch (error) {
      console.error('Error installing service:', error)
      throw error
    }
  }

  async affectService(service_name: string, action: 'start' | 'stop' | 'restart') {
    try {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/system/services/affect',
        { service_name, action }
      )
      return response.data
    } catch (error) {
      console.error('Error affecting service:', error)
      throw error
    }
  }

  async listZimFiles() {
    return await this.client.get<ListZimFilesResponse>('/zim/list')
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
    return await this.client.get<ListRemoteZimFilesResponse>('/zim/list-remote', {
      params: {
        start,
        count,
        query,
      },
    })
  }

  async listCuratedZimCollections() {
    try {
      const response = await this.client.get<CuratedCollectionWithStatus[]>(
        '/zim/curated-collections'
      )
      return response.data
    } catch (error) {
      console.error('Error listing curated ZIM collections:', error)
      throw error
    }
  }

  async listActiveZimDownloads(): Promise<string[]> {
    try {
      const response = await this.client.get<string[]>('/zim/active-downloads')
      return response.data
    } catch (error) {
      console.error('Error listing active ZIM downloads:', error)
      throw error
    }
  }

  async downloadRemoteZimFile(url: string): Promise<{
    message: string
    filename: string
    url: string
  }> {
    try {
      const response = await this.client.post('/zim/download-remote', { url })
      return response.data
    } catch (error) {
      console.error('Error downloading remote ZIM file:', error)
      throw error
    }
  }

  async downloadZimCollection(slug: string): Promise<{
    message: string
    slug: string
    resource_count: number
  }> {
    try {
      const response = await this.client.post('/zim/download-collection', { slug })
      return response.data
    } catch (error) {
      console.error('Error downloading ZIM collection:', error)
      throw error
    }
  }

  async fetchLatestZimCollections(): Promise<{ success: boolean }> {
    try {
      const response = await this.client.post<{ success: boolean }>('/zim/fetch-latest-collections')
      return response.data
    } catch (error) {
      console.error('Error fetching latest ZIM collections:', error)
      throw error
    }
  }

  async deleteZimFile(key: string) {
    try {
      const response = await this.client.delete(`/zim/${key}`)
      return response.data
    } catch (error) {
      console.error('Error deleting ZIM file:', error)
      throw error
    }
  }

  async getSystemInfo() {
    try {
      const response = await this.client.get<SystemInformationResponse>('/system/info')
      return response.data
    } catch (error) {
      console.error('Error fetching system info:', error)
      throw error
    }
  }
}

export default new API()
