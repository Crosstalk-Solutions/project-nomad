# nomad-unchained — Upstream Strategy

## 1. Purpose & scope

This document defines how the `BuboTheWise/nomad-unchained` fork of `Crosstalk-Solutions/project-nomad` manages its patch set against upstream: which patches are offered upstream, which stay fork-only, and the mechanics that keep the fork a thin, rebaseable patch set. It consolidates the patch-eligibility assessment (seven fork patches) and the three procedural workflow rules, and is written to be self-contained for a reader with no prior context.

## 2. Patch decisions

**Policy anchors.** The fork's FAQ L29–31 is the governing policy: NOMAD targets Debian-based systems first and foremost; non-Debian Linux is "increasingly reachable" but community-supported; other OS support "will come in the future" because development resources are limited and scope was deliberately narrowed.

**Rejection history (why some patches stay fork-only).**
- PR #235 / #243 (multi-distro installer): approved in review 2026-03-13, shelved "until we're a bit more stable" 2026-03-31, closed **unmerged** 2026-04-02 when its base branch was deleted.
- Issue #1381 + PR #1382 (distro-agnostic installer): closed **not planned** 2026-10-07 — maintainer: "We're designing and implementing arm64 support in-house, so keep an eye on the releases for it."

**Decision table** (base `v1.35.1`, `54ee30a`; commit mapping verified in the fork):

| patch# | area | verdict | justification (condensed) |
|---|---|---|---|
| #5 `aad66c5` | install: MySQL data preservation + `NOMAD_DIR` | **UPSTREAM** | Data-loss-on-reinstall is a correctness bug on the primary platform (Debian), not a scope expansion; frame as bug fix, not feature. |
| #3 `cd30a86` | install: source-URL override (`NOMAD_SOURCE_REPO`/`REF`) | **UPSTREAM** | Distro-neutral, default-identical; the fork's own Rule 6 names "the source guard for scripts" as offer-first. |
| #14 (slice) `PR #25` | CI: ShellCheck baseline | **UPSTREAM** | Lints install scripts regardless of distro — neutral and cheap. Multi-distro matrix stays FORK-ONLY (CI-cost commitment for platforms just deprioritized). |
| #6 `4632cea` | install: multi-distro dispatch + local-IP | **FORK-ONLY** | The exact breadth category upstream declined twice (#243, #1381/#1382); re-pushing now re-litigates a decision re-affirmed a month ago. IP helper may go as a standalone micro-PR (Rule 6 named). |
| #4 `239f9d0` | install: NVIDIA toolkit per-family | **FORK-ONLY** | Distro-breadth (GPU on RHEL/Arch), same category as #243/#1381/#1382; non-blocking, so fork-side cost is zero. |
| #12 `PR #23` | compose: `NOMAD_IMAGE_REGISTRY` override | **FORK-ONLY** | Sole use case (fork-side admin images) doesn't exist upstream; default-identical, so fork-side cost is nil. |
| #13 `PR #24` | docs: multi-distro reality | **FORK-ONLY** | Upstream FAQ L29–31 *is* the Debian-first policy; pushing multi-distro docs asks upstream to commit to what they just re-declined. |

**Re-push set (in order of acceptance probability):** 1) #5 MySQL data preservation, 2) #3 source-URL override, 3) #14 ShellCheck slice (optionally the #6 IP-helper micro-PR). Each re-push is re-based per upstream release and dropped if upstream absorbs the fix in-house (e.g., the announced arm64 work may land #3-class fixes itself).

## 3. Naming convention

Every patch that may go upstream is carried on its **own branch**, cut from **`upstream/main`** (never fork `main`, never another `upstream/` branch), squash-committed to a **single commit**, with **no merge commits**.

**Branch name:** `upstream/<patch-id>-<seq>-<slug>`
- `<patch-id>`: the fork issue number motivating the patch (one number = one patch).
- `<seq>`: 1-digit sequence, bumped each time the same patch-id is re-cut after a rebase/re-push.
- `<slug>`: short kebab-case verb+area, ≤ 40 chars.

**PR title template:** `[upstream #<patch-id>] <area>: <imperative summary>` — the leading tag is the machine-greppable marker CI uses to apply the thin-patch check (§5). `<area>` uses existing tag vocabulary (`install`, `ci`, `docs`, `gpu`, `fork`).

