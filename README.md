# MADFAM CV (working label)

An AI-assisted portfolio / CV builder from Innovaciones MADFAM: it will turn your CV, LinkedIn or
GitHub into a portfolio site you review, edit and publish. **Incubating, pre-launch.** The product
name is not ruled yet; "MADFAM CV" is a working label.

## What is live, honestly

This repository was rebuilt from scratch on 2026-10-22. What it serves today (wave 1), from one
container on MADFAM's own infrastructure (Enclii):

| Host | What you get today |
|---|---|
| `cv.madfam.io` | a pre-launch landing in Spanish (`/`) and English (`/en`): what the product will do, what it is built on, a waitlist link (a plain `mailto:` to hola@madfam.io; no forms, cookies or analytics). Not indexed until the brand is ruled |
| `cv-app.madfam.io` | a pre-launch notice: no accounts yet; sign-in with Janua is coming |
| `cv-api.madfam.io` | `/api/v1/meta` (name, version, the git commit), `/health`, `/ready` |

There are **no accounts, no portfolios, no CV import, no AI and no prices** yet. Nothing here stores
personal data.

The hosts go live when the coordinator dispatches the first build and onboards the project
([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)); until then this is the code that will serve them.

## What comes next

1. Sign-in with Janua (MADFAM's identity service) on `cv-app.madfam.io`, with an owner-scoped data
   model and tests proving one person can never read another's portfolio.
2. The core journey: create, edit and publish a portfolio.
3. Plans and checkout through Dhanam, AI assistance through the Selva gateway, and the remaining
   MADFAM platform seams ([ECOSYSTEM.md](ECOSYSTEM.md)).

## The old code

The previous implementation is preserved at the git tag `legacy-2025-09`. It is not deployed and
is not maintained.

## Develop

Node 22 (≥ 22.18) and pnpm via corepack:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:server
CV_HOST_LANDING=cv.localhost CV_HOST_APP=cv-app.localhost CV_HOST_API=cv-api.localhost pnpm --filter @cv/web dev
# then open http://cv.localhost:3000/ and http://cv-app.localhost:3000/
```

Agents: read [AGENTS.md](AGENTS.md) first.

## Licence

Code: AGPL-3.0-only ([LICENSE](LICENSE)); documentation: MIT ([NOTICE](NOTICE)). © 2026 Innovaciones
MADFAM S.A.S. de C.V. · Cuernavaca, Morelos, México.

Security reports: [SECURITY.md](SECURITY.md) (security@madfam.io or GitHub private reporting).
