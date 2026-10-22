# Security

> Boundary checkpoint (2026-10-22): policy. Report privately; never post a vulnerability in an issue.

Please report vulnerabilities through GitHub's **private vulnerability reporting** for this repository
(the "Report a vulnerability" button under the Security tab; it is enabled), or by email to
**security@madfam.io**. We acknowledge reports within three business days.

## Scope

The live surfaces are `cv.madfam.io` (landing), `cv-app.madfam.io` (pre-launch app shell) and
`cv-api.madfam.io` (API: `/health`, `/ready`, `/api/v1/...`), all served by the code on `main`.
Sign-in and the database are built but dormant until provisioned. The highest-severity findings are:

- **Script execution** on any of the three hosts, or anything that needs the Content-Security-Policy
  relaxed (the HTML hosts use a per-request nonce with `'strict-dynamic'` and no `'unsafe-inline'` or
  `'unsafe-eval'`).
- **Host-routing bypass:** a page or internal route (`/h/...`) reachable on a host that should not
  serve it, or an unknown `Host` that gets anything but a 404 outside `/health` and `/ready`.
- **Credential exposure:** any secret in a commit, log, URL or response.

- **Auth bypass or cross-owner access:** reading or changing another person's profile, items, jobs or
  artifacts; an artifact that references another person's items; a token accepted without RS256, the
  `cv-api` audience or the Janua issuer; a session cookie readable outside `cv-app.madfam.io`.
- **Unintended publication:** a draft, private or suspended artifact readable through a public read, or a
  share link reachable by slug (or the reverse).
- **(W6-A) The pages host `cv-p.madfam.io`** (people's published pages, once activated): script execution under its
  stricter CSP, a cookie read or set there, a link page that leaks its token (Referer, caches, the report link), or a
  page indexed against its owner's choice.
- **(W6-A) Rate-limit bypass** on the unauthenticated reads (the pages host, cv-api `/api/v1/public/*`): a way to make
  one client look like many through anything other than real distinct addresses (the limiter keys on Cloudflare's
  `CF-Connecting-IP` only, IPv6 per /64), or a refused request that still reaches the database.
- **(W6-A) Session lifetime:** a session that stays valid after 7 days without use, or a cookie whose expiry is longer.

## Not in scope

The code preserved at the tag `legacy-2025-09` is not deployed anywhere by this repository.
