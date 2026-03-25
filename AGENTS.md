# AGENTS.md

## Repo Contract

This repository is a downstream emergency fork of Project N.O.M.A.D.
Its product scope is specific:

- Android-first emergency bootstrap application
- hard-offline local read path
- local daemon plus loopback API
- opportunistic bounded sync
- incremental reuse of upstream Project N.O.M.A.D.

The goal of the agent is not to build generic demos or generic agent platforms.
The goal is to build and maintain this emergency runtime in a way that other contributors can understand and extend.

## Public Agent Tooling

The agentic files in this repo are versioned on purpose.
They are part of the contributor toolkit, not private scratchpad material.

This includes:

- `AGENTS.md` at repo root: shared repo-wide contract
- `pipeline-handheld/`: project-specific development network for the emergency runtime

If these files change, keep them coherent with the repo's actual workflow.
If the phase model or state schema changes, update the matching docs and state files together.

## Mission

- Turn product requests into usable slices of the emergency runtime.
- Keep the hard-offline model intact.
- Reuse upstream N.O.M.A.D. code where practical through bounded seams.
- Leave the repo in a state that another contributor can continue without hidden context.

## Default Working Style

- Understand the real repo before changing it.
- Prefer execution to discussion once the task is clear.
- Make reasonable assumptions when they do not change safety, offline behavior, or upstream compatibility.
- Ask for clarification when ambiguity would change:
  - hard-offline behavior
  - network policy semantics
  - upstream seam choices
  - operator safety or destructive actions
- Keep changes scoped to the user request.

## When To Use `pipeline-handheld/`

Use `pipeline-handheld/` when the task touches one or more of:

- offline behavior
- `ON` / `OFF` / armed one-shot network policy
- local daemon or loopback API
- local storage, search, maps, or sync
- upstream seam and reuse strategy
- multi-file runtime slices that benefit from explicit verify/repair flow

Do not force `pipeline-handheld/` for:

- trivial docs
- tiny refactors
- small one-file fixes
- cosmetic edits with no runtime consequence

For small tasks, direct Builder Mode is preferred.

## Repo Shape

Current important areas:

- `admin/`: upstream N.O.M.A.D. admin/runtime code
- `collections/`: upstream content and collection assets
- `install/`: upstream installation assets
- `docs/emergency/`: emergency runtime docs for this fork
- `pipeline-handheld/`: contributor-facing agent network for this runtime

Prefer additive work in bounded paths instead of broad rewrites of unrelated upstream code.

## Implementation Priorities

When building a slice, close the loop as far as the task reasonably allows:

1. user/operator flow
2. contract or seam decision
3. backend/runtime behavior
4. frontend/UI wiring if relevant
5. loading/error/empty states if relevant
6. minimal config surface
7. local verification

Do not stop halfway if the slice can be closed end-to-end.

## Domain Rules

- Hard-offline read behavior is sacred.
- Network policy is security-sensitive. `OFF` and armed one-shot behavior must not be weakened casually.
- The network is an ingest path, not the center of the product.
- Prefer reuse-first decisions against Project N.O.M.A.D.
- Prefer adapters, feature flags, and bounded seams over broad rewrites.
- Keep names aligned to the domain, not the tool.

## Destructive Action Rails

- Never delete, move, rename, truncate, or regenerate large areas of the repo unless the user explicitly asks.
- Never run destructive shell or VCS commands such as `rm`, `git reset --hard`, `git clean`, `git checkout --`, `git restore --source`, or branch deletion unless the user explicitly asks.
- Never modify secrets, `.env` files, signing assets, release credentials, or package identifiers unless the user explicitly asks.

## VCS Write Rails

- Do not create commits, amend commits, merge, rebase, cherry-pick, tag, push, or open PRs unless the user explicitly asks.
- Read-only git inspection is allowed.
- Default behavior is to leave changes in the working tree for the user to review and commit.

## Network Fetch Rails

- Commands that fetch network context or dependencies in sandbox are known to fail often here.
- If a network fetch is required, execute the real fetch path directly with the available permissions flow instead of wasting time on sandbox dry-runs.
- Network access is for fetching context or dependencies, not for changing remote state unless the user explicitly asks.

## Decision Autonomy

The agent may:

- create missing files
- complete incomplete scaffolds
- wire together frontend, backend, daemon, and local API slices
- add small development scripts
- add mock or fallback behavior when a real integration is not yet configurable
- refactor locally when needed to complete the requested slice cleanly

The agent must not:

- widen scope arbitrarily
- rewrite broad upstream areas without necessity
- turn a scoped task into a speculative platform redesign

## Output Expected

Each intervention should leave:

- a usable feature or technical slice
- coherent files in the repo
- minimal run/test guidance when relevant
- a short final explanation focused on what now works, what was verified, and what remains open

## Summary

The user owns product direction and commit/publish decisions.
The agent builds the terrain: code, docs, seams, wiring, safety rails, and contributor workflow for this emergency bootstrap runtime.
