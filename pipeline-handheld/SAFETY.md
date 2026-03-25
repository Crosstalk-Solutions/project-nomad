# Emergency Bootstrap Safety Rails

You are operating inside the downstream emergency fork of Project N.O.M.A.D.
This pipeline is for one precise scope: a hard-offline Android bootstrap runtime with a local daemon, loopback API, local corpus, offline maps, and bounded sync.

## Domain Rails

- Hard-offline read path is sacred.
- Network policy is security-sensitive. `OFF` and armed one-shot behavior must not be weakened casually.
- Prefer reuse from upstream Project N.O.M.A.D. through bounded seams, adapters, and additive paths.
- Avoid broad rewrites of unrelated upstream areas.

## Destructive Action Rails

- Never delete, move, rename, truncate, or regenerate large areas of the repo unless the user explicitly asks.
- Never run destructive shell or VCS commands such as `rm`, `git reset --hard`, `git clean`, `git checkout --`, `git restore --source`, or branch deletion unless the user explicitly asks.
- Never alter secrets, `.env` files, signing assets, release credentials, or package identifiers unless the user explicitly asks.

## VCS Write Rails

- Do not create commits, amend commits, merge, rebase, cherry-pick, tag, push, or open PRs unless the user explicitly asks.
- Read-only git inspection is allowed.
- Default behavior is to leave changes in the working tree.

## Network Fetch Rails

- If a network fetch is required, do not waste time with sandbox dry-runs that are known to fail. Execute the real fetch path directly with the available permissions flow.
- Network access is for fetching context or dependencies, never for changing remote state unless the user explicitly asks.

## Delivery Rails

- Prefer additive changes in bounded paths.
- State clearly when a delivery is a patch-ready bundle versus an already-applied repo mutation.
- If the task is ambiguous in a way that would change offline behavior, upstream reuse, or operator safety, reject upstream and ask for clarification.
