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
| **pages host, label pending** (working label `cv-p.madfam.io`, env `CV_HOST_PAGES`) | user pages: `/<slug>` (public artifact), `/l/<token>` (link-shared) | per page: public only when its owner chose `indexable`; otherwise `noindex, nofollow, noai, noimageai`; `/l/*` always noindex, `no-store`, `no-referrer` |

The pages host is **inert until `CV_HOST_PAGES` is set**: the row exists in the host table (W3-1), but the owner
has not named the label, so no request is routed to it and `enclii.yaml` / DNS do not carry it yet (coordinator:
domain, tunnel, domain-map row, decision addendum, gate `cv.pages-live`). Its own strict CSP (`default-src 'none'`,
`form-action 'none'`, `base-uri 'none'`), no cookies read or set, an abuse link to `legal@madfam.io` on every page.

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
| `apps/web/src/lib/robots.ts`, `meta.ts`, `brand.ts` | robots/sitemap, probe and meta bodies, the working label |
| `apps/web/src/lib/copy/` | es-MX (source) and en strings per surface: `landing.ts`, `app.ts` (shared app strings and kind labels), `pages.ts`; one file per follow-on PR: `profile.ts`, `jobs.ts`, `render.ts` |
| `apps/web/src/lib/app-routes.ts` | every app page of the core journey, declared once (typed builders `appPath.*`, matcher, nav) |
| `apps/web/src/lib/client/` | the cv-app data layer: typed `fetch` to the same-origin `/api/v1/*` proxy, results not exceptions, dormant-aware (`not_configured`) |
| `apps/web/src/components/ui/` | app-owned UI primitives (R1): Button, fields, Notice/EmptyState/ErrorState/Badge, layout, nav, Toast, ConfirmDialog (native `<dialog>`), icons; CSS Modules, never a `style` prop |
| `apps/web/src/components/app/` | `AppFrame` (dormant / signed-out / signed-in states, nav, account switching), `UnderConstruction`, page param helpers |
| `apps/web/src/components/render/`, `src/app/h/pages/` | the artifact renderers, one per kind (`model.ts` resolves the content against the owner's profile; `ArtifactView` is the (kind, template) registry), shared by the app's preview/print and the pages-host routes; `src/server/pages-gate.ts` lets the proxy 404 or set per-page headers before rendering |
| `apps/web/src/components/import/`, `src/app/h/app/[locale]/ajustes/` | W4-I data portability: the in-browser LinkedIn-export ZIP / JSON Resume import (no dependency: `DecompressionStream`), and download / delete of everything the person holds (`server/db/data-rights.ts`, `server/api/portability.ts`) |
| `apps/web/e2e/`, `playwright.config.ts` | Playwright over the built standalone server: `e2e/support/serve.ts` (throwaway DB, local JWKS, test-only token/cookie mint), one spec per surface |
| `apps/web/src/app/h/...` | internal routes (never public: no Host allowlist names them) |
| `apps/web/test/` | unit tests (`node:test`, Node type stripping) |
| `apps/web/test-server/` | smoke test over the built standalone server, per Host |
| `Dockerfile`, `infra/k8s/production/`, `enclii.yaml`, `.github/workflows/build-deploy.yml` | the one image, its kustomize base (digest pinned by Build & Deploy), the Enclii manifest, the dispatch-only build caller |
| `apps/web/src/auth.ts`, `src/app/api/auth/`, `src/app/auth/` | Auth.js with the Janua OIDC provider; sign-in, account switching (R44) and RP-logout |
| `apps/web/src/lib/auth-env.ts`, `public-origin.ts`, `api-routes.ts` | the env contract and dormancy rules; the public-origin allow-list and CSRF guard; the API route table (shared by the proxy and the handler) |
| `apps/web/src/server/` | `janua.ts` (RS256 JWKS verification), `db/` (schema, client, migrations runner, owner-scoped repository), `api/` (handler, zod bodies, the deterministic job match) |
| `apps/web/drizzle/` | committed SQL migrations (`0001` grants the `cv_app` runtime role) |
| `apps/web/src/server/metrics*.ts` | observability (W4): the dependency-free registry, route-template labels, process metrics, and the internal `/metrics` listener on `CV_METRICS_PORT` (9090) plus the JSON request log, started from `src/instrumentation.ts` ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) "Observability") |
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
pnpm test:e2e                   # Playwright (Chromium) over the built server: CV_TEST_OWNER_URL + CV_TEST_APP_URL as test:pg
python3 scripts/qa/check_file_size.py
```

Local hosts: `CV_HOST_LANDING=cv.localhost CV_HOST_APP=cv-app.localhost CV_HOST_API=cv-api.localhost pnpm --filter @cv/web dev`,
then open `http://cv.localhost:3000/` (browsers resolve `*.localhost` to loopback).

