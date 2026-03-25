# /state — Emergency Bootstrap State Layer

This folder is the spine of the project-specific network. Every phase reads from here and writes to here.

## Structure

```
/state
  status.json           # where you are, what slices are blocked
  scope.yaml            # reduced task scope for this runtime
  seams.yaml            # upstream reuse and slice plan
  verification.yaml     # repo-specific verification result
  slices/
    slice-a.yaml        # seeded manifest per implementation slice
    slice-b.yaml
  outputs/
    slice-a/
      delivery.md       # current delivery bundle for the slice
    slice-b/
      delivery.md
```

## Rules

1. Every phase reads input from `/state`
2. Every phase writes durable output to `/state`
3. `status.json` is updated after every phase transition
4. If it is not in `/state`, downstream cannot rely on it
5. Slice manifests are seeded from `seams.yaml`
6. Safety rails still apply even when a delivery is blocked

## Status Values

### Phase status
- `pending`
- `in_progress`
- `done`
- `failed`

### Slice status
- `pending`
- `building`
- `built`
- `blocked`
- `fixing`
- `patched`
- `failed`

## Resume Rule

1. Open `status.json`
2. Find current phase and any blocked slices
3. Load the right `AGENTS.md`
4. Feed it the relevant artifacts from `/state`
5. Continue from the last durable artifact, not from memory
