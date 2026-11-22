# ai-portfolio-builder (MADFAM CV) — agent operating guide

> Last Updated: 2026-11-21

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

An AI-assisted portfolio / CV builder from Innovaciones MADFAM, **incubating; invite-only private beta since
2026-11** (what is live: [`README.md`](README.md) «What is live, honestly»; the rules: [`docs/PRODUCT.md`](docs/PRODUCT.md);
the look: [`docs/DESIGN.md`](docs/DESIGN.md)). The
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

**W6-A update (2026-10-22):** the owner approved **`cv-p.madfam.io`**. `CV_HOST_PAGES` is set in
`infra/k8s/production/deployment.yaml` and the domain is in `enclii.yaml`; the host answers once the coordinator runs
domains reconcile and tunnels-apply (docs/DEPLOYMENT.md "Pages host"). Its reads and cv-api's public reads are rate
limited per client before any lookup (`apps/web/src/server/read-limit.ts`; `CF-Connecting-IP` only, never
`X-Forwarded-For`). Sign-in sessions expire after 7 days without use (`SESSION_OPTIONS`, `lib/auth-env.ts`). The landing
also serves `/lector` and `/en/lector` (`LANDING_PAGES` in `lib/routing.ts`), the page the job reader's User-Agent links to.

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
| `apps/web/src/components/import/`, `src/app/h/app/[locale]/ajustes/` | W4-I data portability: the in-browser LinkedIn-export ZIP / JSON Resume import (no dependency: `DecompressionStream`), and download / delete of everything the person holds (`server/db/data-rights.ts`, `server/api/portability.ts`); the LinkedIn profile PDF import (`linkedin-pdf.ts`, pdf.js via `jobs/intake/pdf.ts`, behind `CV_IMPORT_LINKEDIN_PDF`, on in production since 2026-11-16: `lib/import-config.ts`) |
| `apps/web/src/server/ingest/`, `src/components/jobs/intake/`, `src/app/h/app/[locale]/empleos/{nuevo,capturar}/` | W5-J job intake: the SSRF-guarded one-shot fetcher (`fetcher.ts`, `net.ts`, `robots.ts`), board policy, ATS public APIs, JSON-LD / microdata / text extraction, `POST /api/v1/jobs/intake` (preview only); in the browser: PDF text (pdf.js, lazy), DOCX, HTML files and the «Capturar vacante» bookmark (fragment hand-off to `/empleos/capturar`). Typed job columns: migration `0002`, vocabularies in `server/ingest/vocab.ts` ([`docs/PRODUCT.md`](docs/PRODUCT.md) "Job intake") |
| `apps/web/src/lib/templates.ts` | the template registry (kind → templates, es/en labels, trade-off, ATS note): the API allowlist, the renderer table's keys and the pickers' source; ids append-only |
| `apps/web/e2e/`, `playwright.config.ts` | Playwright over the built standalone server: `e2e/support/serve.ts` (throwaway DB, local JWKS, test-only token/cookie mint), one spec per surface |
| `apps/web/src/app/h/...` | internal routes (never public: no Host allowlist names them) |
| `apps/web/test/` | unit tests (`node:test`, Node type stripping) |
| `apps/web/test-server/` | smoke test over the built standalone server, per Host |
| `Dockerfile`, `infra/k8s/production/`, `enclii.yaml`, `.github/workflows/build-deploy.yml` | the one image, its kustomize base (digest pinned by Build & Deploy), the Enclii manifest, the dispatch-only build caller |
| `apps/web/src/auth.ts`, `src/app/api/auth/`, `src/app/auth/` | Auth.js with the Janua OIDC provider; sign-in, account switching (R44) and RP-logout |
| `apps/web/src/lib/auth-env.ts`, `public-origin.ts`, `api-routes.ts` | the env contract and dormancy rules; the public-origin allow-list and CSRF guard; the API route table (shared by the proxy and the handler) |
| `apps/web/src/server/` | `janua.ts` (RS256 JWKS verification), `db/` (schema, client, migrations runner, owner-scoped repository), `api/` (handler, zod bodies, the deterministic job match) |
| `apps/web/drizzle/` | committed SQL migrations: `0001` grants the `cv_app` runtime role, `0002` typed job columns, `0003` bilingual `translations`, `0004` the `recommendation` item kind |
| `apps/web/src/server/metrics*.ts` | observability (W4): the dependency-free registry, route-template labels, process metrics, and the internal `/metrics` listener on `CV_METRICS_PORT` (9090) plus the JSON request log, started from `src/instrumentation.ts` ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) "Observability") |
| `apps/web/test-pg/`, `test-support/` | the real-Postgres suite (`pnpm test:pg`) and the local RS256/JWKS token fixture |
| `janua.client.yaml` | names only: the `cv-api` resource server and the `cv-web` client the W2 code uses |
| `docs/PRODUCT.md` | the owner requirement and the profile → jobs → tailored artifacts model |
| `scripts/qa/check_file_size.py` | the file-size gate |
| `apps/web/src/server/read-limit.ts` | W6-A: the per-client token bucket on unauthenticated reads (pages host, cv-api public reads), keyed on `CF-Connecting-IP` only; settings `CV_READ_LIMIT_*` in `lib/config.ts` |
| `apps/web/src/lib/copy/reader.ts`, `src/app/h/landing/[locale]/lector/` | W6-A: the job-link reader page (`/lector`, `/en/lector`); the reader's User-Agent links to it |
| `apps/web/e2e/activation.spec.ts`, `test/{read-limit,activation}.test.ts` | W6-A: the reader page, the pages host under `cv-p.madfam.io`, the 429s, the 7-day session cookie |
| `apps/web/src/components/jobs/tailoring.ts`, `SelectionEditor.tsx`, `TailorWorkspace.tsx` | the tailoring workspace: pre-selection in CV order, add-in-place, «Quitar todos», per-job overrides, the cover letter's visible greeting/closing defaults (`letterDefaults`); `test/jobs-tailoring.test.ts`, `e2e/jobs.spec.ts` |
| `apps/web/src/components/jobs/document-edit.ts`, `src/app/h/app/[locale]/documentos/ui/DocumentContentEditor.tsx` | editing a document's content in place (same `SelectionEditor`; one PATCH that keeps what it does not show); `test/jobs-document-edit.test.ts`, `e2e/documents.spec.ts` |
| `apps/web/src/components/paper/print-pages.ts`, `src/app/h/app/[locale]/documentos/ui/PrintView.tsx`, `src/components/render/template-classes.ts` | the print view's «Aprox. N páginas» (print rules re-scoped onto a hidden copy, paginated like print) and its «Usar Compacta» offer; `test/print-pages.test.ts`, `e2e/templates.spec.ts` (estimate = PDF pages) |
| `apps/web/src/components/ui/useUnsavedGuard.ts` | asks before leaving a page with unsaved changes (profile header, document content) |
| `apps/web/src/server/api/match.ts` | the AI-free job match, `keyword-overlap-v3`; `test/match.test.ts` |

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

