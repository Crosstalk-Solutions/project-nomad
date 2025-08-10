import drive from "@adonisjs/drive/services/main";
import { DownloadOptions, DownloadProgress, ListRemoteZimFilesResponse, RawRemoteZimFileEntry, RemoteZimFileEntry, ZimFilesEntry } from "../../types/zim.js";
import axios from "axios";
import { XMLParser } from 'fast-xml-parser'
import { isRawListRemoteZimFilesResponse, isRawRemoteZimFileEntry } from "../../util/zim.js";
import transmit from "@adonisjs/transmit/services/main";
import { Transform } from "stream";
import logger from "@adonisjs/core/services/logger";
import { DockerService } from "./docker_service.js";
import { inject } from "@adonisjs/core";

@inject()
export class ZimService {
  private activeDownloads = new Map<string, AbortController>();

  constructor(
    private dockerService: DockerService
  ) {}

  async list() {
    const disk = drive.use('fs');
    const contents = await disk.listAll('/zim')

    const files: ZimFilesEntry[] = []
    for (let item of contents.objects) {
      if (item.isFile) {
        files.push({
          type: 'file',
          key: item.key,
          name: item.name
        })
      } else {
        files.push({
          type: 'directory',
          prefix: item.prefix,
          name: item.name
        })
      }
    }

    return {
      files,
      next: contents.paginationToken
    }
  }

