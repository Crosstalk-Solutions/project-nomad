# Security Policy

## Supported Versions

Only the latest released version of Project NOMAD receives security fixes. If
you are running an older release, please update before reporting an issue.

## Reporting a Vulnerability

**Please do not open a public issue for a security vulnerability.**

Report it privately using GitHub's built-in reporting form:

1. Go to the [Security tab](https://github.com/Crosstalk-Solutions/project-nomad/security)
2. Click **Report a vulnerability**

This creates a private advisory that only the maintainers can see. It stays
private until a fix is available and we choose to publish it.

If you cannot use that form for any reason, email
**chris@crosstalksolutions.com** instead. Please do not include exploit details
in a Discord message or a public issue.

### What to include

The more of this you can provide, the faster we can confirm and fix it:

- The version of NOMAD you tested against, and the host OS
- Which component is affected (Command Center, installer, updater sidecar, a
  Supply Depot app, the benchmark submission path, and so on)
- Steps to reproduce, ideally with the exact request or command
- What an attacker gains, and what access they need to start with
- Any suggested fix, if you have one

### What to expect

Project NOMAD is maintained by a very small team, so we do not offer a
guaranteed response time. We read every report. If a report is valid, we will
work with you on a fix and credit you in the published advisory unless you
would rather stay anonymous.

We do not run a bug bounty program and cannot offer payment for reports.

## Scope

### In scope

- Remote code execution, container escape, or privilege escalation on the host
- Any path where a remote party who is **not** on the local network can affect a
  NOMAD instance, including attacks delivered through a user's browser
- Unauthenticated access to data outside the NOMAD storage root
- Path traversal, SSRF that reaches beyond the intended target, or injection in
  the Command Center API
- Supply chain problems in our build and release pipeline
- Credentials or secrets committed to this repository

### Out of scope

Some things that look like vulnerabilities are deliberate design decisions for
an offline, single-appliance, local-network product. Reports covering the
following will usually be closed:

- **No authentication on the Command Center.** This is intentional and
  documented in the [README](README.md#about-security). NOMAD is designed to be
  open on a trusted local network. If you need access control, use
  network-level controls. There is an open roadmap item if you want to vote for
  optional authentication:
  https://roadmap.projectnomad.us/posts/1/user-authentication-please-build-in-user-auth-with-admin-user-roles
- **Anything that requires exposing NOMAD directly to the internet.** This is
  explicitly unsupported and advised against.
- **Access by someone who is already on the local network.** Local network
  access is the trust boundary by design.
- **Requests to internal or private addresses.** NOMAD is expected to reach
  other hosts on the local network, so RFC1918 destinations are not treated as
  SSRF.
- The benchmark submission signing key. It ships inside the image because an
  offline appliance cannot hold a server-side secret. Forged submissions are
  handled by moderation on the leaderboard, not by the key.
- Missing security headers, missing rate limits, or similar findings with no
  demonstrated impact on an appliance of this design.
- Vulnerabilities in third-party Supply Depot applications. Please report those
  to the upstream project. Tell us anyway if the issue is caused by how NOMAD
  configures or deploys the app.
- Findings from an automated scanner with no working proof of concept.

If you are not sure whether something is in scope, report it. We would rather
read an out-of-scope report than miss a real one.

## Secrets in this Repository

Secret scanning and push protection are enabled on this repository. If you
believe a credential has been committed, report it privately using the process
above rather than opening an issue, so it can be rotated before it is
advertised.

Note that the installer generates every database password and application key
locally at install time. The placeholder values in
`install/management_compose.yaml` are not real credentials.