Public repository: every job runs on **GitHub-hosted** runners (R116). `ci.yml` runs on **every pull request,
whatever its base** (a PR stacked on another PR's branch is checked too; since 2026-11-16) and on pushes to `main`. Top-level
`permissions: contents: read`; every action pinned to a full commit SHA; no `secrets: inherit`; no
`|| true` masks. `ci.yml`: `agent-docs` (required files and markers), `web` (frozen install, lint,
typecheck, unit tests ≥ 408 passing and none skipped, build, standalone smoke ≥ 13 passing; raise a floor when a PR adds tests), `pg` (the real-Postgres suite on a `postgres:16-alpine`
service container, as the `cv_app` role; fails on fewer than 49 passing tests), `e2e` (Playwright on GitHub-hosted runners:
`npx playwright install --with-deps chromium`, the built server, its own Postgres service; fails on fewer than 106
passing specs or any failed, flaky or skipped; raise the floor when a PR adds specs; a failed run uploads the
Playwright traces as `e2e-traces`, kept 7 days), `guards` (file size, forbidden-domain grep),
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
- **Beta feedback channel** (2026-11-16): where «Enviar comentario» sends (email, the CRM, a form); nothing built until
  ruled.
- **Profile photo and pronouns**: not stored (a privacy and discrimination question in Mexican CVs).
- **Assisted writing through Selva**: scope, where inference runs and the copy of «Sugerencias con IA (próximamente)».

## App routes and W3 directory ownership

Every app page is declared once in `apps/web/src/lib/app-routes.ts` (English under `/en/...`; `:id` is a UUID):
`/` · `/perfil` · `/empleos` · `/empleos/:id` · `/empleos/:id/adaptar` · `/documentos` · `/documentos/:id` ·
`/documentos/:id/vista-previa` · `/documentos/:id/imprimir` · `/ajustes`, plus `/empleos/nuevo` and `/empleos/capturar` (W5-J). Each renders inside `AppFrame` and shows an
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

W2–W7 are live behind the beta invite gate (history in the sections below). Next, in order: a first-run checklist on
«Inicio», a cover-letter body of its own, the remaining design critique (public pages typography, landing voice, the
long profile on phones), the feedback channel once ruled, the first invitations; then Selva (AI), Dhanam (plans) and
tlacuilo's activation. Symbiosis HCM classifies English job titles poorly («Engineering Director» → no occupation):
the fix belongs in that repository, not here.

## Pliego paper data (W5-P, 2026-10-22)

[Pliego](https://pliego.madfam.io) owns paper physics; cv **consumes** a pinned slice of it and never re-derives it.

| Path | What it is |
|---|---|
| `apps/web/src/lib/pliego/vendor/` | CERN-OHL-W-2.0 data: Pliego's `copy-80` and `cardstock-160` stock cards (byte copies) and the letter fold its kernel computes with the commons cartridge `print-folds`; `LOCK.json` pins the commits and blobs. Never edit by hand |
| `apps/web/src/lib/pliego/paper.ts` | the only reader: small views (stock facts, screen look, letter fold) built on the server and handed to client components |
| `apps/web/src/components/paper/`, `src/lib/copy/paper.ts` | `PaperSheet` (stock colour and edge, `@media screen` only, set through the CSSOM), `StockPicker`, `FoldGuide` (cover letters) |
| `scripts/pliego/sync_pliego_data.py` | check or refresh the vendored data against a Pliego checkout; CI job `pliego-pin` runs the check at the pinned commit |

Rules: paper effects never reach `@media print` or the PDF text layer (`e2e/documents-paper.spec.ts` proves the same
pages, sizes and text with every stock); refresh the data only with the script; a new stock or fold needs Pliego to
publish it first.

## Page turn (W5-P phase 3, 2026-10-22)

The presentation deck turns its slides like paper. The motion is Pliego's: `@pliego/engine@0.1.0` (exact pin, a dev
dependency from `npm.madfam.io` through the root `.npmrc`, no token) turns the kernel's `page-turn` leaf at build time,
and `apps/web/scripts/pliego-page-turn.ts` keeps its mid-height cross-section per 60 Hz frame in
`src/lib/pliego/generated/page-turn-deck.json` (`--check` verifies it; `test/page-turn.test.ts` re-runs the engine).
`src/components/render/page-turn/turn.ts` plays it, loaded lazily by `SlideDeck` only for a deck of two or more slides
when reduced motion is off: an inert, `aria-hidden` copy of the slide in CSS-3D strips over the new slide for 0.8 s,
then only real text. Never in print (`e2e/documents-page-turn.spec.ts` compares the PDFs with and without it).

## W5-H: market income range from Symbiosis HCM

`/empleos/:id` shows «Rango de ingreso en el mercado» from Symbiosis HCM (INEGI ENOE, official public statistics;
[`docs/PRODUCT.md`](docs/PRODUCT.md) «Market income range»). W5-H owns `apps/web/src/server/hcm/**`,
`src/components/jobs/benchmark/**`, `src/lib/copy/benchmark.ts`, `e2e/benchmark*.spec.ts`, `test/hcm-*.test.ts`,
`test-pg/benchmark.pg.test.ts`, `test-support/hcm-fake.ts` and `infra/k8s/production/externalsecret-hcm-client.yaml`.
Rules: HCM is the data owner (cv stores no figure); only the job title and ISO state leave cv, never the person;
every figure on screen carries «Datos de la ENOE (INEGI), <trimestre>, n = …»; withheld figures say «sin datos
suficientes», never an estimate; the panel never blocks `/ready`. The structured state and salary fields come from
lane W5-J (`stateCode` ISO 3166-2, `countryCode`, `salaryMin`/`salaryMax`/`salaryCurrency`/`salaryPeriod`):
`server/hcm/facts.ts` names the fields it reads and `test/hcm-facts.test.ts` pins them; rows from before W5-J fall
back to a state named in the location text.

## W7 (B3): luxury retail beta (2026-10-22)

The luxury-retail beta persona ([`docs/PRODUCT.md`](docs/PRODUCT.md) «Luxury retail beta»). B3 owns
`apps/web/src/server/ingest/closed.ts`, `src/components/profile/SectorGuide.tsx`, `src/lib/copy/{tailor-language,discretion}.ts`,
`e2e/luxury.spec.ts`, `test/{ingest-luxury,tailor-language,profile-sector-guide}.test.ts` and
`test/fixtures/ingest/luxury/` (synthetic pages; invented houses on `*.example`). Rules: no new ATS reader without the
provider's own documentation of a key-free public API (Workday, SuccessFactors, Oracle, Eightfold and TalentLink have
none); robots.txt is also checked without a leading locale segment (only ever refuses more); a closed posting is
`posting_closed`, never a draft; the e2e persona is fictional («Valeria Ficticia Robles», «Maison Ejemplo»).

