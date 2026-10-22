# ai-portfolio-builder (MADFAM CV) — agent operating guide

> Last Updated: 2026-10-22

<!-- MADFAM-AGENTS-CANONICAL v1 -->

> **Boundary checkpoint (2026-10-22, platform ops):** public repository. Operational detail that
> would reveal MADFAM's posture (cluster topology, secret paths and values, break-glass procedures,
> operator runbooks, client identities, people) lives in MADFAM's private ops repository and is only
> pointed to from here. The rules are the repo-boundary contract, summarised in
> [`docs/REPO_BOUNDARY.md`](docs/REPO_BOUNDARY.md). Never copy that detail in.

This is the canonical instruction file for Claude, Codex and any other LLM agent working in this
repository. `CLAUDE.md` is only a compatibility redirect. Read this file before touching the repo.

**Commit trailer rule.** Every agent commit ends with a `Co-Authored-By:` trailer naming the model
that wrote it. Pull request bodies end with the Claude Code line. Conventional commits.

## What this is

An AI-assisted portfolio / CV builder from Innovaciones MADFAM, **incubating, pre-launch**. The
product name is **not ruled**: the working label `MADFAM CV` renders from one constant
(`apps/web/src/lib/brand.ts`), so a ruled brand is a one-line change. The repository name stays
`ai-portfolio-builder`.

The tree was **rebuilt from scratch on 2026-10-22** (wave 1, "fresh baseline"). The previous code
(Supabase, Prisma, Vercel, Railway, next-auth, Stripe, HuggingFace, in-repo `@madfam/*` packages) is
preserved at the git tag **`legacy-2025-09`** (`7959f356`) for reference only. **Do not port from it**
unless the piece is rebuilt to this tree's standard (owner-scoped data, tests first, ecosystem seams).

## Topology (decided 2026-10-22, owner-named hosts)

One Enclii project and one Service, both **`cv`** (namespace `cv`). One container serves three hosts,
routed by the `Host` header:

| Host | Role | Indexing |
|---|---|---|
| `cv.madfam.io` | landing (es-MX at `/`, en at `/en`) | `noindex` until the brand is ruled (`CV_INDEXABLE`); robots allow AI crawlers (R40) |
| `cv-app.madfam.io` | app (pre-launch shell; Janua sign-in next wave) | never; robots disallow all |
| `cv-api.madfam.io` | API: `/api/v1/meta` (more under `/api/v1/` later) | never; robots disallow all |

`/health` (liveness) and `/ready` (readiness) answer 200 JSON on **any** Host, before host routing
(kubelet probes use the pod IP). Unknown hosts get a plain 404. The container listens on 3000; the
Kubernetes Service publishes 80; every `enclii.yaml` domain pins `port: 80`. Flat labels only (never
`api.cv.madfam.io`). More `cv-*` hosts may come: **the host table is data**
(`HOST_TABLE` in `apps/web/src/lib/config.ts`); never scatter a host literal.

## Required operating doctrine

- Production operations are **Enclii-first**. This repository carries no break-glass procedure and
  no raw cluster, SSH or provider access path.
- Secrets reach production only through the Enclii secret intake; this repo holds secret **names**.
  Wave 1 needs none.
- **Never take a ruling** (brand, licence confirmation, prices, tiers, visibility, indexing): prepare
  to the ruling point and list it.
- **Consume the ecosystem seams, never rebuild them** ([`ECOSYSTEM.md`](ECOSYSTEM.md)): identity is
  Janua, money is Dhanam, LLMs go through Selva, deploy/DNS/secrets/status are Enclii, analytics is
  self-hosted Plausible only (R41), messaging goes through Angelia. No Supabase, Prisma, Vercel,
  Railway, Stripe key or LLM provider key in this repo, ever (a test enforces the obvious ones).
- **Sequencing trap:** never expose sign-in before owner-scoped queries and their cross-tenant tests
  exist.
- **Truth in copy:** no invented users, metrics, logos or testimonials (R85); anything not built says
  "próximamente"; the incubating CTA is a waitlist (R29); legal entity "Innovaciones MADFAM S.A.S. de
  C.V." · Cuernavaca, Morelos (R37/R47); mailboxes only `hola@`, `privacy@`, `legal@`, `security@`,
  `support@madfam.io` (R61). The `.com` domain that shares MADFAM's name is a third party's: never
  link or mail it (a test and a CI guard enforce it).
