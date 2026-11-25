import type { FileValidationOptions, MultipartFile } from '@adonisjs/bodyparser/types'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js'
import sharp from 'sharp'

export const MAX_CHAT_IMAGES = 4
export const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_CHAT_IMAGE_PIXELS = 40_000_000
export const MAX_NORMALIZED_IMAGE_BYTES = 4 * 1024 * 1024
export const MAX_NORMALIZED_IMAGE_DIMENSION = 2048

/**
 * How the upload parser reads the `images` field: by size only. Its own
 * extension check compares case-sensitively and refuses names like
 * IMG_0001.JPG, so the extension is checked in normalizeChatImage instead.
 */
export const CHAT_IMAGE_UPLOAD_OPTIONS: Partial<FileValidationOptions> = {
  size: MAX_CHAT_IMAGE_BYTES,
}

const SUPPORTED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp'])
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])

/**
 * The extension list the parser used to check, now compared without regard to
 * case. The parser's extname is the type it read from the file's bytes when the
 * name has no extension or a lower-case one it recognizes, and the extension as
 * written otherwise, so IMG_0001.JPG arrives as "JPG". A file with no extname is
 * refused.
 */
function hasSupportedExtension(file: MultipartFile) {
  const extension = file.extname?.toLowerCase()
  return extension !== undefined && SUPPORTED_IMAGE_EXTENSIONS.has(extension)
}

export class ChatImageError extends Error {
  constructor(
    message: string,
    public readonly status: 413 | 415 | 422
  ) {
    super(message)
    this.name = 'ChatImageError'
  }
}

export type NormalizedChatImage = {
  name: string
  dataUrl: string
}

export async function normalizeChatImages(files: MultipartFile[]): Promise<NormalizedChatImage[]> {
  if (files.length > MAX_CHAT_IMAGES) {
    throw new ChatImageError(`Attach no more than ${MAX_CHAT_IMAGES} images.`, 422)
  }

  const normalized: NormalizedChatImage[] = []
  for (const file of files) {
    normalized.push(await normalizeChatImage(file))
  }
  return normalized
}

async function normalizeChatImage(file: MultipartFile): Promise<NormalizedChatImage> {
  if (!file.tmpPath) {
    throw new ChatImageError(`Could not process "${file.clientName}".`, 422)
  }
  if (file.size > MAX_CHAT_IMAGE_BYTES) {
    throw new ChatImageError(`"${file.clientName}" exceeds the 8 MB per-image limit.`, 413)
  }
  if (!file.isValid || !hasSupportedExtension(file)) {
    throw new ChatImageError(`"${file.clientName}" is not a valid image upload.`, 422)
  }

  try {
    const pipeline = sharp(file.tmpPath, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: MAX_CHAT_IMAGE_PIXELS,
    })
    const metadata = await pipeline.metadata()

    if (!metadata.format || !SUPPORTED_IMAGE_FORMATS.has(metadata.format)) {
      throw new ChatImageError(
        `"${file.clientName}" is not supported. Use JPEG, PNG, or WebP.`,
        415
      )
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new ChatImageError(`Animated images are not supported.`, 415)
    }

    const normalized = await pipeline
      .rotate()
      .resize({
        width: MAX_NORMALIZED_IMAGE_DIMENSION,
        height: MAX_NORMALIZED_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()

    if (normalized.byteLength > MAX_NORMALIZED_IMAGE_BYTES) {
      throw new ChatImageError(
        `"${file.clientName}" remains too large after image processing.`,
        413
      )
    }

    return {
      name: file.clientName,
      dataUrl: `data:image/jpeg;base64,${normalized.toString('base64')}`,
    }
  } catch (error) {
    if (error instanceof ChatImageError) throw error
    throw new ChatImageError(`"${file.clientName}" could not be decoded as an image.`, 422)
  }
}

export function attachImagesToLatestUserMessage(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  images: NormalizedChatImage[]
): ChatCompletionMessageParam[] {
  if (images.length === 0) return messages

  let latestUserIndex = -1
  messages.forEach((message, index) => {
    if (message.role === 'user') latestUserIndex = index
  })
  if (latestUserIndex < 0) {
    throw new ChatImageError('Images require a user message.', 422)
  }

  return messages.map((message, index) => {
    if (index !== latestUserIndex) return message
    return {
      role: 'user',
      content: [
        { type: 'text', text: message.content },
        ...images.map((image) => ({
          type: 'image_url' as const,
          image_url: { url: image.dataUrl },
        })),
      ],
    }
  })
}