**W7 (segment view, 2026-10-22).** For store sales and store management occupations (`RETAIL_SALES_SINCO` in
`server/hcm/route.ts`: SINCO 4211, 4201, 1411, 1711) the route asks HCM a second time by SINCO with
`segment=retail_apparel_personal` and returns it as `segment` (null for other occupations, `{state: 'unavailable'}`
when HCM cannot answer, including an HCM that predates segments and answers 400). The panel names the general figure
«mercado general», shows the segment under HCM's own label («no solo lujo») with n, quarter and source, and adds a
neutral note above the general P90; it never frames an offer as too high. `e2e/benchmark-segment.spec.ts` checks the
copy and that none of «atípico», «demasiado», «excesivo», «outlier», «too high» or «%» appears.

## W7 (B4): bilingual profile text (2026-10-22)

Owner directive: English CVs fully in English. One **primary language** per profile (`profiles.locale`, es-MX by
default) holds the main text where it always lived; the other language is optional, field by field, in a nullable
`translations` jsonb on `profiles` and `profile_items` (migration `0003`, additive; `{ "en": { "role": "…" } }`).
[`docs/PRODUCT.md`](docs/PRODUCT.md) «Bilingual profile text» has the model and the reasons.

| Path | What it is |
|---|---|
| `apps/web/src/lib/profile-text.ts` | the model: which fields are words (`ITEM_TEXT_FIELDS`, `HEADER_TEXT_FIELDS`), `localizeItem` / `localizeHeader` (fallback + missing report), `cleanTranslations`, `projectTranslations` |
| `apps/web/src/lib/languages.ts` | the ISO 639 codes a language item may carry; names come from `Intl` per document language |
| `apps/web/src/components/render/localize.ts`, `MissingTranslations.tsx` | every renderer reads `localizeRenderData` first; the «Faltan N textos en inglés» flag (preview, tailoring; never printed) |
| `apps/web/src/components/profile/{TranslationFields.tsx,translation-form.ts,translate-anchor.ts}` | the «Texto en: Español \| English» switch per form, the other-language fields, `/perfil#traducir-<id>` deep links |
| `apps/web/src/components/import/{language.ts,ImportLanguage.tsx}`, `src/lib/copy/bilingual.ts` | the import's file language; the strings |
| `apps/web/e2e/bilingual.spec.ts`, `e2e/fixtures/bilingual/`, `test/render-bilingual.test.ts`, `test/fixtures/bilingual/` | the no-translation baseline written by `main` at f1ca3530 (the print view's document text, machine-independent; render hashes), and the bilingual journey |

Rules: a document in the primary language reads the stored text only (byte-for-byte proof against main's golden
print text and render hashes); proper names, dates, URLs, levels and codes stay single; no machine or AI translation
(the Selva seam stays off until its restricted tier is live); per-job overrides belong to the language of the
documents they are typed for; the public projection carries only the document's own language (since 2026-11-21 the
text arrives already in it: `lib/shared-page.ts`). **Changing the primary language swaps the texts** (2026-11-21,
`lib/profile-text-swap.ts`, `repository.putProfile`): in one transaction the header and every one of the owner's items
take, field by field, the translation in the new primary language when there is one (the old text becomes the old
language's translation), keep their value otherwise, and lose the new primary language's entry; a recommendation's
`text` never moves. The `PUT /profile` body is read in the STORED languages (a translation keyed by the stored primary
language is a 400) and its response adds `items` when it switched. Renders are identical in both languages before and
after (`test/profile-text-swap.test.ts`, `test-pg/primary-language.pg.test.ts`). CI minimums after this
PR: `pg` ≥ 39 passing, `e2e` ≥ 89 passing after the rebase onto #26 (were 34 and 85).

## B1: beta access (invite-only) and the first-run guide

Beta accounts are invite-only, and the gate lives in Janua, never here ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
«Beta access»). Janua admits a person to the cv-app client only while they hold the `cv` product entitlement, and its
sign-in links never create accounts for this client. cv asks Janua's hosted pages for the person's language (OIDC
`ui_locales`: es-MX, or `en` from an `/en` page; `src/lib/ui-locales.ts`, used by `src/auth.ts` and
`src/app/auth/entrar/route.ts`) and for the emailed sign-in link first (`login_method=magic_link`). The app home
shows «Primeros pasos» to a signed-in person whose profile is empty (`src/components/onboarding/`,
`src/lib/copy/onboarding.ts`, `e2e/onboarding.spec.ts`): import or start by hand, then save the first job, plus
the privacy line. The guide reads only the existing profile. It adds no data model and no flag.

