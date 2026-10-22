# Deployment contract

> Last Updated: 2026-10-22
>
> Boundary: Enclii-first. This file names services, ports, hosts and secret **names**. Operator
> gates and adapter-gap records live in MADFAM's private ops repository; the first-deploy section
> below keeps only the public-safe command sequence.

**Status: not yet onboarded.** Build & Deploy is **dispatch-only**: a merge never deploys by itself.
Declared in [`../enclii.yaml`](../enclii.yaml) with `autoDeploy: false`.

## Runtime

One container (root [`../Dockerfile`](../Dockerfile), two stages, `node:22-alpine` pinned by digest,
pnpm via corepack with the frozen lockfile, Next.js standalone output) on port 3000. uid 1001,
read-only root filesystem (only `/tmp` and `/app/.next/cache` writable, emptyDir in Kubernetes),
drop ALL capabilities, seccomp RuntimeDefault, no service-account token, `enableServiceLinks: false`
(a Service named `cv` would otherwise inject `CV_PORT` and friends into the app's `CV_*` namespace).
Two replicas, surge rollout (`maxUnavailable: 0`), a PodDisruptionBudget
([`../infra/k8s/production/`](../infra/k8s/production/)).

| Probe | Path | Answers |
|---|---|---|
| liveness | `/health` | 200 `{"status":"ok","service":"cv","revision":<sha or null>}` on any Host; no dependency checks |
| readiness | `/ready` | on any Host: 503 on an invalid configuration; 503 when a database IS configured (`APP_DATABASE_URL`) and `select 1` fails within 2 s; otherwise 200. Unconfigured dependencies are reported (`checks.signIn`, `checks.database`) and never block. Janua is not pinged (its outage must not take the landing down; the API answers 503 per request instead) |

## Hosts (one Service, routed by Host)

| Host | Surface | Indexing | robots.txt |
|---|---|---|---|
| `cv.madfam.io` | landing: es-MX `/`, en `/en` | `X-Robots-Tag: noindex, nofollow` while `CV_INDEXABLE` is not `true` | allows the R40 AI crawlers and everyone (so crawlers can see the noindex); `Sitemap:` and `/sitemap.xml` only when indexable |
| `cv-app.madfam.io` | app shell `/`, `/en`; Auth.js `/api/auth/*`; `POST /auth/entrar`, `POST /auth/salir`; the same-origin API proxy `/api/v1/*` | always noindex | disallow all, AI crawlers named |
| `cv-api.madfam.io` | `/api/v1/meta`; the owner-scoped API (docs/PRODUCT.md); JSON 404 elsewhere | always noindex | disallow all, AI crawlers named |
| pages host (label pending; working label `cv-p.madfam.io`; set by `CV_HOST_PAGES`) | `/<slug>` (public artifact), `/l/<token>` (link-shared); the proxy looks each up first (published, unsuspended), anything else is the HTML 404 | per page: `index, follow` only for a public artifact whose owner chose `indexable`; otherwise `noindex, nofollow, noai, noimageai`; `/l/*` also `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`; public pages `no-store` | allows everyone and names the R40 AI crawlers (so the per-page header is seen); no sitemap |
| any other Host | `/health`, `/ready` only | — | 404 |

Tunnel routes: each domain in `enclii.yaml` pins `port: 80`; the Service `cv` publishes 80 → the
container's 3000. Security headers on every response: nonce CSP with `'strict-dynamic'` on HTML
(no `'unsafe-inline'`/`'unsafe-eval'` for scripts), a locked `default-src 'none'` CSP elsewhere,
HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
COOP.

## Configuration (plain environment)

| Variable | Production value | Meaning |
|---|---|---|
| `CV_HOST_LANDING`, `CV_HOST_APP`, `CV_HOST_API` | `cv.madfam.io`, `cv-app.madfam.io`, `cv-api.madfam.io` | the host table; exact lowercase hostnames, distinct; invalid values stop the server at boot |
| `CV_HOST_PAGES` | unset (inert) | the user-pages host; until the owner names the label (working label `cv-p.madfam.io`) it stays unset and the host is not served. Setting it also needs the domain in `enclii.yaml` (`port: 80`), domains reconcile and the tunnel apply (coordinator) |
| `CV_INDEXABLE` | `false` | the one indexing flag; only `true` lifts noindex on the landing (never on user pages) |
| `CV_REVISION` | set by the image build arg | the commit reported by `/health` and `/api/v1/meta` |
| `HOSTNAME` | `0.0.0.0` | bind address; also keeps the proxy's rewrites internal (a loopback name would not) |
| `CV_METRICS_PORT` | `9090` | the internal metrics listener (`GET /metrics` only, on `HOSTNAME`); `off` disables it (tests only); a value that is not a port, or equals `PORT`, stops the server at boot |

## Identity and data (W2): dormant until configured

The code for Janua sign-in (Auth.js `next-auth@5.0.0-beta.32`, provider id `janua`) and the owner-scoped data
model (Drizzle + postgres.js through PgBouncer) ships switched OFF. Merging it changes nothing live:

| Missing | Behaviour |
|---|---|
| any of `AUTH_SECRET`, `AUTH_JANUA_ISSUER`, `AUTH_JANUA_CLIENT_ID`, `AUTH_JANUA_CLIENT_SECRET` | sign-in off: the app shell says «aún no disponible»; `/api/auth/*`, `/auth/entrar`, `/auth/salir` and the app's `/api/v1/*` proxy answer 503 `{"error":"not_configured"}` |
| `AUTH_JANUA_ISSUER` | cv-api's authenticated routes answer 503 `not_configured` |
| `APP_DATABASE_URL` | cv-api's data routes and public reads answer 503 `not_configured`; `/ready` stays 200 |

Nothing reads these at import or build time; nothing throws at boot. The boot log line says
`sign-in=on|off (...)` and `database=configured|not configured` (names only, never values).

### Env contract (names only; values never in git)

| Name | Source | Read by |
|---|---|---|
| `AUTH_SECRET` | Vault `secret/cv` `auth_secret` (`enclii secrets intake submit cv/web-session --generate auth_secret`) → ExternalSecret `cv-web-auth` | Auth.js session-cookie encryption (this app's own secret, never the Janua client secret, R42) |
| `AUTH_JANUA_CLIENT_ID`, `AUTH_JANUA_CLIENT_SECRET` | Vault `secret/cv` `auth_janua_client_id` / `auth_janua_client_secret` (`enclii secrets provision oidc --platform cv-app`) → `cv-web-auth` | Auth.js |
| `AUTH_JANUA_ISSUER` = `https://auth.madfam.io` | plain env (PR B) | web + API |
| `AUTH_PUBLIC_HOSTS` = `cv-app.madfam.io` | plain env (defaults to the app host of the host table) | the only host sign-in answers on; `AUTH_URL` stays unset |
| `CV_JANUA_AUDIENCE` = `cv-api`, `CV_JANUA_JWKS_URL` = `https://auth.madfam.io/.well-known/jwks.json` | plain env (both default to these) | API token verification |
| `APP_DATABASE_URL` | onboarding Secret `cv-secrets` (runtime role `cv_app`: LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT, connection limit 8) | the app at runtime (DML only) |
| `DATABASE_URL` | onboarding Secret `cv-secrets` (the database OWNER) | migrations only (the PreSync Job). The runtime falls back to it only when `NODE_ENV` is development or test |
| `DIRECT_DATABASE_URL` | onboarding, if provided | migrations, preferred over `DATABASE_URL` |
| `DATABASE_POOL_MAX` | plain env, default 3 | pool per pod (2 replicas × 3 inside the role's limit of 8) |

### Sign-in shape

- Callback, exact: `https://cv-app.madfam.io/api/auth/callback/janua`. Post-logout redirect: `https://cv-app.madfam.io/`.
- Cookies (Auth.js defaults on https): `__Secure-authjs.session-token` and friends, `HttpOnly`, `Secure`,
  `SameSite=Lax`, **host-only** (no `Domain`): they exist on `cv-app.madfam.io` alone.
- «Iniciar sesión», «Cambiar de cuenta» (`prompt=select_account`), «Entrar como otra persona» (`prompt=login`)
  are plain form POSTs to `/auth/entrar`; «Cerrar sesión» is `POST /auth/salir` (RP-initiated logout). Both are
  same-origin only (403) and POST only (405 on GET). The app's CSP allows `form-action 'self'` plus the issuer
  origin; the landing keeps `form-action 'none'`.
- The browser never holds a Janua token: the app's `/api/v1/*` proxy reads the session server-side and calls
  the API handler in-process with the bearer; the API verifies it like any other request (RS256 against the
  JWKS, issuer, audience `cv-api`; HS256 and `none` refused; 401 / 403 / 503 when the JWKS is unreachable).

### Migrations

`apps/web/drizzle/` holds the committed SQL (`pnpm db:generate` writes it from
`apps/web/src/server/db/schema.ts`). `0001_app_role_grants.sql` grants `cv_app` DML on the app's tables
(Enclii grants it CONNECT only). Apply with `pnpm db:migrate` (`DIRECT_DATABASE_URL ?? DATABASE_URL`), or in the
cluster with the image itself: `CV_MIGRATE_AND_EXIT=true node apps/web/server.js` applies them as the owner
and exits 0 (the PreSync Job, PR B).

## Provisioning order (owner / coordinator; each apply only after reading its own dry run)

1. Merge this W2 code (dormant). Its NetworkPolicies add 443 and PgBouncer egress **before** any
   `enclii onboard ensure`; `enclii.yaml` `network.egress` says the same (`[dns, https, pgbouncer]`).
2. enclii#838 (the `cv-app` Janua client, intake targets `cv/web-oidc` and `cv/web-session`), the Vault writer
   policy, `secrets provision oidc --platform cv-app`, then
   `enclii secrets intake submit cv/web-session --generate auth_secret`.
3. Postgres onboarding: `--db-name cv --generate-db-password --app-role cv_app --app-role-connection-limit 8`
   writes `cv-secrets` (`DATABASE_URL` owner, `APP_DATABASE_URL` runtime).
4. Then, and only then, merge the wiring PR (ExternalSecret `cv-web-auth`, `envFrom` `cv-secrets` and
   `cv-web-auth`, the plain `AUTH_JANUA_ISSUER` / `AUTH_PUBLIC_HOSTS`, the migrate PreSync Job). Check that
   `secret/cv` holds `auth_janua_client_id`, `auth_janua_client_secret`, `auth_secret` and that `cv-secrets`
   holds both URLs first: a missing Secret stops the pods.
5. Probe: `/ready` shows `"signIn":"configured","database":"ok"`; `cv-api.madfam.io/api/v1/me` without a token is
   401; one real sign-in on `cv-app.madfam.io`, then «Cerrar sesión» returns to `https://cv-app.madfam.io/`.

## Moderation (operator, manual; no admin UI yet)

A takedown short of deletion, run by an operator through the platform's database access (never from this repo):

```sql
update artifacts set suspended_at = now(), suspended_reason = '<reason>' where id = '<artifact id>';
-- lift it:
update artifacts set suspended_at = null, suspended_reason = null where id = '<artifact id>';
```

A suspended artifact is never served by the public reads or the pages host (404 at once: user pages are `no-store`),
and its owner's publish answers 409 `suspended`. Publishing is also rate-limited to 20 artifacts per owner per 24 hours
(429 `publish_limit`). Abuse reports arrive at `legal@madfam.io` from the link on every user page.

## Network

Ingress: the app port from the Cloudflare tunnel only. Egress: DNS; TCP 443 to public addresses only (fulcra's
`allow-https-egress` shape; Janua discovery, JWKS, token and logout); PgBouncer `app: pgbouncer` in namespace
`data` on 6432 (the rule Enclii's generator renders for `egress: [pgbouncer]`). Keep `enclii.yaml` `network` and
`network-policy.yaml` in step: `enclii onboard ensure` renders policies from `enclii.yaml`.

The metrics port (9090) is admitted from the `monitoring` namespace only (`allow-monitoring-ingress`, repo-managed:
Enclii's generator has no monitoring ingress type, and `ensure` never prunes a policy it did not render). It is on no
Service and no tunnel route, so no public host can reach it.

## Observability (W4)

One process, two listeners: the app on 3000 (every public host, through Service `cv`:80) and `/metrics` on 9090
(pod IP only; scraped through the pod's `prometheus.io/*` annotations). On the app port `/metrics` is the router's
404 on every host (`apps/web/test-server/metrics.test.ts`, `apps/web/e2e/metrics.spec.ts` and the Image smoke prove it).

| Series | Labels | Meaning |
|---|---|---|
| `cv_http_requests_total` | `host_role` (landing, app, api, pages, none), `route`, `method`, `status` | every response the server wrote |
| `cv_http_request_duration_seconds` | `host_role`, `route`, `method` | histogram, 5 ms to 10 s |
| `cv_ready` | none | 1 when this pod's last `/ready` answered 200 (0 until the first probe) |
| `cv_db_readiness_checks_total` | `outcome` (ok, error, not_configured) | the readiness `select 1` |
| `cv_metrics_dropped_samples_total` | `family` | samples refused at the 2000-series cap; non-zero means a label escaped its template |
| `process_*`, `nodejs_*` | — | CPU, memory, file descriptors, heap, event-loop delay |

`route` is a template from the route tables (`/empleos/:id/adaptar`, `/api/v1/public/s/:token`, `/:slug`,
`unmatched`), never a raw path, id, slug, share token or query (`apps/web/src/server/metrics-route.ts`). Request
logs are one JSON line per response on stdout with `ts`, `level`, `event`, `host_role`, `route`, `method`, `status`
and `duration_ms` only: no path, query, header, cookie, token, client address or owner `sub`. Successful probes and
build assets are counted, not logged. Alert rules and the dashboard live in MADFAM's private ops repository.

## First deploy (owner / coordinator steps)

Run each apply only after reading its own dry run; never paste a dry run and its apply together.

1. Merge the baseline pull request (CI and Image green).
2. **Dispatch Build & Deploy** (`gh workflow run build-deploy.yml -R madfam-org/ai-portfolio-builder`).
   It builds on GitHub-hosted runners, pushes `ghcr.io/madfam-org/cv:<sha>`, signs it, and commits the
   digest pin over the all-zero placeholder in `infra/k8s/production/kustomization.yaml` to `main`.
   Confirm the pin commit landed before onboarding.
3. **Onboard** (wave 1 ran without database, object storage or secrets; W2's database follows "Provisioning order"):
   `enclii onboard --repo madfam-org/ai-portfolio-builder --project cv --manifest-path infra/k8s/production --skip-postgres --skip-r2 --skip-secrets`.
   If it ends by printing its usage text, run `enclii onboard ensure` and re-check readiness 3–5
   minutes later.
4. **Services sync** (dry run, read it, then `--reconcile-existing`).
5. **Domains reconcile** for `cv.madfam.io`, `cv-app.madfam.io`, `cv-api.madfam.io` (dry run, read it,
   then `--apply --reason …`).
6. **Tunnels apply** (dry run, read the plan, then `--apply --expect-plan <hash>`).
7. **Scale to 2 replicas** once (Enclii's Argo Application ignores Deployment replicas).
8. **Probe through the edge**: `/health` and `/ready` 200 on all three hosts; `cv.madfam.io/` and
   `/en` 200 with `X-Robots-Tag: noindex` and a nonce CSP; `/robots.txt` per host; `cv-api.madfam.io/api/v1/meta`
   200 with the built `revision`; `cv-api.madfam.io/` JSON 404; an unknown path on the landing 404.
   A fresh host may be cached negative by the local resolver: probe with `curl --resolve`.
9. Set the repository `homepage` to `https://cv.madfam.io` (coordinator, after go-live).

Optional at onboarding: the repository secret `ENCLII_CALLBACK_TOKEN` (through the intake) lets the
build register an Enclii Release; without it the build warns and GitOps deploys regardless.

## Later

Push-on-main for Build & Deploy is a separate, reviewed decision in its own pull request. Lifting
noindex is `CV_INDEXABLE=true` in `deployment.yaml`, after the brand ruling.
