import drive from "@adonisjs/drive/services/main";
import { ListRemoteZimFilesResponse, RawRemoteZimFileEntry, RemoteZimFileEntry, ZimFilesEntry } from "../../types/zim.js";
import axios from "axios";
import { XMLParser } from 'fast-xml-parser'
import { isRawListRemoteZimFilesResponse, isRawRemoteZimFileEntry } from "../../util/zim.js";

export class ZimService {
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

  async downloadRemote(url: string): Promise<void> {
    if (!url.endsWith('.zim')) {
      throw new Error(`Invalid ZIM file URL: ${url}. URL must end with .zim`);
    }

    const disk = drive.use('fs');
    const response = await axios.get(url, {
      responseType: 'stream'
    });

    if (response.status !== 200) {
      throw new Error(`Failed to download remote ZIM file from ${url}`);
    }

    // Extract the filename from the URL
    const filename = url.split('/').pop() || `downloaded-${Date.now()}.zim`;
    const path = `/zim/${filename}`;

    await disk.putStream(path, response.data);
  }

  async delete(key: string): Promise<void> {
    console.log('Deleting ZIM file with key:', key);
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
}