## Reading images through tlacuilo (2026-11-14)

Owner directive (2026-11-14): cv integrates deeply with tlacuilo, the ecosystem's document-intelligence service, for
OCR. A photo, a screenshot or a scanned PDF of a posting is read through tlacuilo's `text_document` lane
([`docs/PRODUCT.md`](docs/PRODUCT.md) «Reading images», [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) «Reading images
through tlacuilo»).

| Path | What it is |
|---|---|
| `apps/web/src/server/tlacuilo/config.ts` | the three settings and the dormancy rule (`TLACUILO_API_URL`, `TLACUILO_CLIENT_ID`, `TLACUILO_CLIENT_SECRET`); http only to loopback or a cluster Service name |
| `apps/web/src/server/tlacuilo/client.ts` | client credentials (scope `tlacuilo:extract`), `POST /v1/extractions` sync with `document_type=text_document` and `X-Sensitivity: restricted`, zod-validated and bounded answer, circuit breaker for service failures only, no cache |
| `apps/web/src/server/tlacuilo/route.ts` | `GET`/`POST /api/v1/jobs/intake/ocr`: one page image per call (≤ 480 KiB, signature checked against the declared type), the per-owner OCR ceiling, failures that keep their meaning |
| `apps/web/src/components/jobs/intake/ocr-pages.ts` | the browser side: pages drawn to a canvas and shrunk to fit, sent one by one, text joined |
| `apps/web/test-support/tlacuilo-fake.ts`, `test/tlacuilo-*.test.ts`, `test/ocr-pages.test.ts`, `e2e/ocr.spec.ts` | the synthetic service, the unit tests, and the browser journey (dormant on the real route; switched on with the route answered by the test) |