## CI lanes

Public repository: every job runs on **GitHub-hosted** runners (R116). Top-level
`permissions: contents: read`; every action pinned to a full commit SHA; no `secrets: inherit`; no
`|| true` masks. `ci.yml`: `agent-docs` (required files and markers), `web` (frozen install, lint,
typecheck, unit tests, build, standalone smoke), `pg` (the real-Postgres suite on a `postgres:16-alpine`
service container, as the `cv_app` role; fails on fewer than 12 passing tests), `e2e` (Playwright on GitHub-hosted runners:
`npx playwright install --with-deps chromium`, the built server, its own Postgres service; fails on fewer than 9
passing specs or any failed, flaky or skipped), `guards` (file size, forbidden-domain grep),
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
- **Pages host label** (lane X §3): working label `cv-p.madfam.io`; inert until named. Abuse mailbox `legal@madfam.io`
  (recommended over `support@`; owner to confirm).

## App routes and W3 directory ownership

Every app page is declared once in `apps/web/src/lib/app-routes.ts` (English under `/en/...`; `:id` is a UUID):
`/` · `/perfil` · `/empleos` · `/empleos/:id` · `/empleos/:id/adaptar` · `/documentos` · `/documentos/:id` ·
`/documentos/:id/vista-previa` · `/documentos/:id/imprimir` · `/ajustes`. Each renders inside `AppFrame` and shows an
honest «En construcción» until its PR lands. The pages host serves `/<slug>` and `/l/<token>`.

After W3-1 (foundation) merges, three PRs run in parallel on disjoint directories:

| PR | Owns (create and edit freely) |
|---|---|
| **W3-2** core profile editor | `apps/web/src/app/h/app/[locale]/perfil/**`, `src/components/profile/**`, `src/lib/copy/profile.ts`, `e2e/profile*.spec.ts`, `test/profile*.test.ts` |
| **W3-3** jobs, pipeline, tailoring | `apps/web/src/app/h/app/[locale]/empleos/**`, `src/components/jobs/**`, `src/lib/copy/jobs.ts`, `e2e/jobs*.spec.ts`, `test/jobs*.test.ts` |
| **W3-4** renderers, preview, print, publish | `apps/web/src/app/h/app/[locale]/documentos/**`, `src/app/h/pages/**`, `src/components/render/**`, `src/lib/copy/render.ts`, `src/lib/copy/pages.ts`, `e2e/pages*.spec.ts`, `e2e/documents*.spec.ts`, `test/render*.test.ts` |

Everything else stays W3-1's and is **append-only** for the three: routing, config, headers, robots, `app-routes.ts`,
`api-routes.ts`, the server (`schema.ts`, `repository.ts`, `validation.ts`, `handler.ts`, migrations), `lib/client/**`,
`components/ui/**`, `components/app/**`, `lib/copy/{landing,app}.ts`, `globals.css`, `playwright.config.ts`,
`e2e/support/**`, CI and the lockfile. A PR that needs a new API route or repository function appends exactly that
(with its cross-owner test in `test-pg/`) and says so in its body; styles go in CSS Modules inside the PR's own
directory. The API the three need already exists: profile and items (plus `POST /profile/items/reorder`), jobs and
`/match`, artifacts (plus `POST /artifacts/batch`, all-or-none), publish/unpublish (429 `publish_limit` after 20 a day).

## What comes next

W2 (this code, dormant until configured): Janua sign-in on `cv-app.madfam.io` (Auth.js, callback
`/api/auth/callback/janua`), the owner-scoped model of [`docs/PRODUCT.md`](docs/PRODUCT.md) (one profile, jobs,
tailored CVs / portfolios / presentations per job) with cross-owner tests on a real Postgres, and the AI-free
job match. It goes live after the provisioning order in `docs/DEPLOYMENT.md`. W3-1 (foundation): the route map, the
app frame, UI primitives, the client data layer, the inert pages host with a minimal renderer, the Playwright harness.
Then W3-2 / W3-3 / W3-4 in parallel (ownership table above), money on Dhanam, AI on Selva (W6), and the remaining
seams.
