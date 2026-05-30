export type LocalLibraryFileType = 'pdf' | 'epub' | 'mobi' | 'text' | 'unknown'

export type LocalLibraryFile = {
  name: string
  displayName: string
  type: LocalLibraryFileType
  size: number
  modifiedTime: string
  viewUrl: string | null
  downloadUrl: string
  canPreview: boolean
  canIndex: boolean
  indexedSource: string
}

export type LocalLibraryListResponse = {
  files: LocalLibraryFile[]
}

export type LocalLibraryPreviewResponse = {
  name: string
  type: LocalLibraryFileType
  title: string
  text: string
}