Rules: cv never ships an OCR engine, a model or a provider key; the original file never leaves the browser, only page
images the person agreed to send, and only to cv's own API; nothing is stored by cv or by tlacuilo, and no log line
carries content or a file name; the label is always `restricted`; recognised text reaches a job only through the
ordinary text intake and its preview, with the `ocr_text` note; a page with no legible text is a failure, never a
draft; the 512 KiB request buffer (`next.config.ts`, W4-S) is not raised for this; the interface never names the
service or its engine. The infra wiring (ExternalSecret, env, egress) is a separate activation PR that merges only
after the machine client exists. CI minimum after this PR: `e2e` ≥ 93 passing (was 89).

## Privacy notice (2026-11-15)

cv has its own aviso de privacidad at `cv.madfam.io/privacidad` (`/en/privacidad`), linked from the footer of every
page and from «Primeros pasos». Text, version and status live in `apps/web/src/lib/copy/privacy.ts`; the page is
`src/app/h/landing/[locale]/privacidad/`. Law: the Ley Federal de Protección de Datos Personales en Posesión de los
Particulares of 2025 (a new law: never cite an article of the 2010 one; the authority is the Secretaría
Anticorrupción y Buen Gobierno).

Rules: the owner **approved** the notice on 2026-11-16 (`PRIVACY_NOTICE.status`, version 2026-11-16.1, which adds
recommendations received; 2026-11-15.3 was approved on 2026-11-15). A change to its
text sets it back to `draft` with `pending` shown on the page; only the owner moves it to `approved`. It states only what the code does: **a change to what cv does with
personal data changes this file in the same pull request, and `version` moves**. The six elements the law requires
(`REQUIRED_SECTION_IDS`) stay present in both languages (`test/privacy-notice.test.ts`). The only mailbox in it is
`privacy@madfam.io`. No vendor, engine or service name appears in it. The Spanish text governs. CI minimum after this
PR: `e2e` ≥ 95 passing (was 93).

