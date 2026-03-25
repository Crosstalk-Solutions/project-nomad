# USAGE.md — Emergency Bootstrap Network

## What This Is
A stateful agent network tailored to this repo and this runtime profile.

Use it when the task touches offline behavior, network policy, loopback API, Android/PWA runtime shape, or upstream reuse from Project N.O.M.A.D.

## Two Modes

### Mode A — Manual
Open a fresh session per phase, load the right `AGENTS.md`, feed the right files from `/state`, save the output back to `/state`.

### Mode B — CLI via `router.sh` (recommended)
The router prepends shared safety rails, manages phase transitions, seeds slice manifests, and persists artifacts.

```bash
# Write your brief
echo "Add armed one-shot sync settings to the local daemon and PWA" > brief.txt

# Run the network
./scripts/router.sh scope brief.txt
./scripts/router.sh seams
./scripts/router.sh build-all
./scripts/router.sh verify

# Or work slice-by-slice
./scripts/router.sh build network-policy-ui
./scripts/router.sh repair network-policy-ui

# Status
./scripts/router.sh status
```

## Phases

### 1. Scope
- Context: `01-scope-agent/AGENTS.md`
- Input: raw task brief
- Output: `state/scope.yaml`
- Purpose: reduce the request to one emergency-runtime slice with explicit offline and network-policy constraints

### 2. Seam
- Context: `02-seam-agent/AGENTS.md`
- Input: `state/scope.yaml` plus the emergency docs
- Output: `state/seams.yaml`
- Purpose: decide what to reuse from N.O.M.A.D., where to adapt, and which implementation slices exist

### 3. Runtime
- Context: `03-runtime-agent/AGENTS.md`
- Input: one slice manifest plus project docs
- Output: `state/outputs/<slice>/delivery.md`
- Purpose: produce one end-to-end slice delivery bundle for this repo

### 4. Verify
- Context: `04-verify-agent/AGENTS.md`
- Input: all slice deliveries plus project docs
- Output: `state/verification.yaml`
- Purpose: verify hard-offline fit, network policy correctness, upstream delta, and safety compliance

### 5. Repair
- Context: `05-repair-agent/AGENTS.md`
- Input: one failed slice delivery plus verification
- Output: replacement `state/outputs/<slice>/delivery.md`
- Purpose: patch locally without widening scope

## Safety Rules

Shared rules live in [SAFETY.md](/Users/damzSSD/Projects/emergency-nomad/pipeline-handheld/SAFETY.md).

Most important:
- no destructive actions without explicit user request
- no commits, pushes, rebases, merges, or other VCS writes without explicit user request
- network fetches, when needed, should be executed directly rather than sandbox-dry-run first

## When To Use This

Use it for:
- network policy behavior
- daemon/PWA/API slices
- upstream seam decisions
- offline search/maps/content-sync work

Do not use it for:
- trivial docs
- tiny refactors
- one-file cosmetic fixes

## What You Get

- a scoped request
- a seam decision tied to this fork
- patch-ready delivery bundles per slice
- a verification report that actually cares about the emergency runtime
