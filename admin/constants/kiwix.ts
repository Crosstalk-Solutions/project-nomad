
export const KIWIX_LIBRARY_CMD = '--library /data/kiwix-library.xml --monitorLibrary --address=all'

/** `browse.library.kiwix.org` is Kiwix's *human* browsing host. On 2026-08-29 it grew an
* anti-crawler interstitial that answers HTTP 200 with an HTML "Please confirm..." page
* requiring JS + a cookie, so every catalog request here returned unparseable HTML.
* `parseZimEntries` swallows that as an empty feed, which reads as "no updates available"
* -- a silent, permanent stall of ZIM auto-update. `opds.library.kiwix.org` is the
* machine-facing host for the same API and is not gated; `library.kiwix.org` now 301s to
* it. Keep catalog traffic off the browse host.
*/
export const KIWIX_CATALOG_BASE_URL = 'https://opds.library.kiwix.org/catalog/v2/entries'