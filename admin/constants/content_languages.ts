/**
 * Languages a user can pick for *content* (curated collections, Wikipedia
 * options, Kiwix library search). This is not UI localization: the Command
 * Center stays in English, only the offered content changes.
 *
 * `code` is ISO 639-1 and names the per-language manifest directory
 * (`collections/<code>/…`). `kiwix` is the ISO 639-3 code the Kiwix OPDS
 * catalog filters on. `name` is the language's own name (an endonym), shown
 * as-is so a speaker can find it without reading English.
 */
export const CONTENT_LANGUAGES = [
  { code: 'en', kiwix: 'eng', name: 'English' },
  { code: 'fr', kiwix: 'fra', name: 'Français' },
  { code: 'de', kiwix: 'deu', name: 'Deutsch' },
  { code: 'es', kiwix: 'spa', name: 'Español' },
  { code: 'it', kiwix: 'ita', name: 'Italiano' },
  { code: 'pt', kiwix: 'por', name: 'Português' },
  { code: 'nl', kiwix: 'nld', name: 'Nederlands' },
  { code: 'pl', kiwix: 'pol', name: 'Polski' },
  { code: 'ro', kiwix: 'ron', name: 'Română' },
  { code: 'el', kiwix: 'ell', name: 'Ελληνικά' },
  { code: 'ru', kiwix: 'rus', name: 'Русский' },
  { code: 'uk', kiwix: 'ukr', name: 'Українська' },
  { code: 'tr', kiwix: 'tur', name: 'Türkçe' },
  { code: 'ar', kiwix: 'ara', name: 'العربية' },
  { code: 'he', kiwix: 'heb', name: 'עברית' },
  { code: 'fa', kiwix: 'fas', name: 'فارسی' },
  { code: 'hi', kiwix: 'hin', name: 'हिन्दी' },
  { code: 'bn', kiwix: 'ben', name: 'বাংলা' },
  { code: 'id', kiwix: 'ind', name: 'Bahasa Indonesia' },
  { code: 'vi', kiwix: 'vie', name: 'Tiếng Việt' },
  { code: 'zh', kiwix: 'zho', name: '中文' },
  { code: 'ja', kiwix: 'jpn', name: '日本語' },
  { code: 'ko', kiwix: 'kor', name: '한국어' },
] as const

export type ContentLanguageCode = (typeof CONTENT_LANGUAGES)[number]['code']

/** What every install offers until the user changes the setting. */
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguageCode = 'en'