## Rehearsal walk-through (2026-11-15)

`apps/web/rehearsal/journey.spec.ts` (config `playwright.rehearsal.config.ts`, workflow `.github/workflows/rehearsal.yml`,
`pnpm --filter @cv/web rehearsal`) walks the whole signed-in journey as a synthetic persona on a desktop and a phone
viewport and saves a full-page screenshot of every screen plus `report.json` (console errors, CSP violations, page
errors, 5xx). It is **for looking, not a gate**: it runs on demand (`workflow_dispatch`) or when its own files change,
never in `ci.yml`, and `pnpm test:e2e` does not include it. Synthetic content only. When a screen is added to the
journey, add it to the walk.

## Design fixes from the critique, batch two (2026-11-15)

- **A document's title is private.** `DocModel.heading` (the person's name, or the kind of document) is what every
  renderer prints; `model.title` is never rendered, and `pageTitle` (pages host) reads «name · kind». Do not print an
  artifact's title on any shared surface: it usually names the employer applied to (`test/render-html.test.ts` pins it).
  The public API follows the same rule (2026-11-21): cv-api's two public reads and the pages host get
  `lib/shared-page.ts sharedRenderData`, only what the page prints (no title, no publication time, no profile summary
  under the document's own, no other language), and `test/shared-page.test.ts` proves it renders the same markup.
  A change to renderer markup moves `test/fixtures/bilingual/render-baseline.json`: regenerate it with
  `CV_WRITE_RENDER_BASELINE=1` and check that only the intended cases changed.
- **The match shows words, not tokens.** `matchedTerms` / `missingTerms` carry the posting's own spelling
  (`surfaceForms`); the gaps list leaves out the company, the place and posting boilerplate. The score is unchanged.
- **Sharing says its state beside the link** (`share-state` in `PublishPanel`): what it is, who can open it, how to
  withdraw. The address is a wrapped, read-only text area.

## Beta readiness wave (2026-11-14 → 2026-11-16)

Found by dogfooding the owner's own profile (a LinkedIn import of 91 items, translated to es-MX) against a real
posting. Rules that now hold ([`docs/PRODUCT.md`](docs/PRODUCT.md) has the product side of each):

- **Recommendations received** are an item kind (`recommendation`, migration `0004`): the recommender's words are
  printed verbatim in quotation marks, never translated (`ITEM_TEXT_FIELDS` has only `role`, `relationship`) and never
  overridden per job (`render/model.ts` ignores overrides; the tailoring editor hides them). They score 0 in the match.
- **Match `keyword-overlap-v3`**: filler words of both languages are stopwords; an item's place, enums, codes and a
  recommender's relationship never score. v3 (2026-11-21): a token is dropped when its raw OR plural-folded form is a
  stopword («nuevos», «others» no longer score), and the capital letters `C`, `R` and the acronym `IT` are kept
  (`KEPT_LETTERS`, `KEPT_ACRONYMS`: exact uppercase only, so all-caps headings never turn stopwords into terms). Bump
  the version name whenever the scoring changes (it is shown in the UI).
- **The pre-selection follows CV reading order** (kind in `ITEM_KIND_ORDER`, then the person's own order), never the
  score; the current job is always in. An added item lands in its CV place.
- **A cover letter** prints at most three roles or projects (title, organisation, dates); its greeting and closing,
  when left empty, are the texts shown as the fields' placeholders (`letterDefaults`): nothing is added unseen.
- **Documents are editable in place**; an edit replaces only what the editor shows (blocks, a presentation's own
  slides, `showContact` and a portfolio's `intro` are kept). Editing a published document changes its page at once.
  An entry or slide reference whose profile item was deleted is announced in the editor and removed on the next save
  (it counts as an unsaved change); the server stays strict (`assertOwnItems`, 422 `unknown_item_ids`, whose toast
  asks to reload). `test/jobs-document-edit.test.ts`, `e2e/documents.spec.ts`.
- **The print estimate must equal the PDF**: `e2e/templates.spec.ts` compares «Aprox. N páginas» with Chromium's PDF on
  Carta and A4 for every CV template; a renderer or print-CSS change that breaks it is a regression.
- **Render baseline**: markup changes rewrite `test/fixtures/bilingual/render-baseline.json` with
  `CV_WRITE_RENDER_BASELINE=1` (say which cases changed in the commit); CSS-only changes leave it alone. The cover
  letter's golden text is `e2e/fixtures/bilingual/cover-letter-es-formal.txt`.
- **Publish limit** (2026-11-21): at most 20 different documents per owner whose last publication is within 24 hours,
  withdrawn ones included. `published_at` is the last publication and is kept on unpublish and on a status change; the
  count and the update run in one transaction under `pg_advisory_xact_lock(hashtextextended(owner_sub, 0))`; the 429's
  `Retry-After` is the time until the oldest of those publications is 24 hours old (`test-pg/publish-limit.pg.test.ts`).
- **Stacked PRs**: after the parent is squash-merged, `git rebase --onto origin/main <parent-branch> <child>` and push
  with `--force-with-lease` (own branches only).
- **LinkedIn**: import only what the person downloads themselves (the data-export ZIP, «Save to PDF»); no LinkedIn API
  integration (OIDC gives name and email only; the portability API is EEA-only; the profile API is partner-only) and no
  bookmarklet on linkedin.com (User Agreement §8.2).
