# Emergency Bootstrap Agent Network

Personal asset. Not a deliverable. This is a project-specific development network for the Android emergency bootstrap runtime in this fork.

## Definition
Local orchestration pipeline for one domain only:

- Android-first emergency bootstrap application
- hard-offline read path
- local daemon + loopback API
- bounded sync and network policy
- incremental reuse of Project N.O.M.A.D.

This is not a generic "systems that build systems" pipeline anymore.

## Flow
```
Request → [Scope] → [Seam] → [Runtime] → [Verify] → Apply or Ship Review
             ↑         ↑          ↓          ↓
             └── reject┴──── [Repair] ←──────┘
```

All durable artifacts live in `/state`.

## Agents

| # | Agent | Job | Reads from /state | Writes to /state |
|---|-------|-----|-------------------|------------------|
| 1 | Scope | Turn a request into one emergency-runtime slice | brief | `scope.yaml` |
| 2 | Seam | Decide upstream reuse, boundaries, and slice plan | `scope.yaml` + emergency docs | `seams.yaml` |
| 3 | Runtime | Build one implementation slice end-to-end | `slices/X.yaml` + project docs | `outputs/X/delivery.md` |
| 4 | Verify | Judge offline fit, network-policy correctness, and repo safety | all outputs + project docs | `verification.yaml` |
| 5 | Repair | Rewrite one failed slice delivery locally | failed delivery + verification | `outputs/X/delivery.md` |

## Shared Safety

Every agent run gets [SAFETY.md](/Users/damzSSD/Projects/emergency-nomad/pipeline-handheld/SAFETY.md) prepended by the router. That file is where destructive-action and VCS-write autonomy are cut down hard.

## State Layer

```
/state
  status.json          # phase and slice tracking
  scope.yaml           # request reduced to one emergency slice
  seams.yaml           # upstream reuse and slice plan
  verification.yaml    # project-specific verification result
  slices/              # per-slice manifests seeded from seams.yaml
  outputs/             # per-slice delivery bundles
```

See `state/STATE.md` for rules.

## Scripts

- `scripts/status.py` — inspect live pipeline state
- `scripts/router.sh` — runs the agent network with shared safety rails
- `scripts/brief.sh` — write a brief and optionally start the pipeline

## Design Principles

- Hard-offline is the center of truth.
- Upstream reuse is a seam decision, not an afterthought.
- Work is organized as repo slices, not abstract services.
- Verification is domain-specific: offline behavior, one-shot policy, loopback boundaries, and delta against N.O.M.A.D.
- VCS write actions are not autonomous.
