# Next Release — Overview for RC/Beta Testers

This release's headline is the **automatic-update trilogy** finally coming together, plus a batch of reliability fixes for updates, content management, the Knowledge Base, and maps. A lot of this cycle was hardening real-world failure modes reported by the community.

## Headline: Auto-Update Trilogy is complete

NOMAD can now keep itself current at three layers, each **opt-in and off by default**:

1. **Core / Admin** — already shipped previously.
2. **Installed Apps (Supply Depot)** — *new this release.* Hands-off minor/patch updates for sibling-container apps.
3. **Installed Content (ZIM + Maps)** — *new this release.* Opt-in updater for Kiwix ZIM files and PMTiles maps.

Key design points testers should understand:
- **App updates use a two-level opt-in**: a global master switch (Settings → Updates) **and** a per-app toggle (Supply Depot). Both must be on. This is deliberate — third-party app images are outside our control, so each app's auto-update requires an explicit choice.
- **Content updates are separate on purpose**: they run on their own overnight window and bandwidth cap because ZIM downloads are multi-GB. The UI strongly recommends setting a cap.
- **Major versions are never auto-applied.** Only minor/patch.
- Both features have **failure backoff / self-disable** so a misbehaving upstream can't loop forever, and **pre-flight checks** (disk space, no downloads in progress) gate every run.
- When content auto-updates replace a ZIM, the **AI Knowledge Base mirrors the prior indexed state** (re-indexes if it was indexed, leaves it alone if not).

## Update reliability fixes (these unblock the above)
- **Update checks no longer crash on high-tag-count images** (Ollama, Filebrowser had >1000 tags). Previously Ollama appeared "stuck" at an old version because the check failed before evaluating newer tags.
- **Failed service updates now roll back** to the previous container instead of leaving the service down — and no longer wedge on retry.
- **The Update button now disables + shows "Updating..."** during in-flight updates and survives a page reload, preventing double-click races.
- **Port-conflict errors are now human-readable** (e.g. a native Ollama already on :11434 now gives you the exact fix commands).
- **App cards now show the installed version** and a much more visible orange "Update available" pill.

## Knowledge Base / AI Assistant
- **Embed retry storm fixed**: oversized chunks are truncated-and-retried instead of silently dropped and re-embedded 30× (the "pegged GPU / api/embed for weeks" issue).
- **ZIM ingestion progress no longer freezes at 99%** on multi-page archives (iFixit).
- **Accurate embedded-chunk counts** across batched ZIM ingestion.
- **No more false "ingestion stalled" warnings** on link-out/PDF-heavy ZIMs that legitimately have little text.
- **Chat suggestions** now use your selected model (or the smallest installed), so a too-large flagship model can't hang the chat page.

## Maps
- **View persists across refresh** (position + zoom).
- **Duplicate region files no longer blank the entire map**; broken installs self-recover on next load.

## Content management
- **Superseded curated files are now cleaned up** when a newer version installs (no more silent multi-GB orphan accumulation), behind strict safety rails so sideloaded files are never touched.
- **Curated Wikipedia-themed ZIMs no longer get wiped on restart.**

## Storage / Install / System / Security
- **Relocating the admin storage volume now moves child apps with it** (Kiwix no longer comes up empty after moving storage to another disk).
- **Kiwix self-heals a missing/corrupt library file on startup.**
- **Failed Docker image pulls are now treated as failures** instead of proceeding with a partial image.
- **False "No internet connection" reports fixed** on networks that block Cloudflare 1.1.1.1.
- **Install script hardened** (non-interactive NVIDIA GPG step, download retries).
- **SSRF / private-URL guard hardened** with proper IP-range classification and host normalization.
- **New `REDIS_DB` env var** to pick a Redis logical database (homelab shared-Redis scenarios).

## Also
- License metadata corrected to Apache-2.0; README link/typo fixes.
- Dependency bumps: React / React DOM, autoprefixer, BullMQ 5.77.6.

## Honesty notes for testers
Several fixes were verified by logic/typecheck and unit tests but flagged for **live validation on a real NOMAD host** by their authors — particularly: dense-ZIM embedding (no retry storm), multi-page ZIM progress, superseded-file cleanup (two-version install), storage relocation on a moved-disk box, and the post-#999 update-check flow. These are good targets for hands-on testing.
