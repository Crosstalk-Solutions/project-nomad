import vine from "@vinejs/vine";
import { SETTINGS_KEYS } from "../../constants/kv_store.js";
import type { KVStoreKey } from "../../types/kv_store.js";
import { CONTEXT_LADDER } from "../utils/context_window.js";

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
        case 'system.internetStatusTestUrl': {
            // Empty clears the setting (reverts to env var / built-in defaults).
            if (value === '' || value === undefined || value === null) {
                return null
            }
            if (typeof value !== 'string') {
                return 'Test URL must be a string.'
            }
            try {
                const url = new URL(value)
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    return 'Test URL must use http or https.'
                }
            } catch {
                return 'Test URL must be a valid URL (e.g. "https://example.com").'
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
        case 'ai.contextWindow': {
            // "auto" (or empty) hands sizing to ContextWindowService. An explicit
            // value is a *cap*, so it only ever lowers the resolved window — but it
            // still has to be a real ladder rung, since a value the backend can't
            // honour would silently fall back to the default and confuse the user.
            if (value === '' || value === 'auto' || value === undefined || value === null) {
                return null
            }
            const num = Number(value)
            if (!CONTEXT_LADDER.includes(num as (typeof CONTEXT_LADDER)[number])) {
                return `Context window must be "auto" or one of: ${CONTEXT_LADDER.join(', ')}.`
            }
            return null
        }
        case 'rag.minRelevance': {
            // Empty/'auto' clears the setting and reverts to RAG_MIN_FINAL_SCORE.
            // An explicit 0 is a real choice — it turns the floor off — so it is
            // deliberately not treated as "unset".
            // Trimmed first so the accepted set matches parseMinRelevance's:
            // Number('  ') is 0, which would otherwise validate as "floor off"
            // for a value the parser reads as unset.
            const raw = typeof value === 'string' ? value.trim() : value
            if (raw === '' || raw === 'auto' || raw === undefined || raw === null) {
                return null
            }
            const num = Number(raw)
            if (!Number.isFinite(num) || num < 0 || num > 1) {
                return 'Relevance threshold must be a number between 0 and 1, or empty to use the recommended default.'
            }
            return null
        }
        case 'ai.keepAlive': {
            // Ollama duration format: "10m", "1h", "30s", "-1" (forever), "0" (evict).
            if (value === '' || value === undefined || value === null) {
                return null
            }
            if (typeof value !== 'string' || !/^(-?\d+|\d+(\.\d+)?(ms|s|m|h))$/.test(value)) {
                return 'Keep-alive must be a duration like "10m", "1h", or "-1" to keep the model loaded indefinitely.'
            }
            return null
        }
        default:
            return null
    }
}