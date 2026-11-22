# Security

> Boundary checkpoint (2026-10-22): policy. Report privately; never post a vulnerability in an issue.

Please report vulnerabilities through GitHub's **private vulnerability reporting** for this repository
(the "Report a vulnerability" button under the Security tab; it is enabled), or by email to
**security@madfam.io**. We acknowledge reports within three business days.

## Scope

The live surfaces are four hosts served by the code on `main` from one container: `cv.madfam.io` (landing),
`cv-app.madfam.io` (the app: Janua sign-in, invite-only private beta), `cv-api.madfam.io` (API: `/health`, `/ready`,
`/api/v1/...`) and `cv-p.madfam.io` (the pages people choose to publish). Sign-in and the database are live. The
highest-severity findings are:

- **Script execution** on any of the four hosts, or anything that needs the Content-Security-Policy
  relaxed (the HTML hosts use a per-request nonce with `'strict-dynamic'` and no `'unsafe-inline'` or
  `'unsafe-eval'`).
- **Host-routing bypass:** a page or internal route (`/h/...`) reachable on a host that should not
  serve it, or an unknown `Host` that gets anything but a 404 outside `/health` and `/ready`.
- **Credential exposure:** any secret in a commit, log, URL or response.

- **Auth bypass or cross-owner access:** reading or changing another person's profile, items, jobs or
  artifacts; an artifact that references another person's items; a token accepted without RS256, the
  `cv-api` audience, the Janua issuer or an accepted client (the `cv-app` client, unless `CV_JANUA_CLIENT_IDS` names
  others); a session cookie readable outside `cv-app.madfam.io`.
- **Unintended publication:** a draft, private or suspended artifact readable through a public read, or a
  share link reachable by slug (or the reverse).
- **(W6-A) The pages host `cv-p.madfam.io`** (people's published pages): script execution under its
  stricter CSP, a cookie read or set there, a link page that leaks its token (Referer, caches, the report link), or a
  page indexed against its owner's choice.
- **(W6-A) Rate-limit bypass** on the unauthenticated reads (the pages host, cv-api `/api/v1/public/*`): a way to make
  one client look like many through anything other than real distinct addresses (the limiter keys on Cloudflare's
  `CF-Connecting-IP` only, IPv6 per /64), or a refused request that still reaches the database.
- **(W6-A) Session lifetime:** a session that stays valid after 7 days without use, or a cookie whose expiry is longer.

## Not in scope

The code preserved at the tag `legacy-2025-09` is not deployed anywhere by this repository.
