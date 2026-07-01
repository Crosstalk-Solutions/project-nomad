import Uppy from '@uppy/core'
import Dashboard from '@uppy/react/dashboard'
import XHRUpload from '@uppy/xhr-upload'
import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import { useEffect, useRef, useState } from 'react'

interface ZimUploaderProps {
  onUploadComplete: (added: number) => void
  existingFilenames: string[]
}

export default function ZimUploader({ onUploadComplete, existingFilenames }: ZimUploaderProps) {
  const existingFilenamesRef = useRef(existingFilenames)
  useEffect(() => {
    existingFilenamesRef.current = existingFilenames
  }, [existingFilenames])

  // Keep the latest callback in a ref so the Uppy lifecycle effect below does
  // not depend on it. The parent passes a new inline function on every render,
  // and if that identity were in the effect deps, a re-render mid-upload (e.g.
  // a window-focus refetch) would tear down and `uppy.destroy()` the instance,
  // aborting the in-flight upload.
  const onUploadCompleteRef = useRef(onUploadComplete)
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete
  }, [onUploadComplete])

  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles: 5,
        allowedFileTypes: ['.zim'],
      },
      autoProceed: false,
    }).use(XHRUpload, {
      endpoint: '/api/zim/upload',
      fieldName: 'file',
      getResponseError: (responseText) => {
        try {
          const body = JSON.parse(responseText)
          if (body?.message) return new Error(body.message)
        } catch {}
        return new Error('Upload failed')
      },
    })
  )

  useEffect(() => {
    const handleFileAdded = (file: { id: string; name: string }) => {
      if (existingFilenamesRef.current.includes(file.name)) {
        uppy.removeFile(file.id)
        uppy.info('A ZIM file with that name already exists', 'error', 6000)
        return
      }

      const isWikipedia = (name: string) => name.startsWith('wikipedia_en_')
      if (isWikipedia(file.name)) {
        const alreadyQueued = uppy.getFiles().some((f) => f.id !== file.id && isWikipedia(f.name))
        if (alreadyQueued) {
          uppy.removeFile(file.id)
          uppy.info('Only one Wikipedia file can be uploaded at a time', 'error', 6000)
        }
      }
    }
    const handleComplete = (result: {
      successful: Array<{ response?: { body?: { added?: number } } }>
      failed: Array<unknown>
    }) => {
      // Uppy emits `complete` even when uploads fail or are aborted. Only treat
      // the run as a success when nothing failed — otherwise leave the uploader
      // open so the Dashboard can surface the error instead of closing it with a
      // false "Upload complete" toast.
      if (result.failed.length > 0) return
      const added = result.successful.reduce((sum, f) => sum + (f.response?.body?.added ?? 0), 0)
      onUploadCompleteRef.current(added)
    }
    uppy.on('file-added', handleFileAdded)
    uppy.on('complete', handleComplete)
    return () => {
      uppy.off('file-added', handleFileAdded)
      uppy.off('complete', handleComplete)
      uppy.destroy()
    }
  }, [uppy])

  return (
    <Dashboard
      uppy={uppy}
      width="100%"
      height={300}
      note="ZIM files only. Large files (up to 20 GB) are supported. For best results, upload from the same machine or over a stable LAN connection. Larger files should be copied directly to the storage volume"
    />
  )
}
