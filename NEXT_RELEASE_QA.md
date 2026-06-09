# Next Release — QA / Smoke-Test Checklist for RC/Beta Testers

High-level things to poke at. No need to go deep on internals — just confirm the happy path works and the new toggles behave. Items marked ⭐ are the highest-value live tests (authors specifically asked for real-host validation).

## Automatic Updates (new)
- [ ] **Settings → Updates** loads and shows the new sections: Core, Automatic App Updates, and Content Updates.
- [ ] **App auto-updates are off by default.** Confirm the global master switch and each per-app toggle (Supply Depot → Manage) start off.
- [ ] With the master switch **off**, a per-app toggle reads "App auto-updates off — open Settings" and takes you to the Updates page.
- [ ] Turn on the master switch + one app's toggle; confirm it persists across a reload and shows eligibility / cool-off / last-run status.
- [ ] **Content Updates**: enable the opt-in switch, confirm it prompts/recommends setting a bandwidth cap and uses its own overnight window.
- [ ] (If feasible) ⭐ Let an eligible app or content item actually auto-update in its window and confirm it succeeds and reflects the new version.

## Update reliability
- [ ] ⭐ **Check for Updates** on a box with **Ollama** installed — it should return versions (not silently fail / appear pinned).
- [ ] Trigger a service update (e.g. AI Assistant/Ollama). The **Update button disables and shows "Updating..."**, and the activity feed shows live progress.
- [ ] Reload the page mid-update — the button stays disabled (state is durable).
- [ ] Click Update twice quickly — the second click is rejected cleanly, no Docker error.
- [ ] **Port conflict message**: with a native Ollama running on :11434, attempt to install/start nomad_ollama and confirm you get a clear message with fix commands (not a raw Docker error).
- [ ] ⭐ Force a service update to fail to start and confirm the **old container is restored** (service stays up) and a retry isn't wedged.
- [ ] App cards show the **installed version** (e.g. `Kiwix · 3.7.0`) and a visible **orange "Update available"** pill where applicable.

## AI Assistant / Knowledge Base
- [ ] ⭐ Ingest a **dense ZIM** (e.g. medlineplus / a stackexchange ZIM) on a CPU/low-VRAM box — confirm **no endless `api/embed` loop**, no pegged GPU, and Qdrant point count grows.
- [ ] ⭐ Ingest a **multi-page ZIM** (iFixit) — progress should climb smoothly and **not freeze at 99%**; it completes.
- [ ] Ingest a **link-out/PDF-heavy ZIM** — confirm it does **not** show a false "ingestion may have stalled" warning.
- [ ] After batched ZIM ingestion, the reported **embedded-chunk count looks right** (not absurdly low vs. what was stored).
- [ ] **Chat suggestions** load quickly and don't error, even with a large model on disk; they use your selected model.

## Maps
- [ ] Pan/zoom the map, **refresh** — the view is restored (not reset to US-wide).
- [ ] If you have an old + new copy of the same region on disk, the **map still renders** (doesn't go fully blank).

## Content management
- [ ] ⭐ Install a curated map or ZIM, then install a **newer version** — confirm the **old file is removed**, the new one is present and served, and any **sideloaded** same-resource file is left untouched.
- [ ] Install a curated **Wikipedia-themed ZIM** (e.g. Medicine → Comprehensive), **restart**, and confirm it's **still listed** (not wiped, tier not downgraded).

## Storage / Install / System
- [ ] ⭐ **Relocate the admin storage volume** to another disk (via compose) and confirm Kiwix and other child apps find their content at the new location (Kiwix not empty).
- [ ] Delete/corrupt the Kiwix library file, restart — Kiwix **self-heals** and serves content again.
- [ ] On a network that blocks Cloudflare 1.1.1.1, confirm NOMAD does **not** show "No internet connection" while downloads work.
- [ ] Run the install script on a non-TTY / scripted environment — NVIDIA toolkit setup is **not** silently skipped.
- [ ] (Homelab) Set `REDIS_DB=10` and confirm queue jobs and live updates work without colliding with other Redis users.

## Sanity / regression
- [ ] Default install (no storage relocation, no auto-update opt-in) behaves exactly as before — none of the new gates change default behavior.
- [ ] App "Open" links work; setting a **custom URL** on an app overrides the link and shows the live "Opens as:" preview; clearing it restores the default.
- [ ] General UI smoke: dashboard, Supply Depot, Content Manager, Maps, AI chat all load without console errors.
