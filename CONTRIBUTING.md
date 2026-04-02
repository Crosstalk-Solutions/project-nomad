# Contributing to Project N.O.M.A.D.

Thank you for your interest in contributing to Project N.O.M.A.D.! Community contributions are what keep this project growing and improving. Please read this guide fully before getting started — it will save you (and the maintainers) a lot of time.

> **Note:** Acceptance of contributions is not guaranteed. All pull requests are evaluated based on quality, relevance, and alignment with the project's goals. The maintainers of Project N.O.M.A.D. ("Nomad") reserve the right accept, deny, or modify any pull request at their sole discretion.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Commit Messages](#commit-messages)
- [Release Notes](#release-notes)
- [Versioning](#versioning)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Feedback & Community](#feedback--community)

---

## Code of Conduct

Please read and review our full [Code of Conduct](https://github.com/Crosstalk-Solutions/project-nomad/blob/main/CODE_OF_CONDUCT.md) before contributing. In short: please be respectful and considerate in all interactions with maintainers and other contributors.

We are committed to providing a welcoming environment for everyone. Disrespectful or abusive behavior will not be tolerated. 

---

## Before You Start

**Open an issue first.** Before writing any code, please [open an issue](../../issues/new) to discuss your proposed change. This helps avoid duplicate work and ensures your contribution aligns with the project's direction.

When opening an issue:
- Use a clear, descriptive title
- Describe the problem you're solving or the feature you want to add
- If it's a bug, include steps to reproduce it and as much detail about your environment as possible
- Ensure you redact any personal or sensitive information in any logs, configs, etc.

---

## Getting Started with Contributing
**Please note**: this is the Getting Started guide for developing and contributing to Nomad, NOT [installing Nomad](https://github.com/Crosstalk-Solutions/project-nomad/blob/main/README.md) for regular use! 

### Prerequisites

- A Debian-based OS (Ubuntu recommended)
- `sudo`/root privileges
- Docker installed and running
- A stable internet connection (required for dependency downloads)
- Node.js (for frontend/admin work)

### Fork & Clone

1. Click **Fork** at the top right of this repository
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/project-nomad.git
   cd project-nomad
   ```
3. Add the upstream remote so you can stay in sync:
   ```bash
   git remote add upstream https://github.com/Crosstalk-Solutions/project-nomad.git
   ```

### Avoid Installing a Release Version Locally
Because Nomad relies heavily on Docker, we actually recommend against installing a release version of the project on the same local machine where you are developing. This can lead to conflicts with ports, volumes, and other resources. Instead, you can run your development version in a separate Docker environment while keeping your local machine clean. It certainly __can__ be done, but it adds complexity to your setup and workflow. If you choose to install a release version locally, please ensure you have a clear strategy for managing potential conflicts and resource usage.

---

## Development Workflow

1. **Sync with upstream** before starting any new work. We prefer rebasing over merge commits to keep a clean, linear git history as much as possible (this also makes it easier for maintainers to review and merge your changes). To sync with upstream:
   ```bash
   git fetch upstream
   git checkout dev
   git rebase upstream/dev
   ```

2. **Create a feature branch** off `dev` with a descriptive name:
   ```bash
   git checkout -b fix/issue-123
   # or
   git checkout -b feature/add-new-tool
   ```

3. **Make your changes.** Follow existing code style and conventions. Test your changes locally against a running N.O.M.A.D. instance before submitting.

4. **Add release notes** (see [Release Notes](#release-notes) below).

5. **Commit your changes** using [Conventional Commits](#commit-messages).

6. **Push your branch** and open a pull request.

---

## Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/). All commit messages must follow this format:

```
<type>(<scope>): <description>
```

**Common types:**

| Type | When to use |
|------|-------------|
| `feat` | A new user-facing feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `refactor` | Code change that isn't a fix or feature and does not affect functionality |
| `chore` | Build process, dependency updates, tooling |
| `test` | Adding or updating tests |

**Scope** is optional but encouraged — use it to indicate the area of the codebase affected (e.g., `api`, `ui`, `maps`).

**Examples:**
```
feat(ui): add dark mode toggle to Command Center
fix(api): resolve container status not updating after restart
docs: update hardware requirements in README
chore(deps): bump docker-compose to v2.24
```

---

## Release Notes

Human-readable release notes live in [`admin/docs/release-notes.md`](admin/docs/release-notes.md) and are displayed directly in the Command Center UI.

If your PR is merged in, the maintainers will update the release notes with a summary of your contribution and credit you as the author. You do not need to add this yourself in the PR (please don't, as it may cause merge conflicts), but you can include a suggested note in the PR description if you like.

---

## Versioning

This project uses [Semantic Versioning](https://semver.org/). Versions are managed in the root `package.json` and updated automatically by `semantic-release`. The `project-nomad` Docker image uses this version. The `admin/package.json` version stays at `0.0.0` and should not be changed manually.

---

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin your-branch-name
   ```
2. Open a pull request against the `dev` branch of this repository
3. In the PR description:
   - Summarize what your changes do and why
   - Reference the related issue (e.g., `Closes #123`)
   - Note any relevant testing steps or environment details
4. Be responsive to feedback — maintainers may request changes. Pull requests with no activity for an extended period may be closed.

---

## Feedback & Community

Have questions or want to discuss ideas before opening an issue? Join the community:

- **Discord:** [Join the Crosstalk Solutions server](https://discord.com/invite/crosstalksolutions) — the best place to get help, share your builds, and talk with other N.O.M.A.D. users
- **Website:** [www.projectnomad.us](https://www.projectnomad.us)
- **Benchmark Leaderboard:** [benchmark.projectnomad.us](https://benchmark.projectnomad.us)

---

*Project N.O.M.A.D. is licensed under the [Apache License 2.0](LICENSE).*