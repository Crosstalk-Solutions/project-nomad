# Keeping N.O.M.A.D. Updated

N.O.M.A.D. works best when it's kept current while you have internet, so it's ready with the latest software and content the next time you go offline. This page explains what can be updated, how to do it on demand, and how to let N.O.M.A.D. handle it for you automatically.

---

## The three kinds of updates

There are three separate things that can be updated, and you control each one independently:

1. **Software (the core)** — N.O.M.A.D. itself: the Command Center, new features, bug fixes, and security improvements.
2. **Apps** — the installable apps from the [Supply Depot](/supply-depot) (Kiwix, the AI Assistant, and any others you've added).
3. **Content** — your offline material: Wikipedia and other Kiwix libraries, and downloaded map regions.

You can update any of these on demand, or set any of them to update automatically.

---

## Updating on demand

To check for and install updates yourself:

1. Go to **[Settings → Check for Updates](/settings/update)**.
2. If a software update is available, click to install it. N.O.M.A.D. downloads the update and restarts (usually 2–5 minutes).
3. Apps can be updated from their card in the [Supply Depot](/supply-depot) using **Manage › Update**.
4. Content is managed from **Settings → Content Manager** and **Content Explorer**, where you can download newer versions of installed libraries and maps.

If a software or app update ever fails, N.O.M.A.D. is designed to recover gracefully — the previous working version keeps running, so your server stays up.

---

## Automatic updates

N.O.M.A.D. can keep itself current without you having to remember to check. **Automatic updates are opt-in and off by default** — nothing updates on its own until you turn it on. You manage all of it from **Settings → Updates**.

A few things are true across all three:

- **You choose a time window.** Automatic updates only run during the hours you set, so they never interrupt you mid-use.
- **Major versions are never automatic.** Only minor and patch updates apply on their own; a big version jump always waits for you to do it manually, on purpose.
- **Safety checks come first.** Before applying anything, N.O.M.A.D. confirms there's enough disk space and that no other update, download, or install is already in progress.
- **Being offline is harmless.** If N.O.M.A.D. can't reach the internet to check, it simply skips that round and tries again later.

### Automatic software (core) updates

Turn this on from **Settings → Updates**. When enabled, N.O.M.A.D. updates its own core to newer releases within the same major version, during your chosen window, after a configurable **cool-off** period (so a brand-new release has time to prove itself before your server takes it). The same page shows the toggle, the window, the cool-off setting, and live status. If updates fail repeatedly for a real reason, N.O.M.A.D. turns the feature back off and lets you know rather than retrying forever.

### Automatic app updates

App auto-updates are opt-in at **two levels**: a master switch in **Settings → Updates**, *and* a per-app toggle on each app's card in the [Supply Depot](/supply-depot). Both have to be on for an app to update itself. App updates share the same update window and cool-off as the core, apply only minor and patch versions, and back off automatically for any individual app that keeps failing.

### Automatic content updates

Installed Wikipedia/ZIM libraries and map regions can refresh themselves too. Because content downloads are large (often many gigabytes), content updates run on their **own dedicated overnight window** with a **bandwidth cap**, separate from the software and app schedule. N.O.M.A.D. checks the upstream Kiwix and map catalogs directly, and when a Wikipedia library is replaced with a newer version, it keeps the AI Knowledge Base in sync automatically.

---

## Early Access Channel

Want new features before they reach the stable release? Enable the **Early Access Channel** from the [Check for Updates](/settings/update) page to receive release-candidate builds. Early-access builds may contain rough edges — you can switch back to stable at any time.

---

## Before you go offline

Whatever you choose, the habit that matters most is simple: **update while you still have internet.** Whether you do it by hand or let automatic updates handle it, make sure your software and content are current before you head somewhere without a connection. When you're offline, you'll have the last synced versions of everything ready to go.

**[Check for Updates →](/settings/update)** · **[See what's new in each version →](/docs/release-notes)**
