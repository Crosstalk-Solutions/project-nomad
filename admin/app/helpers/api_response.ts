import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

/**
 * Standardized API response helpers.
 *
 * Success responses follow the shape `{ success: true, data?: ..., message?: ... }`.
 * Error responses follow the shape `{ success: false, error: '...' }`.
 *
 * Internal error details are logged server-side and never leaked to the client.
 */

export function apiSuccess(data?: Record<string, unknown> | unknown[] | string) {
  if (typeof data === 'string') {
    return { success: true, message: data }
  }
  return { success: true, ...(data && typeof data === 'object' ? (Array.isArray(data) ? { data } : data) : {}) }
}

export function apiError(
  response: HttpContext['response'],
  status: number,
  clientMessage: string,
  internalError?: unknown
) {
  if (internalError) {
    const detail = internalError instanceof Error ? internalError.message : String(internalError)
    logger.error(`[API] ${clientMessage}: ${detail}`)
  }
  return response.status(status).send({ success: false, error: clientMessage })
}
