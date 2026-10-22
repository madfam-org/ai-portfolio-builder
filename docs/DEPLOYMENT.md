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
| readiness | `/ready` | 200 `{"status":"ok",...,"dependencies":[]}` on any Host while the configuration is valid; 503 with the reason otherwise. Wave 1 has no dependency |

## Hosts (one Service, routed by Host)

| Host | Surface | Indexing | robots.txt |
|---|---|---|---|
| `cv.madfam.io` | landing: es-MX `/`, en `/en` | `X-Robots-Tag: noindex, nofollow` while `CV_INDEXABLE` is not `true` | allows the R40 AI crawlers and everyone (so crawlers can see the noindex); `Sitemap:` and `/sitemap.xml` only when indexable |
| `cv-app.madfam.io` | pre-launch app shell `/`, `/en` | always noindex | disallow all, AI crawlers named |
| `cv-api.madfam.io` | `/api/v1/meta`; JSON 404 elsewhere | always noindex | disallow all, AI crawlers named |
| any other Host | `/health`, `/ready` only | — | 404 |

Tunnel routes: each domain in `enclii.yaml` pins `port: 80`; the Service `cv` publishes 80 → the
container's 3000. Security headers on every response: nonce CSP with `'strict-dynamic'` on HTML
(no `'unsafe-inline'`/`'unsafe-eval'` for scripts), a locked `default-src 'none'` CSP elsewhere,
HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
COOP.

## Configuration (plain environment; no secrets in wave 1)

| Variable | Production value | Meaning |
|---|---|---|
| `CV_HOST_LANDING`, `CV_HOST_APP`, `CV_HOST_API` | `cv.madfam.io`, `cv-app.madfam.io`, `cv-api.madfam.io` | the host table; exact lowercase hostnames, distinct; invalid values stop the server at boot |
| `CV_INDEXABLE` | `false` | the one indexing flag; only `true` lifts noindex on the landing |
| `CV_REVISION` | set by the image build arg | the commit reported by `/health` and `/api/v1/meta` |
| `HOSTNAME` | `0.0.0.0` | bind address; also keeps the proxy's rewrites internal (a loopback name would not) |

Secrets: none. The next wave adds the Janua client (`janua.client.yaml`, names only) and a session
key through the intake; the data wave adds the database URL. Each arrives by name through
`enclii secrets intake`, never `enclii secrets set`.

## Network

Ingress: the app port from the Cloudflare tunnel only. Egress: DNS only (wave 1 calls nothing). The
next wave adds HTTPS (Janua JWKS and token endpoint); the data wave adds Postgres through the pooler.
Keep `enclii.yaml` `network` and `network-policy.yaml` in step: `enclii onboard ensure` renders
policies from `enclii.yaml`.

## First deploy (owner / coordinator steps)

Run each apply only after reading its own dry run; never paste a dry run and its apply together.

1. Merge the baseline pull request (CI and Image green).
2. **Dispatch Build & Deploy** (`gh workflow run build-deploy.yml -R madfam-org/ai-portfolio-builder`).
   It builds on GitHub-hosted runners, pushes `ghcr.io/madfam-org/cv:<sha>`, signs it, and commits the
   digest pin over the all-zero placeholder in `infra/k8s/production/kustomization.yaml` to `main`.
   Confirm the pin commit landed before onboarding.
3. **Onboard** (no database, no object storage, no secrets in wave 1):
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
