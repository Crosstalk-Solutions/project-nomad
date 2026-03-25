# Emergency Bootstrap Prompt

Use this brief when scaffolding emergency-specific work in this downstream fork.

## Goal

Build an emergency runtime profile on top of Project N.O.M.A.D. that favors hard-offline usefulness, local search, and bounded sync.

## Constraints

- Keep upstream compatibility where practical.
- Prefer additive paths over invasive rewrites.
- Assume the device is a dedicated Android or Ubuntu handheld.
- Keep v1 deterministic: search, excerpt, source, maps.
- Do not make LLM or vector infrastructure a hard runtime dependency.

## Network model

- Base policy: `ON` or `OFF`
- Explicit exception: armed one-shot sync
- One-shot must support:
  - bounded scope
  - timeout
  - byte cap setting
  - download count cap setting
  - auto-disarm

## Quality bar

- Keep the read path local.
- Keep network usage explicit.
- Keep the delta against upstream small and understandable.
- Prefer boring and reliable over clever abstractions.
