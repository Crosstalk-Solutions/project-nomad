# Release Notes

## Unreleased

### Features
- **Supply Depot — Custom Apps**: The Supply Depot is NOMAD's new home for installable apps, and it now lets you run your *own* custom Docker containers — not just the curated catalog. Specify an image, port mappings, volume binds, environment variables, and memory/CPU limits, and NOMAD spins it up as a managed sibling container. A live, debounced pre-flight check warns about port conflicts and resource limits as you type and hard-blocks unsafe configurations, with an "install anyway" override for warning-only cases (e.g. an untrusted registry or a `:latest` tag). Installed custom apps can be edited, updated (re-pull latest + recreate with a safe rollback if the new container fails), and removed (optionally deleting the image), and every installed app — curated or custom — gets per-container **Logs** and **Stats** modals. Host-path binds are hardened against escapes and logs/stats are scoped to NOMAD-managed containers only. Thanks @jakeaturner for the contribution!
- **Supply Depot — Curated App Onboarding & Fixes**: Each curated app now ships with NOMAD-specific getting-started docs (first run, default logins, where data lives, what does and doesn't work offline), deep-linked from a **Manage › Docs** item on the card. Alongside it is a round of install fixes so the nine documented apps — Stirling PDF, File Browser, Calibre-Web, IT Tools, Excalidraw, Homebox, Vaultwarden, Jellyfin, Meshtastic Web — work out of the box: seeded logins instead of random passwords buried in logs, a bundled Calibre library, HTTPS-by-default where the app requires a secure context (Vaultwarden), corrected internal ports (Meshtastic Web), pre-created media folders (Jellyfin), and a swap to a maintained image (Homebox). You can now also **edit curated apps**, not just custom ones — edits are merged into the app's existing config (preserving advanced settings like GPU device requests) and flag the app so the seeder stops overwriting it, while untouched apps still receive catalog updates. Thanks @chriscrosstalk for the contribution!
- **Automatic Core Updates**: NOMAD's own admin/core image can now update itself hands-off, gated by layered safety checks. It's opt-in and off by default, runs only inside a user-configured time window, and applies only same-major, strictly-newer GA releases (major bumps stay manual) past a configurable cool-off — behind pre-flight checks for the update sidecar, no in-flight updates/downloads/installs, and sufficient host disk. It auto-disables after repeated genuine failures, while transient offline release lookups are treated as harmless skips. Settings → Updates exposes the toggle, window, cool-off, and live status. This is the first leg of the auto-update trilogy. Thanks @jakeaturner for the contribution!
- **Automatic App Updates**: Installed apps (the "Supply Depot" sibling containers) can now keep themselves up to date with opt-in, hands-off minor/patch updates, mirroring the core auto-update feature. Updates are gated behind a two-level opt-in — a global master switch in Settings → Updates **and** a per-app toggle in the Supply Depot — and respect the shared update window, cool-off period, disk/in-progress pre-flight checks, and per-app failure backoff. Major versions are never auto-applied. Thanks @jakeaturner for the contribution!
- **Automatic Content Updates**: Completing the auto-update trilogy, installed Kiwix ZIM files and PMTiles maps can now update themselves on an opt-in basis. Content updates run on their own dedicated overnight window and bandwidth cap (separate from the app/core schedule, since content downloads are multi-GB), check the upstream Kiwix and PMTiles catalogs directly (no more reliance on external Project N.O.M.A.D. API), and keep the AI Knowledge Base in sync when a ZIM is replaced. Thanks @jakeaturner for the contribution!
- **Supply Depot — Custom Launch URLs**: You can now override an app's "Open" link with a reverse-proxy or local-DNS address (e.g. `https://jellyfin.myhomelab.net`). The override is stored separately so the default link is always recoverable, survives reseeds/upgrades, and is validated on both client and server. Thanks @jakeaturner for the contribution!
- **Supply Depot — Version & Update visibility**: App cards now show the installed version next to the app name (e.g. `Kiwix · 3.7.0`), and the "Update available" pill now stands out with a solid desert-orange fill so available updates actually draw the eye. Thanks @chriscrosstalk for the contribution!
- **Maps — Persistent View**: The Maps page now remembers your position and zoom across refreshes instead of resetting to the default US-wide view. The saved view is bounds-checked, so a corrupt value safely falls back to the default. Thanks @chriscrosstalk for the contribution!
- **Content Manager — Rescan Library**: A new "Rescan Library" button rebuilds the Kiwix index from the ZIM files currently on disk, so files **sideloaded** outside NOMAD's download flow (USB stick, SSH, network share) can be served without dropping to a terminal. It reports how many new books were found and, in library mode, hot-reloads without a container restart. Thanks @chriscrosstalk for the contribution!
- **Configuration — Redis database selection**: Added a `REDIS_DB` environment variable so operators can pick a Redis logical database (0–15) for the job queue and live-update transport. This prevents key collisions when a single Redis instance is shared across multiple stacks (common in homelabs). Defaults to db 0, preserving existing behavior. Thanks @johno10661 for the contribution!
- **Advanced Settings — Internet Test URL**: Added a new Advanced Settings page with an option to override the default internet test "beacon" URL (more advanced settings to come). Previously, overriding this URL required an ENV variable change and container restart. The legacy ENV variable is still respected if you've set it. Thanks @jakeaturner for the contribution!
- **RAG**: Embedding jobs can now be cancelled, allowing users to clear stuck jobs that haven't explicitly failed. Thanks @jakeaturner for the contribution!

### Bug Fixes
- **Storage**: When the admin storage volume is relocated to another disk, child apps (Kiwix, Ollama, Qdrant, Flatnotes, Kolibri) now automatically follow to the new location instead of mounting the old, empty path. The host storage root is now derived from the admin's actual mount, with an explicit `NOMAD_STORAGE_PATH` override and clearer compose comments. Thanks @chriscrosstalk for the fix!
- **System**: A failed service update now rolls back to the previous container if the new one fails to start, so the service stays up on the old version instead of being left down. Also clears any stale leftover container so a retry can't wedge indefinitely. Thanks @chriscrosstalk for the fix!
- **System**: Service install failures caused by a host port conflict (commonly a native Ollama install already on port 11434) now show a clear, actionable message with the exact commands to resolve it, instead of a raw Docker error. Thanks @chriscrosstalk for the fix!
- **System**: The per-service Update button is now disabled and shows "Updating..." while an update is in flight, preventing double-clicks that previously raced into Docker errors. The in-progress state is durable, so it survives a page reload during a multi-GB pull. Thanks @chriscrosstalk for the fix!
- **System Updates**: Update checks no longer crash for images with more than 1,000 tags (e.g Ollama). Registry pagination URLs are now resolved correctly, so the "Check for Updates" flow returns versions instead of failing silently — fixing Ollama appearing pinned at an old version. Thanks @chriscrosstalk for the fix!
- **System**: Internet status checks no longer report "No internet connection" on networks that block or hijack Cloudflare's 1.1.1.1. The check now probes additional hosts the app already contacts (GitHub and the Project N.O.M.A.D. API) in parallel and accepts any HTTP response as "online." Thanks @akashsalan for the fix!
- **AI Assistant**: Oversized embedding chunks are now truncated and retried instead of being silently dropped, ending the retry storm that could peg the GPU and flood logs (the "api/embed for weeks" issue). The OpenAI-compatible fallback path now also passes context and truncation settings. Thanks @chriscrosstalk for the fix!
- **AI Assistant**: Chat suggestions now use your selected model (falling back to the *smallest* installed model) instead of the largest. This prevents a flagship model that exceeds available VRAM from hanging the chat page and returning a 500 error. Thanks @johno10661 for the fix!
- **AI Assistant**: The assistant no longer disclaims "Sorry, I couldn't find specific context regarding X..." when relevant material was actually retrieved. The RAG prompt now treats retrieved context as the authoritative source and falls back to general knowledge silently, the model-visible relevance scores that primed smaller models to distrust correct context were replaced with neutral source-title labels, and a conservative heading-match boost improves the ranking of already-retrieved chunks. Thanks @jakeaturner for the fix!
- **Knowledge Base**: The embedded-chunk count for batched ZIM ingestion is now persisted accurately across continuation batches, instead of reporting only the final batch's count. Thanks @Metbcy for the fix!
- **Knowledge Base**: The "ingestion may have stalled" (partial-stall) warning no longer fires falsely on link-out- or PDF-heavy ZIMs that legitimately have little embeddable text. Thanks @chriscrosstalk for the fix!
- **Knowledge Base**: ZIM ingestion progress no longer freezes at 99% on multi-page archives (e.g. iFixit). Progress now creeps forward monotonically and only reports 100% on the genuinely final batch. Thanks @chriscrosstalk for the fix!
- **Content**: Installing a newer version of a curated map or ZIM now removes the superseded file from disk, preventing silent accumulation of orphaned content (potentially hundreds of GB). Deletion is gated behind strict safety rails — only tracked, genuinely-replaced, strictly-newer files within the content store are ever removed; sideloaded files are never touched. Thanks @chriscrosstalk for the fix!
- **Content**: Curated Wikipedia-themed ZIMs (e.g. `wikipedia_en_medicine_maxi` from Medicine → Comprehensive) are no longer wiped on restart. Reconciliation now skips only the single file actually managed by the Wikipedia selector, matched by exact filename. Thanks @chriscrosstalk for the fix!
- **Maps**: Having both an old and new copy of the same map region on disk no longer blanks the entire map. Map sources are now de-duplicated to the newest file per region, and already-broken installs recover automatically on the next page load. Thanks @chriscrosstalk for the fix!
- **Information Library (Kiwix)**: Kiwix now self-heals a missing or corrupt library file on startup by rebuilding it from the ZIM files on disk, instead of coming up with an empty library and no path to recovery. Thanks @chriscrosstalk for the fix!
- **Docker**: Failed image pulls (dropped/metered connection, bad manifest, disk full mid-pull) are now correctly treated as failures across all pull paths, instead of proceeding to create a container from a missing or partial image and surfacing a confusing downstream error. Thanks @chriscrosstalk for the fix!
- **Security**: Hardened the private-URL/SSRF guard by replacing the regex blocklist with proper IP-range classification (`ipaddr.js`) and normalizing the host first. This blocks alternate IP encodings and trailing-dot bypasses (e.g. `localhost.`) while no longer over-blocking legitimate public addresses. RFC1918 ranges and bare LAN hostnames remain allowed for local appliances. Thanks @chriscrosstalk for the fix!
- **Install**: Hardened the install script — the NVIDIA toolkit GPG step now runs non-interactively so it doesn't silently skip on non-TTY installs, and helper-script downloads now retry to reduce transient partial-install failures. Thanks @Gujiassh for the fix!

### Improvements
- **License & Docs**: Corrected the package license metadata to `Apache-2.0` (the project has been Apache-2.0 for some time), added a real project description, and fixed a dead Troubleshooting link plus several README typos. Thanks @aqilaziz for the contribution!
- **Docs**: Fixed a few typos and punctuation in the README. Thanks @teccdev for the contribution!
- **Dependencies**: Bumped React and React DOM. Thanks @jakeaturner for the contribution!
- **Dependencies**: Bumped autoprefixer. Thanks @jakeaturner for the contribution!
- **Dependencies**: Bumped BullMQ to 5.77.6 and updated affected job calls to the new arguments shape. Thanks @jakeaturner for the contribution!
- **Supply Depot**: Pinned all curated image versions to ensure consistent baseline deployments. Thanks @jakeaturner for the contribution!
- **Supply Depot**: Bumped the default versions of CyberChef to 10.24.0 and Ollama to 0.24.0. Thanks @jakeaturner for the contribution!

## Version 1.32.1 - May 27, 2026

### Features

### Bug Fixes
- fix(logging): also write production logs to stdout for docker visibility (#870). Thanks @chriscrosstalk for the contribution!
- fix(KB): cursor on Always/Manual ingest policy buttons (#927). Thanks @chriscrosstalk for the contribution!

### Improvements
- perf(KB): swap Qdrant full-scroll for facet on source enumeration (#928). Thanks @chriscrosstalk for the contribution!
- chore(deps): bump various dependencies. Thanks @jakeaturner for the contribution!

## Version 1.32.0 - May 20, 2026

### Features
- **AI:** improved AMD GPU acceleration for Ollama via ROCm + HSA override (#804)
- **chat:** confirm-on-switch + one-chat-model-at-a-time enforcement (#ffa70a5)
- **content-manager:** add sortable file size column (#698), closes #685
- **content-updates:** show size, surface downloads in Active Downloads (#299b767)
- **Content:** custom ZIM library sources with pre-seeded mirrors (#593) (#62e75fd), closes #576
- **easy-setup:** split AI into its own conditional step (issue #905) (#0617d54), closes #907
- **GPU:** auto-remediate nomad_ollama passthrough loss on admin boot (#755) (#2997637), closes #208 #804
- **KB:** Always/Manual ingest policy toggle (RFC #883 §1/§4) (#894) (#8eb8809), closes #880 #886 #886 #886 #888 #888 #888 #888 #888
- **KB:** conditional warnings A + B on Stored Files (RFC #883 §6) (#563f86a), closes #891 #891 #890 #881
- **KB:** first-chat JIT prompt for ingest policy (RFC #883 Phase 3 task 12) (#fd153b4), closes #894 #894 #894
- **KB:** group admin docs into single row in Stored Files (RFC #883 §9) (#c64ec97)
- **KB:** guardrail modal at 50GB / 10%-free thresholds (RFC #883 §7) (#cf3a924), closes #897 #897 #894 #899
- **KB:** per-file ingest action + state indicator on Stored Files (RFC #883 §5) (#d850cb9), closes #907 #907 #907 #908
- **KB:** per-file ingest state machine (Phase 1 of RFC #883) (#888) (#743549c), closes #880 #886 #886 #886
- **KB:** ratio registry for disk + time estimates (Phase 1B of RFC #883) (#159d57b)
- **KB:** status pill + last-activity timestamp on Processing Queue (RFC #883 §5/§10) (#43ca584)
- **KB:** surface embedding-disk estimate in curated tier-change modal (RFC #883 §1) (#e68c753), closes #891 #891
- **KB:** wizard AI policy step (RFC #883 Phase 3 task 13) (#7a681d0), closes #899 #894 #894 #899
- **Maps:** regional map downloads via go-pmtiles extract (#780) (#94059b0)
- **maps:** show map coordinates on mouse move (#786) (#08838b1)

### Bug Fixes
- **AI:** add truncation DEBUG log (#e3b758f)
- **AI:** improve remote Ollama url validation to prevent SSRF vulnerability (#989a401)
- **AI:** pre-cap embed input + log fallback reason (#881) (#2dec5bf), closes #369 #670
- **AI:** preserve semver tag in DB on AMD Ollama updates (#019a5a4)
- **AI:** rewrite RAG query on first follow-up (off-by-one in skip-rewrite threshold) (#43645e4)
- **AI:** vendor-aware AMD HSA override + benchmark discrete-GPU detection (#a2e2f7f), closes #804 #804 #810
- **API:** accept notes, marker_type, and position on markers endpoints (#770) (#132ec9c), closes #768
- **API:** skip compression for Server-Sent Events (#798) (#4b21ea6)
- **content:** show selected tier on cards while downloads are in flight (#059cf2a), closes #36b6d8e
- **DockerService:** improve volume logic and documentation in forceReinstall (#501860a)
- **Downloads:** treat missing Content-Type as octet-stream (#848) (#3abf338)
- **install:** warn loudly on non-x86_64 architectures before pulling images (#797) (#cb129d2), closes #419
- **KB:** add re-embed and reset & rebuild opts to fix broken embeddings (#886) (#4c21196)
- **KB:** align chunks_per_mb column type with TS contract (#4d6b140)
- **KB:** blank-screen on panel open + tooltips on bulk-action buttons (#633a3c3), closes #892 #895 #post-#892
- **KB:** guardrail bypass during estimate load + Transition sibling (PR #901 review) (#7e768f3)
- **KB:** remove redundant Refresh button from Processing Queue (#4e8cadd), closes #893
- **KB:** respect Manual ingest policy on post-download dispatch (#a5fe52f), closes #909
- **KB:** silent maybe-later error + redundant prompt-state refetches (PR #899 review) (#9a684a5)
- **KB:** surface file-warning compute failures instead of masking as healthy (PR #895 review) (#a0047c1)
- **KB:** TierSelectionModal hook order + register IconLibrary (#6e5284e), closes #915
- **KB:** union Stored Files list with state-machine file paths (#898) (#8ed0bdf), closes #886 #888 #888
- **Maps:** render notes in marker popup when populated (#f41027c), closes #770
- **Maps:** send filename instead of full path to delete endpoint (#6a68bac)
- **models:** correct inverted belongsTo keys on ChatMessage.session (#921) (#82f67de)
- **queue:** singleton QueueService to stop ioredis connection leak (#ba53702), closes #872
- **RAG:** add start button in kb modal and ensure restart policy exists (#700) (#2d8a02f)
- **RAG:** anchor continuation-batch initial progress to overall-file frame (#889) (#f304d80)
- **RAG:** pace continuation batches when embedding is CPU-only (#a22c640)
- **RAG:** pass num_ctx and truncate to Ollama embed call (#763) (#7bebedc), closes #756 #369 #670
- **RAG:** report ZIM ingestion progress in overall-file frame (#d28eb9b)
- **RAG:** unbreak multi-batch ZIM ingestion (jobId dedupe) (#74cef75)
- **security:** canonicalize hostnames to block IPv4-mapped IPv6 IMDS bypass (#736c9bd)
- **security:** match IPv6 SSRF patterns against unbracketed hostnames (#b3dac9b)
- **System:** correct AMD VRAM in Graphics card + harden log probe (#d2f2172), closes #835 #850 #208
- **System:** correct NVIDIA VRAM in Graphics card (#835) (#6c799dd), closes #804
- **System:** self-heal stale updateAvailable flag after sidecar-driven update (#825) (#318276c)
- **System:** validate StartedAt with fallback to tail:500 (PR review) (#662a6c4)
- **UI:** Country Picker UX polish + auto-refresh stored files (#817) (#8c06b5b), closes #780
- **UI:** four fixes for the System Update page (#827) (#3a2e92a)
- **UI:** improve global map banner display logic (#702) (#5517e82)
- **UI:** wire map file delete confirmation to API (#732) (#e561ce8)
- **ZIM:** preserve co-existing Wikipedia corpora on cleanup (#884) (#5e2c599)

### Improvements

## Version 1.31.1 - April 21, 2026

### Features
- feat(content): custom ZIM library sources with pre-seeded mirrors (#593). Thanks @chriscrosstalk!
- feat(content-manager): add sortable file size column (#698). Thanks @chriscrosstalk!
- feat(ai-chat): allow cancelling in-progress model downloads (#701). Thanks @chriscrosstalk!
- feat(content-updates): show size, surface downloads in Active Downloads (#773). Thanks @chriscrosstalk!
- feat(maps): regional map downloads via go-pmtiles extract (#780). Thanks @bgauger!
- feat(maps): show map coordinates on mouse move (#786). Thanks @kennethbrewer3!
- feat(AI): re-enable AMD GPU acceleration for Ollama via ROCm + HSA override (#804). Thanks @chriscrosstalk!
- feat(GPU): auto-remediate nomad_ollama passthrough loss on admin boot (#878). Thanks @chriscrosstalk!
- feat(KB): per-file ingest state machine (Phase 1 of RFC #883) (#888). Thanks @chriscrosstalk!
- feat(KB): ratio registry for disk + time estimates (Phase 1B of RFC #883) (#891). Thanks @chriscrosstalk!
- feat(KB): group admin docs into single row in Stored Files (§9) (#892). Thanks @chriscrosstalk!
- feat(KB): status pill + last-activity on Processing Queue (§5/§10) (#893). Thanks @chriscrosstalk!
- feat(KB): Always/Manual ingest policy toggle (§1/§4) (#894). Thanks @chriscrosstalk!
- feat(KB): conditional warnings A + B on Stored Files (§6) (#895). Thanks @chriscrosstalk!
- feat(KB): surface embedding-disk estimate in curated tier-change modal (§1) (#897). Thanks @chriscrosstalk!
- feat(KB): first-chat JIT prompt for ingest policy (Phase 3 task 12) (#899). Thanks @chriscrosstalk!
- feat(KB): wizard AI policy step (Phase 3 task 13) (#900). Thanks @chriscrosstalk!
- feat(KB): guardrail modal at 50GB / 10%-free thresholds (§7) (#901). Thanks @chriscrosstalk!
- feat(easy-setup): split AI into its own conditional step (#908). Thanks @chriscrosstalk!
- feat(KB): per-file ingest action + state indicator on Stored Files (§5) (#909). Thanks @chriscrosstalk!
- feat(chat): confirm-on-switch + one-chat-model-at-a-time enforcement (#916). Thanks @chriscrosstalk!

### Bug Fixes
- fix(downloads): stage downloads to .tmp to prevent Kiwix loading partial files (#448). Thanks @artbird309!
- fix(security): close remaining security audit items 3 & 4 (CWE-918, CWE-209) (#552). Thanks @LuisMIguelFurlanettoSousa!
- fix(ai-chat): add null check to model name (#645). Thanks @hestela!
- fix(ai-chat): qwen2.5 loading on every chat message (#649). Thanks @hestela!
- fix(disk-collector): fix storage reporting for NFS mounts (#686). Thanks @bgauger!
- fix(rag): add start button in kb modal and ensure restart policy exists (#700). Thanks @hestela!
- fix(admin): only hide global map banner after download (#702). Thanks @Gujiassh!
- fix(maps): wire delete confirmation to API (#732). Thanks @cuyua9!
- fix: prevent ZIM corrupt file crash and deduplicate Ollama download logs (#741). Thanks @jakeaturner!
- fix(ai): stop local nomad_ollama when remote Ollama is configured (#744). Thanks @chriscrosstalk!
- fix(rag): repair ZIM embedding pipeline (sync filter, batch gate, DOM walk) (#745). Thanks @chriscrosstalk!
- fix(zim): accumulate across Kiwix pages to prevent empty Content Explorer (#746). Thanks @chriscrosstalk!
- fix(qdrant): disable anonymous telemetry by default (#747). Thanks @chriscrosstalk!
- fix(disk-display): gate NAS Storage label on network filesystem type (#749). Thanks @bgauger!
- fix(docker): write /app/version.json from VERSION build-arg (#754). Thanks @chriscrosstalk!
- fix(rag): pass num_ctx and truncate to Ollama embed call (#763). Thanks @chriscrosstalk!
- fix(api): accept notes, marker_type, and position on markers endpoints (#770). Thanks @jrsphoto!
- fix(install): warn loudly on non-x86_64 architectures before pulling images (#797). Thanks @chriscrosstalk!
- fix(stream): skip compression for Server-Sent Events (#798). Thanks @chriscrosstalk!
- fix(maps): Country Picker UX polish + auto-refresh stored files (#817). Thanks @chriscrosstalk!
- fix(System): self-heal stale updateAvailable flag after sidecar-driven update (#825). Thanks @jakeaturner!
- fix(settings/update): four UI/UX fixes for the System Update page (#827). Thanks @chriscrosstalk!
- fix(Maps): send filename instead of full path to delete endpoint (#829). Thanks @bgauger!
- fix(Maps): render notes in marker popup when populated (#830). Thanks @chriscrosstalk!
- fix(AI): vendor-aware AMD HSA override + benchmark discrete-GPU detection (#832). Thanks @chriscrosstalk!
- fix(System): correct NVIDIA VRAM in Graphics card (#850). Thanks @bgauger!
- fix(Downloads): treat missing Content-Type as octet-stream (#859). Thanks @bgauger!
- fix(AI): preserve semver tag in DB on AMD Ollama updates (#868). Thanks @chriscrosstalk!
- fix(AI): rewrite RAG query on first chat follow-up (#869). Thanks @chriscrosstalk!
- fix(RAG): unbreak multi-batch ZIM ingestion (jobId dedupe) (#872). Thanks @chriscrosstalk!
- fix(RAG): pace continuation batches when embedding is CPU-only (#873). Thanks @chriscrosstalk!
- fix(queue): singleton QueueService to stop ioredis connection leak (#877). Thanks @chriscrosstalk!
- fix(System): correct AMD VRAM in Graphics card + harden log probe (#879). Thanks @chriscrosstalk!
- fix(RAG): report ZIM ingestion progress in overall-file frame (#880). Thanks @chriscrosstalk!
- fix(KB): add re-embed and reset & rebuild options to fix broken embeddings (#886). Thanks @jakeaturner!
- fix(ZIM): preserve co-existing Wikipedia corpora on cleanup (#887). Thanks @chriscrosstalk!
- fix(RAG): anchor continuation-batch initial progress to overall-file frame (#889). Thanks @chriscrosstalk!
- fix(AI): pre-cap embed input + log fallback reason (#890). Thanks @chriscrosstalk!
- fix(KB): remove redundant Refresh button from Processing Queue (#896). Thanks @chriscrosstalk!
- fix(KB): union Stored Files list with state-machine file paths (#898). Thanks @chriscrosstalk!
- fix(KB): blank-screen on panel open + tooltips on bulk-action buttons (#907). Thanks @chriscrosstalk!
- fix(KB): TierSelectionModal hook order + register IconLibrary (#917). Thanks @chriscrosstalk!
- fix(content): show selected tier on cards while downloads are in flight (#918). Thanks @chriscrosstalk!
- fix(KB): respect Manual ingest policy on post-download dispatch (#919). Thanks @chriscrosstalk!
- fix(AI): improve remote Ollama url validation to prevent SSRF vuln (#920). Thanks @jakeaturner!
- fix(models): correct inverted belongsTo keys on ChatMessage.session (#921). Thanks @jakeaturner!

### Improvements
- docs: add Community Add-Ons page with field manuals + W3Schools packs (#753). Thanks @chriscrosstalk!
- docs: add map marker API reference (#783). Thanks @kennethbrewer3!
- docs: require linked issue for non-trivial PRs (#799). Thanks @chriscrosstalk!
- docs(map): updated notes on the map pin api (#803). Thanks @kennethbrewer3!
- docs: link to new WSL2 install guide from README and FAQ (#811). Thanks @chriscrosstalk!
- build(deps): bump picomatch in /admin (#544). Thanks @dependabot[bot]!
- build(deps): bump lodash from 4.17.23 to 4.18.1 in /admin (#643). Thanks @dependabot[bot]!
- build(deps-dev): bump vite from 6.4.1 to 6.4.2 in /admin (#677). Thanks @dependabot[bot]!
- build(deps): bump axios from 1.13.5 to 1.15.0 in /admin (#708). Thanks @dependabot[bot]!
- build(deps): bump @adonisjs/http-server from 7.8.0 to 7.8.1 in /admin (#724). Thanks @dependabot[bot]!
- build(deps): bump follow-redirects from 1.15.11 to 1.16.0 in /admin (#729). Thanks @dependabot[bot]!
- build(deps): bump protocol-buffers-schema from 3.6.0 to 3.6.1 in /admin (#736). Thanks @dependabot[bot]!
- build(deps): bump protobufjs from 7.5.4 to 7.5.5 in /admin (#737). Thanks @dependabot[bot]!

## Version 1.31.1 - April 21, 2026

### Features
- **AI Assistant**: Added improved support for AMD GPU acceleration for Ollama via ROCm + HSA override. Thanks @chriscrosstalk for the contribution!
- **Content Explorer**: Added support for custom ZIM library sources and pre-seeded ZIM library mirrors in addition to the default Kiwix library. Thanks @chriscrosstalk for the contribution!
- **Content Manager**: Content update sizes and downloads are now properly displayed in Active Downloads with progress bars and friendly names. Thanks @chriscrosstalk for the contribution!
- **Maps**: Map regions can now be extracted and downloaded locally from PMTiles to avoid the need for a full global map download for users who only want specific regions. Thanks @bgauger for the contribution!

### Bug Fixes
- **API**: Compression is now skipped for Server-Sent Events (SSE) responses to prevent issues with streaming endpoints. Thanks @chriscrosstalk for the fix!
- **Maps**: Fixed logic issues with the global map banner display. Thanks @Gujiassh for the fix!
- **Maps**: The selected map file is now properly deleted after confirming the action in the UI. Thanks @cuyua9 for the fix!
- **System**: Fixed an issue where the a pending update could still be indicated in the UI even after the system was updated successfully. Thanks @jakeaturner for the fix!

### Improvements
- **Build**: The Command Center image now uses the VERSION build arg to write `app/version.json` with the current version for improved version tracking and debugging, even in RC environments. Thanks @chriscrosstalk for the contribution!
- **Content Manager**: Added a sortable file size column to the ZIM files table in the Content Manager for easier management of storage space. Thanks @chriscrosstalk for the contribution!
- **Dependencies**: All package.json dependencies have been pinned to specific versions to ensure stability and reduce the risk of unexpected breaking changes/supply-chain compromises from upstream packages. Thanks @jakeaturner for the contribution!
- **Dependencies**: Updated various dependencies to close security vulnerabilities and improve stability
- **Docs**: Update CONTIRBUTING.md to require an issue to be opened before submitting a PR for non-trivial changes to ensure proper discussion and review of proposed changes. Thanks @chriscrosstalk for the contribution!
- **Docs**: Added the map markers endpoints to the API reference documentation. Thanks @kennethbrewer3 for the contribution!
- **Docs**: Added a link to the new WSL2 install guide in the README and FAQ. Thanks @chriscrosstalk for the contribution!
- **Install**: The install script now warns loudly if the user is attempting to install on a non-x86_64/amd64 platform to prevent unsupported installations and potential issues. Thanks @chriscrosstalk for the contribution!
- **Maps**: The maps API endpoints now properly accept and validate notes, marker_type, and position data for map markers and persist them in the database for retrieval in the UI. Thanks @jrsphoto for the contribution!
- **Maps**: The current coordinates of the mouse pointer can now be displayed in the map viewer for easier navigation and exploration. Thanks @kennethbrewer3 for the contribution!
- **RAG**: NOMAD now properly passed `num_ctx` and truncation to the Ollama embedding endpoint to ensure that the context window of the model is best utilized for embeddings. Thanks @chriscrosstalk for the contribution!
- **RAG**: Added a manual start button for Qdrant and a self-healing mechanism for Qdrant's restart-policy to ensure that the vector database is running properly for embedding and retrieval tasks. Thanks @hestela for the contribution!

## Version 1.31.1 - April 21, 2026

### Features

### Bug Fixes
- **AI Assistant**: In-progress model downloads can now be cancelled properly and the progress UI now matches that of file downloads. Thanks @chriscrosstalk for the contribution!
- **AI Assistant**: Fixed an issue where the AI Assistant settings page could crash if a model object did not have a details property. Thanks @hestela for the fix!
- **AI Assistant**: Fixed an issue with non-embeddable files being queued for embedding and flooding logs with errors. Thanks @sbruschke for the bug report and @chriscrosstalk for the fix!
- **AI Assistant**: Fixed an issue with ZIM batch embedding using the wrong batch count and causing remaining batches to be skipped. Thanks @sbruschke for the bug report and @chriscrosstalk for the fix!
- **AI Assistant**: Fixed an issue with ZIM content extraction only extracting the first-level children of the article body and thus missing a lot of content. Thanks @sbruschke for the bug report and @chriscrosstalk for the fix!
- **Disk Collector**: Improved reporting for NFS mount stats and display in the UI. Thanks @bgauger and @bravosierra99 for the contribution!
- **Downloads**: Downloads are now staged to .tmp files and atomically renamed upon completion to prevent issues with incomplete/corrupt files. Thanks @artbird309 for the contribution!
- **Downloads**: Removed a duplicate error listener and improved stability when handling Range requests for file downloads. Thanks @jakeaturner for the contribution!
- **Downloads**: Added improved handling for corrupt ZIM file downloads and removed duplicate Ollama download logs. Thanks @aegisman for the contribution!
- **Security**: Closed a potential SSRF vulnerability in the map file download functionality by implementing stricter URL validation and blocking private IP ranges. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **Security**: Sanitized error messages from the backend to prevent potential information disclosure. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **UI**: Fixed an issue with broken pagination for the Content Explorer that could cause some users to see a "No records found" message indefinitely. Thanks @johno10661 for the bug report and @chriscrosstalk for the fix!
- **UI**: Fixed an issue where all storage devices could report as "NAS Storage" regardless of actual type. Thanks @bgauger for the fix!

### Improvements
- **AI Assistant**: Now uses the currently loaded model for query rewriting and chat title generation for improved performance and consistency. Thanks @hestela for the contribution!
- **AI Assistant**: When a remote Ollama URL is configured, the Command Center will now attempt to stop NOMAD's local Ollama container to free up resources and avoid confusion. Thanks @chriscrosstalk for the contribution!
- **Dependencies**: Updated various dependencies to close security vulnerabilities and improve stability
- **Docs**: Added a "Community Add-Ons" page to the documentation to highlight some of the amazing community contributions that have been made since launch. Thanks @chriscrosstalk for the contribution!
- **Privacy**: Added the appropriate environment variable to disable telemetry for the Qdrant container. Note that this will only take effect on new installations of if the Qdrant container is force re-installed on existing installations. Thanks @berkdamerc for the find and @chriscrosstalk for the contribution!

## Version 1.31.0 - April 3, 2026

### Features
- **AI Assistant**: Added support for remote OpenAI-compatible hosts (e.g. Ollama, LM Studio, etc.) to support running models on seperate hardware from the Command Center host. Thanks @hestela for the contribution!
- **AI Assistant**: Disabled Ollama Cloud support (not compatible with NOMAD's architecture) and added support for flash_attn to improve performance of compatible models. Thanks @hestela for the contribution!
- **Information Library (Kiwix)**: The Kiwix container now uses an XML library file approach instead of a glob-based approach to inform the Kiwix container of available ZIM files. This allows for much more robust handling of ZIM files and avoids issues with the container failing to start due to incomplete/corrupt ZIM files being present in the storage directory. Thanks @jakeaturner for the contribution!
- **RAG**: Added support for EPUB file embedding into the Knowledge Base. Thanks @arn6694 for the contribution!
- **RAG**: Added support for multiple file uploads (<=5, 100mb each) to the Knowledge Base. Thanks @jakeaturner for the contribution!
- **Maps**: Added support for customizable location markers on the map with database persistence. Thanks @chriscrosstalk for the contribution!
- **Maps**: The global map file can now be downloaded directly from PMTiles for users who want to the full map and/or regions outside of the U.S. that haven't been added to the curated collections yet. Thanks @bgauger for the contribution!
- **Maps**: Added a scale bar to the map viewer with imperial and metric options. Thanks @chriscrosstalk for the contribution!
- **Downloads**: Added support/improvements for rich progress, friendly names, cancellation, and live status updates for active downloads in the UI. Thanks @chriscrosstalk for the contribution!
- **UI**: Converted all PNGs to WEBP for reduced image sizes and improved performance. Thanks @hestela for the contribution!
- **UI**: Added an Installed Models section to AI Assistant settings. Thanks @chriscrosstalk for the contribution!

### Bug Fixes
- **Maps**: The maps API endpoints now properly check for "X-Forwarded-Proto" to support scenarios where the Command Center is behind a reverse proxy that terminates TLS. Thanks @davidgross for the fix!
- **Maps**: Fixed an issue where the maps API endpoints could fail with an internal error if a hostname was used to access the Command Center instead of an IP address or localhost. Thanks @jakeaturner for the fix!
- **Queue**: Increased the BullMQ lockDuration to prevent jobs from being killed prematurely on slower systems. Thanks @bgauger for the contribution!
- **Queue**: Added better handling for very large downloads and user-initated cancellations. Thanks @bgauger for the contribution!
- **Install**: The install script now checks for the presence of gpg (required for NVIDIA toolkit install) and automatically attempts to install it if it's missing. Thanks @chriscrosstalk for the fix!
- **Security**: Added key validation to the settings read API endpoint. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **Security**: Improved URL validation logic for ZIM downloads to prevent SSRF vulnerabilities. Thanks @sebastiondev for the fix!
- **UI**: Fixed the activity feed height in Easy Setup and added automatic scrolling to the latest message during installation. Thanks @chriscrosstalk for the contribution!

### Improvements

- **Dependencies**: Updated various dependencies to close security vulnerabilities and improve stability
- **Docker**: NOMAD now adds 'com.docker.compose.project': 'project-nomad-managed' and 'io.project-nomad.managed': 'true' labels to all containers installed via the Command Center to improve compatibility with other Docker management tools and make it easier to identify and manage NOMAD containers. Thanks @techyogi for the contribution!
- **Docs**: Added a simple API reference for power users and developers. Thanks @hestela for the contribution!
- **Docs**: Re-formatted the Quick Install command into multiple lines for better readability in the README. Thanks @samsara-02 for the contribution!
- **Docs**: Updated the CONTRIBUTING and FAQ guides with the latest information and clarified some common questions. Thanks @jakeaturner for the contribution!
- **Ops**: Bumped GitHub Actions to their latest versions. Thanks @salmanmkc for the contribution!
- **Performance**: Shrunk the bundle size of the Command Center UI significantly by optimizing dependencies and tree-shaking, resulting in faster load times and a snappier user experience. Thanks @jakeaturner for the contribution!
- **Performance**: Implemented gzip compression by default for all HTTP registered routes from the Command Center backend to further improve performance, especially on slower connections. The DISABLE_COMPRESSION environment variable can be used to turn off this feature if needed. Thanks @jakeaturner for the contribution!
- **Performance**: Added light caching of certain Docker socket interactions and custom AI Assistant name resolution to improve performance and reduce redundant calls to the Docker API. Thanks @jakeaturner for the contribution!
- **Performance**: Switched to Inertia router navigation calls where appropriate to take advantage of Inertia's built-in caching and performance optimizations for a smoother user experience. Thanks @jakeaturner for the contribution!

## Version 1.30.3 - March 25, 2026

### Features

### Bug Fixes
- **Benchmark**: Fixed an issue where CPU and Disk Write scores could be displayed as 0 if the measured values was less than half of the reference mark. Thanks @bortlesboat for the fix!
- **Content Manager**: Fixed a missing API client method that was causing ZIM file deletions to fail. Thanks @LuisMIguelFurlanettoSousa for the fix!
- **Install**: Fixed an issue where the install script could incorrectly report the Docker NVIDIA runtime as missing. Thanks @brenex for the fix!
- **Support the Project**: Fixed a broken link to Rogue Support. Thanks @chriscrosstalk for the fix!

### Improvements
- **AI Assistant**: Improved error reporting and handling for model downloads. Thanks @chriscrosstalk for the contribution!
- **AI Assistant**: Bumped the default version of Ollama installed to v0.18.1 to take advantage of the latest performance improvements and bug fixes.
- **Apps**: Improved error reporting and handling for service installation failures. Thanks @trek-e for the contribution!
- **Collections**: Updated various curated collection links to their latest versions. Thanks @builder555 for the contribution!
- **Cyberchef**: Bumped the default version of CyberChef installed to v10.22.1 to take advantage of the latest features and bug fixes.
- **Docs**: Added a link to the step-by-step installation guide and video tutorial. Thanks @chriscrosstalk for the contribution!
- **Install**: Increased the retries limit for the MySQL service in Docker Compose to improve stability during installation on systems with slower performance. Thanks @dx4956 for the contribution!
- **Install**: Fixed an issue where stale data could cause credentials mismatch in MySQL on reinstall. Thanks @chriscrosstalk for the fix!

## Version 1.30.0 - March 20, 2026

### Features
- **Night Ops**: Added our most requested feature — a dark mode theme for the Command Center interface! Activate it from the footer and enjoy the sleek new look during your late-night missions. Thanks @chriscrosstalk for the contribution!
- **Debug Info**: Added a new "Debug Info" modal accessible from the footer that provides detailed system and application information for troubleshooting and support. Thanks @chriscrosstalk for the contribution!
- **Support the Project**: Added a new "Support the Project" page in settings with links to community resources, donation options, and ways to contribute.
- **Install**: The main Nomad image is now fully self-contained and directly usable with Docker Compose, allowing for more flexible and customizable installations without relying on external scripts. The image remains fully backwards compatible with existing installations, and the install script has been updated to reflect the simpler deployment process.

### Bug Fixes
- **Settings**: Storage usage display now prefers real block devices over tempfs. Thanks @Bortlesboat for the fix!
- **Settings**: Fixed an issue where device matching and mount entry deduplication logic could cause incorrect storage usage reporting and missing devices in storage displays.
- **Maps**: The Maps page now respects the request protocol (http vs https) to ensure map tiles load correctly. Thanks @davidgross for the bug report!
- **Knowledge Base**: Fixed an issue where file embedding jobs could cause a retry storm if the Ollama service was unavailable. Thanks @skyam25 for the bug report!
- **Curated Collections**: Fixed some broken links in the curated collections definitions (maps and ZIM files) that were causing some resources to fail to download.
- **Easy Setup**: Fixed an issue where the "Start Here" badge would persist even after visiting the Easy Setup Wizard for the first time. Thanks @chriscrosstalk for the fix!
- **UI**: Fixed an issue where the loading spinner could look strange in certain use cases.
- **System Updates**: Fixed an issue where the update banner would persist even after the system was updated successfully. Thanks @chriscrosstalk for the fix!
- **Performance**: Various small memory leak fixes and performance improvements across the UI to ensure a smoother experience.

### Improvements
- **Ollama**: Improved GPU detection logic to ensure the latest GPU config is always passed to the Ollama container on update
- **Ollama**: The detected GPU type is now persisted in the database for more reliable configuration and troubleshooting across updates and restarts. Thanks @chriscrosstalk for the contribution!
- **Downloads**: Users can now dismiss failed download notifications to reduce clutter in the UI. Thanks @chriscrosstalk for the contribution!
- **Logging**: Changed the default log level to "info" to reduce noise and focus on important messages. Thanks @traxeon for the suggestion!
- **Logging**: Nomad's internal logger now creates it's own log directory on startup if it doesn't already exist to prevent errors on fresh installs where the logs directory hasn't been created yet.
- **Dozzle**: Dozzle shell access and container actions are now disabled by default. Thanks @traxeon for the recommendation!
- **MySQL & Redis**: Removed port exposure to host by default for improved security. Ports can still be exposed manually if needed. Thanks @traxeon for the recommendation!
- **Dependencies**: Various dependency updates to close security vulnerabilities and improve stability
- **Utility Scripts**: Added a check for the expected Docker Compose version (v2) in all utility scripts to provide clearer error messages and guidance if the environment is not set up correctly.
- **Utility Scripts**: Added an additional warning to the installation script to inform about potential overwriting of existing customized configurations and the importance of backing up data before running the installation script again.
- **Documentation**: Updated installation instructions to reflect the new option for manual deployment via Docker Compose without the install script.


## Version 1.29.0 - March 11, 2026

### Features
- **AI Assistant**: Added improved user guidance for troubleshooting GPU pass-through issues
- **AI Assistant**: The last used model is now automatically selected when a new chat is started
- **Settings**: Nomad now automatically performs nightly checks for available app updates, and users can select and apply updates from the Apps page in Settings

### Bug Fixes
- **Settings**: Fixed an issue where the AI Assistant settings page would be shown in navigation even if the AI Assistant was not installed, thus causing 404 errors when clicked
- **Security**: Path traversal and SSRF mitigations
- **AI Assistant**: Fixed an issue that was causing intermittent failures saving chat session titles

### Improvements
- **AI Assistant**: Extensive performance improvements and improved RAG intelligence/context usage

## Version 1.28.0 - March 5, 2026

### Features
- **RAG**: Added support for viewing active embedding jobs in the processing queue and improved job progress tracking with more granular status updates
- **RAG**: Added support for removing documents from the knowledge base (deletion from Qdrant and local storage)

### Bug Fixes
- **Install**: Fixed broken url's in install script and updated to prompt for Apache 2.0 license acceptance
- **Docs**: Updated legal notices to reflect Apache 2.0 license and added Qdrant attribution
- **Dependencies**: Various minor dependency updates to close security vulnerabilities

### Improvements
- **License**: Added Apache 2.0 license file to repository for clarity and legal compliance

## Version 1.27.0 - March 4, 2026

### Features
- **Settings**: Added pagination support for Ollama model list
- **Early Access Channel**: Allows users to opt in to receive early access builds with the latest features and improvements before they hit stable releases

### Bug Fixes

### Improvements
- **AI Assistant**: Improved chat performance by optimizing query rewriting and response streaming logic
- **CI/CD**: Updated release workflows to support release candidate versions
- **KV Store**: Improved type safety in KV store implementation

## Version 1.26.0 - February 19, 2026

### Features
- **AI Assistant**: Added support for showing reasoning stream for models with thinking capabilities
- **AI Assistant**: Added support for response streaming for improved UX

### Bug Fixes

### Improvements


## Version 1.25.2 - February 18, 2026

### Features

### Bug Fixes
- **AI Assistant**: Fixed an error from chat suggestions when no Ollama models are installed
- **AI Assistant**: Improved discrete GPU detection logic
- **UI**: Legacy links to /docs and /knowledge-base now gracefully redirect to the correct pages instead of showing 404 errors

### Improvements
- **AI Assistant**: Chat suggestions are now disabled by default to avoid overwhelming smaller hardware setups

## Version 1.25.1 - February 12, 2026

### Features

### Bug Fixes
- **Settings**: Fix potential stale cache issue when checking for system updates
- **Settings**: Improve user guidance during system updates

### Improvements


## Version 1.25.0 - February 12, 2026

### Features
- **Collections**: Complete overhaul of collection management with dynamic manifests, database tracking of installed resources, and improved UI for managing ZIM files and map assets
- **Collections**: Added support for checking if newer versions of installed resources are available based on manifest data
### Bug Fixes
- **Benchmark**: Improved error handling and status code propagation for better user feedback on submission failures
- **Benchmark**: Fix a race condition in the sysbench container management that could lead to benchmark test failures

### Improvements

---

## Version 1.24.0 - February 10, 2026

### 🚀 Features

- **AI Assistant**: Query rewriting for enhanced context retrieval
- **AI Assistant**: Allow manual scan and resync of Knowledge Base
- **AI Assistant**: Integrated Knowledge Base UI into AI Assistant page
- **AI Assistant**: ZIM content embedding into Knowledge Base
- **Downloads**: Display model download progress
- **System**: Cron job for automatic update checks
- **Docs**: Polished documentation rendering with desert-themed components

### 🐛 Bug Fixes

- **AI Assistant**: Chat suggestion performance improvements
- **AI Assistant**: Inline code rendering
- **GPU**: Detect NVIDIA GPUs via Docker API instead of lspci
- **Install**: Improve Docker GPU configuration
- **System**: Correct memory usage percentage calculation
- **System**: Show host OS, hostname, and GPU instead of container info
- **Collections**: Correct devdocs ZIM filenames in Computing & Technology
- **Downloads**: Sort active downloads by progress descending
- **Docs**: Fix multiple broken internal links and route references

### ✨ Improvements

- **Docs**: Overhauled in-app documentation with sidebar ordering
- **Docs**: Updated README with feature overview
- **GPU**: Reusable utility for running nvidia-smi

---

## Version 1.23.0 - February 5, 2026

### 🚀 Features

- **Maps**: Maps now use full page by default
- **Navigation**: Added "Back to Home" link on standard header pages
- **AI**: Fuzzy search for AI models list
- **UI**: Improved global error reporting with user notifications

### 🐛 Bug Fixes

- **Kiwix**: Avoid restarting the Kiwix container while download jobs are running
- **Docker**: Ensure containers are fully removed on failed service install
- **AI**: Filter cloud models from API response and fallback model list
- **Curated Collections**: Prevent duplicate resources when fetching latest collections
- **Content Tiers**: Rework tier system to dynamically determine install status on the server side

### ✨ Improvements

- **Docs**: Added pretty rendering for markdown tables in documentation pages

---

## Version 1.22.0 - February 4, 2026

### 🚀 Features

- **Content Manager**: Display friendly names (Title and Summary) instead of raw filenames for ZIM files
- **AI Knowledge Base**: Automatically add NOMAD documentation to AI Knowledge Base on install

### 🐛 Bug Fixes

- **Maps**: Ensure map asset URLs resolve correctly when accessed via hostname
- **Wikipedia**: Prevent loading spinner overlay during download
- **Easy Setup**: Scroll to top when navigating between wizard steps
- **AI Chat**: Hide chat button and page unless AI Assistant is actually installed
- **Settings**: Rename confusing "Port" column to "Location" in Apps Settings

### ✨ Improvements

- **Ollama**: Cleanup model download logic and improve progress tracking

---

## Version 1.21.0 - February 2, 2026

### 🚀 Features

- **AI Assistant**: Built-in AI chat interface — no more separate Open WebUI app
- **Knowledge Base**: Document upload with OCR, semantic search (RAG), and contextual AI responses via Qdrant
- **Wikipedia Selector**: Dedicated Wikipedia content management with smart package selection
- **GPU Support**: NVIDIA and AMD GPU passthrough for Ollama (faster AI inference)

### 🐛 Bug Fixes

- **Benchmark**: Detect Intel Arc Graphics on Core Ultra processors
- **Easy Setup**: Remove built-in System Benchmark from wizard (now in Settings)
- **Icons**: Switch to Tabler Icons for consistency, remove unused icon libraries
- **Docker**: Avoid re-pulling existing images during install

### ✨ Improvements

- **Ollama**: Fallback list of recommended models if api.projectnomad.us is down
- **Ollama/Qdrant**: Docker images pinned to specific versions for stability
- **README**: Added website and community links
- Removed Open WebUI as a separate installable app (replaced by built-in AI Chat)

---

## Version 1.20.0 - January 28, 2026

### 🚀 Features

- **Collections**: Expanded curated categories with more content and improved tier selection modal UX
- **Legal**: Expanded Legal Notices and moved to bottom of Settings sidebar

### 🐛 Bug Fixes

- **Install**: Handle missing curl dependency on fresh Ubuntu installs
- **Migrations**: Fix timestamp ordering for builder_tag migration

---

## Version 1.19.0 - January 28, 2026

### 🚀 Features

- **Benchmark**: Builder Tag system — claim leaderboard spots with NOMAD-themed tags (e.g., "Tactical-Llama-1234")
- **Benchmark**: Full benchmark with AI now required for community sharing; HMAC-signed submissions
- **Release Notes**: Subscribe to release notes via email
- **Maps**: Automatically download base map assets if missing

### 🐛 Bug Fixes

- **System Info**: Fall back to fsSize when disk array is empty (fixes "No storage devices detected")

---

## Version 1.18.0 - January 24, 2026

### 🚀 Features

- **Collections**: Improved curated collections UX with persistent tier selection and submit-to-confirm workflow

### 🐛 Bug Fixes

- **Benchmark**: Fix AI benchmark connectivity (Docker container couldn't reach Ollama on host)
- **Open WebUI**: Fix install status indicator

### ✨ Improvements

- **Docker**: Container URL resolution utility and networking improvements

---

## Version 1.17.0 - January 23, 2026

### 🚀 Features

- **System Benchmark**: Hardware scoring with NOMAD Score, circular gauges, and community leaderboard submission
- **Dashboard**: User-friendly app names with "Powered by" open source attribution
- **Settings**: Updated nomenclature and added tiered content collections to Settings pages
- **Queues**: Support working all queues with a single command

### 🐛 Bug Fixes

- **Easy Setup**: Select valid primary disk for storage projection bar
- **Docs**: Remove broken service links that pointed to invalid routes
- **Notifications**: Improved styling
- **UI**: Remove splash screen
- **Maps**: Static path resolution fix

---

## Version 1.16.0 - January 20, 2026

### 🚀 Features

- **Apps**: Force-reinstall option for installed applications
- **Open WebUI**: Manage Ollama models directly from Command Center
- **Easy Setup**: Show selected AI model size in storage projection bar

### ✨ Improvements

- **Curated Categories**: Improved fetching from GitHub
- **Build**: Added dockerignore file

---

## Version 1.15.0 - January 19, 2026

### 🚀 Features

- **Easy Setup Wizard**: Redesigned Step 1 with user-friendly capability cards instead of app names
- **Tiered Collections**: Category-based content collections with Essential, Standard, and Comprehensive tiers
- **Storage Projection Bar**: Visual disk usage indicator showing projected additions during Easy Setup
- **Windows Support**: Docker Desktop support for local development with platform detection and NOMAD_STORAGE_PATH env var
- **Documentation**: Comprehensive in-app documentation (Home, Getting Started, FAQ, Use Cases)

### ✨ Improvements

- **Easy Setup**: Renamed step 3 label from "ZIM Files" to "Content"
- **Notifications**: Fixed auto-dismiss not working due to stale closure
- Added Survival & Preparedness and Education & Reference content categories

---

## Version 1.14.0 - January 16, 2026

### 🚀 Features

- **Collections**: Auto-fetch latest curated collections from GitHub

### 🐛 Bug Fixes

- **Docker**: Improved container state management

---

## Version 1.13.0 - January 15, 2026

### 🚀 Features

- **Easy Setup Wizard**: Initial implementation of the guided first-time setup experience
- **Maps**: Enhanced missing assets warnings
- **Apps**: Improved app cards with custom icons

### 🐛 Bug Fixes

- **Curated Collections**: UI tweaks
- **Install**: Changed admin container pull_policy to always

---

## Version 1.12.0 - 1.12.3 - December 24, 2025 - January 13, 2026

### 🚀 Features

- **System**: Check internet status on backend with custom test URL support

### 🐛 Bug Fixes

- **Admin**: Improved service install status management
- **Admin**: Improved duplicate install request handling
- **Admin**: Fixed base map assets download URL
- **Admin**: Fixed port binding for Open WebUI
- **Admin**: Improved memory usage indicators
- **Admin**: Added favicons
- **Admin**: Fixed container healthcheck
- **Admin**: Fixed missing ZIM download API client method
- **Install**: Fixed disk info file mount and stability
- **Install**: Ensure update script always pulls latest images
- **Install**: Use modern docker compose command in update script
- **Install**: Ensure update script is executable
- **Scripts**: Remove disk info file on uninstall

---

## Version 1.11.0 - 1.11.1 - December 24, 2025

### 🚀 Features

- **Maps**: Curated map region collections
- **Collections**: Map region collection definitions

### 🐛 Bug Fixes

- **Maps**: Fixed custom pmtiles file downloads
- **Docs**: Documentation renderer fixes

---

## Version 1.10.1 - December 5, 2025

### ✨ Improvements
- **Kiwix**: ZIM storage path improvements

---

## Version 1.10.0 - December 5, 2025

### 🚀 Features

- Disk info monitoring

### ✨ Improvements

- **Install**: Add Redis env variables to compose file
- **Kiwix**: Initial download and setup

---

## Version 1.9.0 - December 5, 2025

### 🚀 Features

- Background job management with BullMQ

### ✨ Improvements

- **Install**: Character escaping in env variables
- **Install**: Host env variable

---

## Version 1.8.0 - December 5, 2025

### 🚀 Features

- Alert and button styles redesign
- System info page redesign
- **Collections**: Curated ZIM Collections with slug, icon, and language support
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: Cleanup old OSM stuff
- **Install**: Standardize compose file names

---

## Version 1.7.0 - December 5, 2025

### 🚀 Features

- Alert and button styles redesign
- System info page redesign
- **Collections**: Curated ZIM Collections
- Custom map and ZIM file downloads (WIP)
- New maps system (WIP)

### ✨ Improvements

- **DockerService**: Cleanup old OSM stuff
- **Install**: Standardize compose file names

---

## Version 1.6.0 - November 18, 2025

### 🚀 Features

- Added Kolibri to standard app library

### ✨ Improvements

- Standardize container names in management-compose

---

## Version 1.5.0 - November 18, 2025

### 🚀 Features

- Version footer and fix CI version handling

---

## Version 1.4.0 - November 18, 2025

### 🚀 Features

- **Services**: Friendly names and descriptions

### ✨ Improvements

- **Scripts**: Logs directory creation improvements
- **Scripts**: Fix typo in management-compose file path

---

## Version 1.3.0 - October 9, 2025

### 🚀 New Features

- Uninstall script now removes non-management Nomad app containers

### ✨ Improvements

- **OpenStreetMap**: Apply dir permission fixes more robustly

---

## Version 1.2.0 - October 7, 2025

### 🚀 New Features

- Added CyberChef to standard app library
- Added Dozzle to core containers for enhanced logs and metrics
- Added FlatNotes to standard app library
- Uninstall helper script available

### ✨ Improvements

- **OpenStreetMap**:
    - Fixed directory paths and access issues
    - Improved error handling
    - Fixed renderer file permissions
    - Fixed absolute host path issue
- **ZIM Manager**:
    - Initial ZIM download now hosted in Project Nomad GitHub repo for better availability

---

## Version 1.1.0 - August 20, 2025

### 🚀 New Features

**OpenStreetMap Installation**
- Added OpenStreetMap to installable applications
- Automatically downloads and imports US Pacific region during installation.
- Supports rendered tile caching for enhanced performance.

### ✨ Improvements

- **Apps**: Added start/stop/restart controls for each application container in settings
- **ZIM Manager**: Error-handling/resumable downloads + enhanced UI
- **System**: You can now view system information such as CPU, RAM, and disk stats in settings
- **Legal**: Added legal notices in settings
- **UI**: Added general UI enhancements such as alerts and error dialogs
- Standardized container naming to reduce potential for conflicts with existing containers on host system

### ⚠️ Breaking Changes

- **Container Naming**: As a result of standardized container naming, it is recommend that you do a fresh install of Project N.O.M.A.D. and any apps to avoid potential conflicts/duplication of containers

### 📚 Documentation

- Added release notes page

---

## Version 1.0.1 - July 11, 2025

### 🐛 Bug Fixes

- **Docs**: Fixed doc rendering
- **Install**: Fixed installation script URLs
- **OpenWebUI**: Fixed Ollama connection

---

## Version 1.0.0 - July 11, 2025

### 🚀 New Features

- Initial alpha release for app installation and documentation
- OpenWebUI, Ollama, Kiwix installation
- ZIM downloads & management

---

## Support

- **Discord:** [Join the Community](https://discord.com/invite/crosstalksolutions) — Get help, share your builds, and connect with other NOMAD users
- **Bug Reports:** [GitHub Issues](https://github.com/Crosstalk-Solutions/project-nomad/issues)
- **Website:** [www.projectnomad.us](https://www.projectnomad.us)

---

*For the full changelog, see our [GitHub releases](https://github.com/Crosstalk-Solutions/project-nomad/releases).*