**Example (real patch #3):** branch `upstream/3-1-source-override` cut from `upstream/main`; PR `[upstream #3] install: make scripted-download URLs source-overridable`. After a rebase, re-cut as `upstream/3-2-source-override` from the new base — never stack.

## 4. Rebase cadence & trigger

**Cadence: per-upstream-release, not monthly.** Upstream ships minor + patch releases regularly (observed `v1.33.0 → v1.34.0 → v1.35.1`, each with RCs); tying rebase to the release event means we re-base against exactly the tree our next install targets, and never against a moving `main` mid-feature.

**Trigger:** rebase every open `upstream/*` branch **within 48 hours of an upstream release tag push** (a new `vX.Y.Z` tag on `Crosstalk-Solutions/project-nomad`) — fired by a cron/watch on upstream tags, not manually. Also rebase **on-demand** when an upstream PR we depend on merges and moves the surface our patches touch.

**Procedure:**
```
git fetch upstream --tags
git checkout upstream/3-1-source-override
git rebase --onto upstream/main HEAD~1   # re-root the single commit on the new base
git push --force-with-lease origin upstream/3-1-source-override
```

**Conflict budget (N = 40 conflicting lines):** ≤ 40 → resolve in the patch's own files only, force-push, proceed (the normal path). > 40 → STOP; in order: (1) split into two smaller patches and re-cut both, (2) note the conflict size on the PR and defer to the next release tag, (3) escalate to human review before any force-push. A blown budget is a decomposition signal, not a heroic-conflict-resolution event.

**Post-rebase acceptance (every time):** `mergeStateStatus = CLEAN` on the PR, latest `Tests` (Linux) check green on the new head, diff vs `upstream/main` unchanged except conflict-resolution lines.

## 5. Thin-patch test & CI enforcement

A patch is "thin" iff it passes **all three** mechanical checks, run in CI (`.github/workflows/thin-patch.yml`) on every PR whose title matches `[upstream #*]`:

- **5a. Size ceiling** — `git diff --stat upstream/main..HEAD` must show **≤ 3 files AND ≤ 300 changed lines** (insertions + deletions). Our largest current patch (2 files / ~262 lines) passes with headroom.
- **5b. No merge commits** — `git log --merges upstream/main..HEAD` must be **empty** (the fork's current history has merge commits `6274a4b`, `7685ba9` that this rule would reject; new patches are squash-committed).
- **5c. Re-rootable in one step** — `git rebase --onto upstream/main HEAD~1` must succeed **with zero conflicts** on a clean worktree; otherwise the patch fails the test and goes to the §4 conflict path.

The three sections lock together: naming (§3) gives CI a stable identity and a clean single-parent base; cadence (§4) bounds when the base moves and turns rebases into decomposition signals; the thin test (§5) is the gate that fails any patch that is too big, carries a merge commit, or can't re-root cleanly — and tells us *which rule* broke.

## 6. Review process

- **Who reviews this document:** the repo owner (`BuboTheWise`) **plus one external reviewer** (a reviewer outside the fork's owner account, to keep the policy from drifting to the fork's own interests).
- **Review cadence:** **per upstream release** — the same trigger as §4 (48h after each new `vX.Y.Z` tag). Each review re-checks the §2 decision table against the latest upstream activity (new rejections, absorbed fixes, arm64 releases) and the §3–§5 thresholds against the current fork.
- **Where feedback is logged:** review comments are posted on the PR that carries this document in `BuboTheWise/nomad-unchained`; every accepted change then gets an entry in the §7 change log. Rejections and deferrals stay on the PR thread so the decision history (like #243 and #1381/#1382 above) remains auditable.
- **Re-push PRs:** each of the §2 upstream candidates additionally requires the §5 CI gate green and the §4 post-rebase acceptance bar before review.

## 7. Change log

| version | date | author | change |
|---|---|---|---|
| 1.0 | 2026-11-04 | Bubo | Initial version: consolidated patch-eligibility decisions (fork patches #3/#4/#5/#6/#12/#13/#14 vs FAQ L29–31 and #243 / #1381+#1382 history) with the three procedural workflow rules (naming, rebase cadence, thin-patch test) and the review process. |
