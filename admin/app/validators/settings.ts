import vine from "@vinejs/vine";
import { SETTINGS_KEYS } from "../../constants/kv_store.js";
import type { KVStoreKey } from "../../types/kv_store.js";

export const getSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
}))

export const updateSettingSchema = vine.compile(vine.object({
    key: vine.enum(SETTINGS_KEYS),
    value: vine.any().optional(),
}))

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Validate the *value* for keys that have format constraints beyond the generic
 * enum/any check (the generic validator only constrains the key). Returns an
 * error message string when invalid, or null when the value is acceptable.
 */
export function validateSettingValue(key: KVStoreKey, value: unknown): string | null {
    switch (key) {
        case 'autoUpdate.windowStart':
        case 'autoUpdate.windowEnd':
        case 'contentAutoUpdate.windowStart':
        case 'contentAutoUpdate.windowEnd':
            if (typeof value !== 'string' || !HHMM_PATTERN.test(value)) {
                return 'Time window values must be in 24-hour HH:MM format (e.g. "20:00").'
            }
            return null
        case 'autoUpdate.cooloffHours':
        case 'contentAutoUpdate.cooloffHours': {
            const num = Number(value)
            if (!Number.isInteger(num) || num < 0 || num > 8760) {
                return 'Cool-off must be a whole number of hours between 0 and 8760.'
            }
            return null
        }
        case 'contentAutoUpdate.maxBytesPerWindow': {
            // Per-window download budget in bytes. 0 = unlimited.
            const num = Number(value)
            if (!Number.isInteger(num) || num < 0) {
                return 'The per-window data cap must be a whole number of bytes (0 = unlimited).'
            }
            return null
        }
        default:
            return null
    }
}