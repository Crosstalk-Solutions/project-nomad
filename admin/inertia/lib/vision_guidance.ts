import type { ModelVisionCapability } from '../../types/ollama.js'

const TEMPORARY_IMAGE_NOTICE =
  'Images are sent only with this request. They are not saved and will disappear after you send them or reload this page.'

export function visionAttachmentGuidance(capability: ModelVisionCapability): string {
  if (capability === 'unsupported') {
    return 'This model cannot use images. Choose a model marked “Supports images” in Models & Settings.'
  }

  if (capability === 'unknown') {
    return `NOMAD cannot confirm whether this model accepts images. You can try an image, but the request will fail if the model is text-only. ${TEMPORARY_IMAGE_NOTICE}`
  }

  return TEMPORARY_IMAGE_NOTICE
}