- File size: warn above 600 lines, refactor before 800 (CI gate).
- Every check prints a read-proof line; "scanned zero" is a failure, never a pass.

## Layout

| Path | What it is |
|---|---|
| `apps/web/src/proxy.ts` | Next.js 16 Proxy (Node runtime): applies `lib/routing.ts` decisions and `lib/headers.ts` headers |
| `apps/web/src/lib/config.ts` | the host table and strict env validation (`CV_HOST_*`, `CV_INDEXABLE`, `CV_REVISION`) |
| `apps/web/src/lib/routing.ts` | pure routing: probes on any Host, exact host match, per-role path allowlists rewritten to internal `/h/...` routes |
| `apps/web/src/lib/headers.ts` | nonce CSP, security headers, `X-Robots-Tag` |
| `apps/web/src/lib/robots.ts`, `meta.ts`, `copy.ts`, `brand.ts` | robots/sitemap, probe and meta bodies, es/en copy, the working label |
| `apps/web/src/app/h/...` | internal routes (never public: no Host allowlist names them) |
| `apps/web/test/` | unit tests (`node:test`, Node type stripping) |
| `apps/web/test-server/` | smoke test over the built standalone server, per Host |
| `Dockerfile`, `infra/k8s/production/`, `enclii.yaml`, `.github/workflows/build-deploy.yml` | the one image, its kustomize base (digest pinned by Build & Deploy), the Enclii manifest, the dispatch-only build caller |
| `janua.client.yaml` | names only, for the next wave |
| `scripts/qa/check_file_size.py` | the file-size gate |

## Commands

```bash
corepack enable                 # pnpm at the version in package.json packageManager
pnpm install --frozen-lockfile  # ONE root lockfile (pnpm workspace: apps/*)
pnpm lint                       # eslint, zero warnings
pnpm typecheck                  # next typegen + tsc --noEmit (strict)
pnpm test                       # unit tests (node:test over TypeScript; Node >= 22.18)
pnpm build                      # Next.js standalone build
pnpm test:server                # boots the standalone server, checks every host
python3 scripts/qa/check_file_size.py
```

Local hosts: `CV_HOST_LANDING=cv.localhost CV_HOST_APP=cv-app.localhost CV_HOST_API=cv-api.localhost pnpm --filter @cv/web dev`,
then open `http://cv.localhost:3000/` (browsers resolve `*.localhost` to loopback).

## CI lanes

Public repository: every job runs on **GitHub-hosted** runners (R116). Top-level
`permissions: contents: read`; every action pinned to a full commit SHA; no `secrets: inherit`; no
`|| true` masks. `ci.yml`: `agent-docs` (required files and markers), `web` (frozen install, lint,
typecheck, unit tests, build, standalone smoke), `guards` (file size, forbidden-domain grep),
`secrets` (gitleaks over every commit after the legacy base `7959f356`, plus the checked-out tree;
the legacy history was scanned in full by the 2026-10-22 audit). `image.yml` builds the Dockerfile on
pull requests that touch its inputs (no push) and smoke-tests it read-only as uid 1001 across all
hosts. `build-deploy.yml` is **dispatch-only** (Enclii's reusable build-publish pinned by SHA,
`build_runner: ubuntu-24.04`); a merge never deploys by itself.

## Licences

Platform code AGPL-3.0-only; documentation MIT; licence holder Innovaciones MADFAM S.A.S. de C.V.
(R72). AGPL is the recorded recommendation (audit decision D4) applied as the default for a new
MADFAM platform repo; **the owner confirms it at merge of the baseline pull request.**

## Pending rulings

- **Brand / product name** (D2): working label only; naming sweep through LexiDrop. `noindex` stays
  on until ruled.
- **Licence confirmation** (D4): AGPL-3.0-only applied as the default.
- **Product scope** (D1): recommended standalone, one core journey (sign in → create → edit →
  publish); CV import decided with the AI wave.
- **Repository `homepage`**: set by the coordinator after go-live.

## What comes next

Next wave: Janua sign-in on `cv-app.madfam.io` (Auth.js Janua provider, callback
`/api/auth/callback/janua`; `/api/auth/*` is deliberately unclaimed today) and an owner-scoped data
model (Drizzle on Postgres through the platform pooler) with cross-tenant tests first. Then the core
journey, money on Dhanam, AI on Selva, and the remaining seams.