  async listRemote({ start, count }: { start: number, count: number }): Promise<ListRemoteZimFilesResponse> {
    const LIBRARY_BASE_URL = 'https://browse.library.kiwix.org/catalog/v2/entries'

    const res = await axios.get(LIBRARY_BASE_URL, {
      params: {
        start: start,
        count: count,
        lang: 'eng'
      },
      responseType: 'text'
    });

    const data = res.data;
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '#text',
    });
    const result = parser.parse(data);

    if (!isRawListRemoteZimFilesResponse(result)) {
      throw new Error('Invalid response format from remote library');
    }

    const filtered = result.feed.entry.filter((entry: any) => {
      return isRawRemoteZimFileEntry(entry);
    })

    const mapped: (RemoteZimFileEntry | null)[] = filtered.map((entry: RawRemoteZimFileEntry) => {
      const downloadLink = entry.link.find((link: any) => {
        return typeof link === 'object' && 'rel' in link && 'length' in link && 'href' in link && 'type' in link && link.type === 'application/x-zim'
      });

      if (!downloadLink) {
        return null
      }

      // downloadLink['href'] will end with .meta4, we need to remove that to get the actual download URL
      const download_url = downloadLink['href'].substring(0, downloadLink['href'].length - 6);
      const file_name = download_url.split('/').pop() || `${entry.title}.zim`;
      const sizeBytes = parseInt(downloadLink['length'], 10);

      return {
        id: entry.id,
        title: entry.title,
        updated: entry.updated,
        summary: entry.summary,
        size_bytes: sizeBytes || 0,
        download_url: download_url,
        author: entry.author.name,
        file_name: file_name
      }
    });

    // Filter out any null entries (those without a valid download link)
    // or files that already exist in the local storage
    const existing = await this.list();
    const existingKeys = new Set(existing.files.map(file => file.name));
    const withoutExisting = mapped.filter((entry): entry is RemoteZimFileEntry => entry !== null && !existingKeys.has(entry.file_name));

    return {
      items: withoutExisting,
      has_more: result.feed.totalResults > start,
      total_count: result.feed.totalResults,
    };
  }

  async downloadRemote(url: string, opts: DownloadOptions = {}): Promise<string> {
    if (!url.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`);
    }

    const existing = this.activeDownloads.get(url);
    if (existing) {
      throw new Error(`Download already in progress for URL ${url}`);
    }

    // Extract the filename from the URL
    const filename = url.split('/').pop() || `downloaded-${Date.now()}.zim`;
    const path = `/zim/${filename}`;

    this._runDownload(url, path, opts); // Don't await - let run in background

    return filename;
  }

  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }

  cancelDownload(url: string): boolean {
    const entry = this.activeDownloads.get(url);
    if (entry) {
      entry.abort();
      this.activeDownloads.delete(url);
      transmit.broadcast(`zim-downloads`, { url, status: 'cancelled' });
      return true;
    }
    return false;
  }

  async delete(key: string): Promise<void> {
    let fileName = key;
    if (!fileName.endsWith('.zim')) {
      fileName += '.zim';
    }

    const disk = drive.use('fs');
    const exists = await disk.exists(fileName);

    if (!exists) {
      throw new Error('not_found');
    }

    await disk.delete(fileName);
  }

  private async _runDownload(url: string, path: string, opts: DownloadOptions = {}): Promise<string> {
    try {
      const {
        max_retries = 3,
        retry_delay = 2000,
        timeout = 30000,
        onError,
      }: DownloadOptions = opts;

      let attempt = 0;
      while (attempt < max_retries) {
        try {
          const abortController = new AbortController();
          this.activeDownloads.set(url, abortController);

          await this._attemptDownload(
            url,
            path,
            abortController.signal,
            timeout,
          );

          transmit.broadcast('zim-downloads', { url, path, status: 'completed', progress: { downloaded_bytes: 0, total_bytes: 0, percentage: 100, speed: '0 B/s', time_remaining: 0 } });
          await this.dockerService.affectContainer(DockerService.KIWIX_SERVICE_NAME, 'restart').catch((error) => {
            logger.error(`Failed to restart KIWIX container:`, error); // Don't stop the download completion, just log the error.
          });

          break; // Exit loop on success
        } catch (error) {
          attempt++;

          const isAborted = error.name === 'AbortError' || error.code === 'ABORT_ERR';
          const isNetworkError = error.code === 'ECONNRESET' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT';

          onError?.(error);
          if (isAborted) {
            throw new Error(`Download aborted for URL: ${url}`);
          }

          if (attempt < max_retries && isNetworkError) {
            await this.delay(retry_delay);
            continue;
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to download ${url}:`, error);
      transmit.broadcast('zim-downloads', { url, error: error.message, status: 'failed' });
    } finally {
      this.activeDownloads.delete(url);
      return url;
    }
  }

  private async _attemptDownload(
    url: string,
    path: string,
    signal: AbortSignal,
    timeout: number,
  ): Promise<string> {
    const disk = drive.use('fs');

    // Check if partial file exists for resume
    let startByte = 0;
    let appendMode = false;

    if (await disk.exists(path)) {
      const stats = await disk.getMetaData(path);
      startByte = stats.contentLength;
      appendMode = true;
    }

    // Get file info with HEAD request first
    const headResponse = await axios.head(url, {
      signal,
      timeout
    });

    const totalBytes = parseInt(headResponse.headers['content-length'] || '0');
    const supportsRangeRequests = headResponse.headers['accept-ranges'] === 'bytes';

    // If file is already complete
    if (startByte === totalBytes && totalBytes > 0) {
      logger.info(`File ${path} is already complete`);
      return path;
    }

    // If server doesn't support range requests and we have a partial file, delete it
    if (!supportsRangeRequests && startByte > 0) {
      await disk.delete(path);
      startByte = 0;
      appendMode = false;
    }

    const headers: Record<string, string> = {};
    if (supportsRangeRequests && startByte > 0) {
      headers.Range = `bytes=${startByte}-`;
    }

    const response = await axios.get(url, {
      responseType: 'stream',
      headers,
      signal,
      timeout
    });

    if (response.status !== 200 && response.status !== 206) {
      throw new Error(`Failed to download: HTTP ${response.status}`);
    }

    return new Promise((resolve, reject) => {
      let downloadedBytes = startByte;
      let lastProgressTime = Date.now();
      let lastDownloadedBytes = startByte;

      // Progress tracking stream to monitor data flow
      const progressStream = new Transform({
        transform(chunk: Buffer, _: any, callback: Function) {
          downloadedBytes += chunk.length;
          this.push(chunk);
          callback();
        }
      });

      // Update progress every 500ms
      const progressInterval = setInterval(() => {
        this.updateProgress({
          downloadedBytes,
          totalBytes,
          lastProgressTime,
          lastDownloadedBytes,
          url
        });
      }, 500);

      // Handle errors and cleanup
      const cleanup = (error?: Error) => {
        clearInterval(progressInterval);
        progressStream.destroy();
        response.data.destroy();
        if (error) {
          reject(error);
        }
      };

      response.data.on('error', cleanup);
      progressStream.on('error', cleanup);

      signal.addEventListener('abort', () => {
        cleanup(new Error('Download aborted'));
      });

      // Pipe through progress stream and then to disk
      const sourceStream = response.data.pipe(progressStream);

      // Use disk.putStream with append mode for resumable downloads
      disk.putStream(path, sourceStream, { append: appendMode })
        .then(() => {
          clearInterval(progressInterval);
          resolve(path);
        })
        .catch(cleanup);
    });
  }

  private updateProgress({
    downloadedBytes,
    totalBytes,
    lastProgressTime,
    lastDownloadedBytes,
    url
  }: {
    downloadedBytes: number;
    totalBytes: number;
    lastProgressTime: number;
    lastDownloadedBytes: number;
    url: string;
  }) {
    const now = Date.now();
    const timeDiff = (now - lastProgressTime) / 1000;
    const bytesDiff = downloadedBytes - lastDownloadedBytes;
    const rawSpeed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
    const timeRemaining = rawSpeed > 0 ? (totalBytes - downloadedBytes) / rawSpeed : 0;
    const speed = this.formatSpeed(rawSpeed);

    const progress: DownloadProgress = {
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes,
      percentage: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
      speed,
      time_remaining: timeRemaining
    };

    transmit.broadcast('zim-downloads', { url, progress, status: "in_progress" });

    lastProgressTime = now;
    lastDownloadedBytes = downloadedBytes;
  };

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}