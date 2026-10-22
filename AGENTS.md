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
| `cv-app.madfam.io` | app: shell, Janua sign-in (Auth.js, dormant until configured), the same-origin `/api/v1/*` proxy | never; robots disallow all |
| `cv-api.madfam.io` | API: `/api/v1/meta` and the owner-scoped API ([`docs/PRODUCT.md`](docs/PRODUCT.md)) | never; robots disallow all |

`/health` (liveness) and `/ready` (readiness) answer 200 JSON on **any** Host, before host routing
(kubelet probes use the pod IP). Unknown hosts get a plain 404. The container listens on 3000; the
Kubernetes Service publishes 80; every `enclii.yaml` domain pins `port: 80`. Flat labels only (never
`api.cv.madfam.io`). More `cv-*` hosts may come: **the host table is data**
(`HOST_TABLE` in `apps/web/src/lib/config.ts`); never scatter a host literal.

## Required operating doctrine

- Production operations are **Enclii-first**. This repository carries no break-glass procedure and
  no raw cluster, SSH or provider access path.
- Secrets reach production only through the Enclii secret intake (or onboarding, for `cv-secrets`); this repo
  holds secret **names** ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) "Env contract").
- **Dormant by default.** Sign-in and data ship OFF: without every `AUTH_*` value, sign-in routes answer 503
  `not_configured`; without `APP_DATABASE_URL`, data routes do. Nothing reads them at import or build time, and
  `/ready` blocks only on a dependency that IS configured and fails (fail closed).
- **Owner-scoped data, always:** every row carries `owner_sub` (the Janua `sub`); every repository function
  (`apps/web/src/server/db/repository.ts`) takes `ownerSub` first; another person's id is a 404; children use
  composite FKs `(parent_id, owner_sub)`. The only unscoped reads are the two public ones (published only). New
  tables follow the same rules and get cross-owner tests in `apps/web/test-pg/` against a real Postgres, run as
  the `cv_app` role.
- **Never take a ruling** (brand, licence confirmation, prices, tiers, visibility, indexing): prepare
  to the ruling point and list it.
- **Consume the ecosystem seams, never rebuild them** ([`ECOSYSTEM.md`](ECOSYSTEM.md)): identity is
  Janua, money is Dhanam, LLMs go through Selva, deploy/DNS/secrets/status are Enclii, analytics is
  self-hosted Plausible only (R41), messaging goes through Angelia. No Supabase, Prisma, Vercel,
  Railway, Stripe key or LLM provider key in this repo, ever (a test enforces the obvious ones).
- **Sequencing trap:** never expose sign-in before owner-scoped queries and their cross-tenant tests
  exist (they exist since W2: `apps/web/test-pg/`; keep them green before any new table is reachable).
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
| `apps/web/src/auth.ts`, `src/app/api/auth/`, `src/app/auth/` | Auth.js with the Janua OIDC provider; sign-in, account switching (R44) and RP-logout |
| `apps/web/src/lib/auth-env.ts`, `public-origin.ts`, `api-routes.ts` | the env contract and dormancy rules; the public-origin allow-list and CSRF guard; the API route table (shared by the proxy and the handler) |
| `apps/web/src/server/` | `janua.ts` (RS256 JWKS verification), `db/` (schema, client, migrations runner, owner-scoped repository), `api/` (handler, zod bodies, the deterministic job match) |
| `apps/web/drizzle/` | committed SQL migrations (`0001` grants the `cv_app` runtime role) |
| `apps/web/test-pg/`, `test-support/` | the real-Postgres suite (`pnpm test:pg`) and the local RS256/JWKS token fixture |
| `janua.client.yaml` | names only: the `cv-api` resource server and the `cv-web` client the W2 code uses |
| `docs/PRODUCT.md` | the owner requirement and the profile → jobs → tailored artifacts model |
| `scripts/qa/check_file_size.py` | the file-size gate |

## Commands

```bash
corepack enable                 # pnpm at the version in package.json packageManager
pnpm install --frozen-lockfile  # ONE root lockfile (pnpm workspace: apps/*)
pnpm lint                       # eslint, zero warnings
pnpm typecheck                  # next typegen + tsc --noEmit (strict)
pnpm test                       # unit tests (node:test over TypeScript; Node >= 22.18)
pnpm test:pg                    # real-Postgres suite: CV_TEST_OWNER_URL + CV_TEST_APP_URL (db name *_test, role cv_app)
pnpm db:generate                # SQL migrations from apps/web/src/server/db/schema.ts (commit them)
pnpm db:migrate                 # apply them to DIRECT_DATABASE_URL ?? DATABASE_URL (the owner role)
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
typecheck, unit tests, build, standalone smoke), `pg` (the real-Postgres suite on a `postgres:16-alpine`
service container, as the `cv_app` role; fails on fewer than 8 passing tests), `guards` (file size, forbidden-domain grep),
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

W2 (this code, dormant until configured): Janua sign-in on `cv-app.madfam.io` (Auth.js, callback
`/api/auth/callback/janua`), the owner-scoped model of [`docs/PRODUCT.md`](docs/PRODUCT.md) (one profile, jobs,
tailored CVs / portfolios / presentations per job) with cross-owner tests on a real Postgres, and the AI-free
job match. It goes live after the provisioning order in `docs/DEPLOYMENT.md`. Then: the editor and public pages
(W3), money on Dhanam, AI on Selva (W6), and the remaining seams.
