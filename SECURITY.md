# Security

> Boundary checkpoint (2026-10-22): policy. Report privately; never post a vulnerability in an issue.

Please report vulnerabilities through GitHub's **private vulnerability reporting** for this repository
(the "Report a vulnerability" button under the Security tab; it is enabled), or by email to
**security@madfam.io**. We acknowledge reports within three business days.

## Scope

The live surfaces are `cv.madfam.io` (landing), `cv-app.madfam.io` (pre-launch app shell) and
`cv-api.madfam.io` (API: `/health`, `/ready`, `/api/v1/meta`), all served by the code on `main`.
Wave 1 has no accounts, no database, no uploads and no secret, so the highest-severity findings
today are:

- **Script execution** on any of the three hosts, or anything that needs the Content-Security-Policy
  relaxed (the HTML hosts use a per-request nonce with `'strict-dynamic'` and no `'unsafe-inline'` or
  `'unsafe-eval'`).
- **Host-routing bypass:** a page or internal route (`/h/...`) reachable on a host that should not
  serve it, or an unknown `Host` that gets anything but a 404 outside `/health` and `/ready`.
- **Credential exposure:** any secret in a commit, log, URL or response.

From the next wave (Janua sign-in, owner-scoped data): auth bypass and cross-tenant access to a
portfolio are the top findings.

## Not in scope

The code preserved at the tag `legacy-2025-09` is not deployed anywhere by this repository.
