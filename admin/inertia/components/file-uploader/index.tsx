import { forwardRef, useImperativeHandle, useState } from 'react'
import Uppy from '@uppy/core'
import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import { useUppyEvent } from '@uppy/react'
import Dashboard from '@uppy/react/dashboard'
import classNames from 'classnames'
import './index.css' // Custom styles for the uploader

interface FileUploaderProps {
  minFiles?: number // minimum number of files required
  maxFiles?: number
  maxFileSize?: number // in bytes, e.g., 10485760 for 10MB
  fileTypes?: string[] // e.g., ['image/*', 'application/pdf']
  disabled?: boolean
  onUpload: (files: FileList) => void
  className?: string
}

export interface FileUploaderRef {
  clear: () => void
}

/**
 * A drag-and-drop (or click) file upload area with customizations for
 * multiple and maximum numbers of files.
 */
const FileUploader = forwardRef<FileUploaderRef, FileUploaderProps>((props, ref) => {
  const {
    minFiles = 0,
    maxFiles = 1,
    maxFileSize = 10485760, // default to 10MB
    fileTypes,
    disabled = false,
    onUpload,
    className,
  } = props

  const [uppy] = useState(() => {
    const uppy = new Uppy({
      debug: true,
      restrictions: {
        maxFileSize: maxFileSize,
        minNumberOfFiles: minFiles,
        maxNumberOfFiles: maxFiles,
        allowedFileTypes: fileTypes || undefined,
      },
    })
    return uppy
  })

  useImperativeHandle(ref, () => ({
    clear: () => {
      uppy.clear()
    },
  }))

  useUppyEvent(uppy, 'state-update', (_, newState) => {
    const stateFiles = Object.values(newState.files)

    const dataTransfer = new DataTransfer()
    stateFiles.forEach((file) => {
      if (file.data) {
        if (file.data instanceof File) {
          dataTransfer.items.add(file.data)
        } else if (file.data instanceof Blob) {
          const newFile = new File(
            [file.data],
            file.name || `${crypto.randomUUID()}.${file.extension}`,
            {
              type: file.type,
              lastModified: new Date().getTime(),
            }
          )
          dataTransfer.items.add(newFile)
        }
      }
    })

    const fileList = dataTransfer.files
    onUpload(fileList) // Always send new file list even if empty
  })

  return (
    <Dashboard
      uppy={uppy}
      width={'100%'}
      height={'250px'}
      hideUploadButton
      disabled={disabled}
      className={classNames(className)}
    />
  )
})

FileUploader.displayName = 'FileUploader'

export default FileUploader
