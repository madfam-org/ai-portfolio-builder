# MADFAM CV (working label)

A job-specific CV and portfolio builder from Innovaciones MADFAM: you enter your core profile once, add the
jobs you apply to, and get a tailored CV, portfolio and presentation for each job, which you review, edit and
publish ([docs/PRODUCT.md](docs/PRODUCT.md)). **Incubating, in an invite-only private beta.** The product name is not
ruled yet; "MADFAM CV" is a working label.

## What is live, honestly

An **invite-only private beta** (2026-11-16), from one container on MADFAM's own infrastructure (Enclii). Accounts are
Janua's and invite-only: nobody signs up here ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) «Beta access»).

| Host | What you get today |
|---|---|
| `cv.madfam.io` | the landing in Spanish (`/`) and English (`/en`), the privacy notice (`/privacidad`, approved, version 2026-11-16.1) and the job-link reader page (`/lector`). Not indexed until the brand is ruled |
| `cv-app.madfam.io` | the app, after signing in with Janua: the core profile, jobs, tailoring and documents (below) |
| `cv-p.madfam.io` | the documents people choose to publish: `/<slug>` (public) and `/l/<token>` (by link); noindex unless the owner opts in |
| `cv-api.madfam.io` | the owner-scoped API (`/api/v1/*`, Janua bearer tokens), `/health`, `/ready` |

What a beta account can do ([docs/PRODUCT.md](docs/PRODUCT.md) has the model and every rule):

- **One core profile**, bilingual field by field (es-MX / English): experience, education, skills, projects,
  certifications, languages, achievements, awards, publications, volunteering, recommendations received and links.
- **Import** it, in the browser: the LinkedIn data-export ZIP, the LinkedIn «Save to PDF» file, or a JSON Resume file;
  a preview marks what already exists before anything is saved. Export everything (and JSON Resume) or delete it all
  from «Ajustes».
- **Jobs**: from a link (public ATS APIs, structured data, the page text, robots.txt respected), pasted text, a file,
  or a bookmark that captures the open page; each job shows an AI-free keyword match against the profile and, from
  Symbiosis HCM, the official income range for its occupation (INEGI ENOE).
- **Tailored documents per job** (CV, portfolio, presentation, cover letter; 2–3 templates each): pre-selected in CV
  order from the match, editable in place afterwards, previewed, printed to PDF by the browser (with an estimate of
  the page count before printing) and published privately, by link or publicly.

**Not live:** AI writing (waits for the Selva gateway and the owner's rulings), plans and payments (Dhanam), reading
images through tlacuilo (built, dormant). No analytics, no ads, no data sold ([privacy notice](https://cv.madfam.io/privacidad)).

## What comes next

Beta readiness: a first-run checklist on «Inicio» (the cover-letter body is done), the remaining design critique (public pages,
landing voice, the long profile on phones), a feedback channel once the owner picks one, then the first invitations.
After that: AI assistance through Selva, plans through Dhanam, and the remaining MADFAM seams
([ECOSYSTEM.md](ECOSYSTEM.md)). Open rulings live in [AGENTS.md](AGENTS.md) «Pending rulings».

Dependency updates: Dependabot covers the Dockerfile base image and the pinned GitHub Actions (weekly); npm updates are off by
owner ruling (2026-11-22), so npm versions move by hand in pull requests (`.github/dependabot.yml`).

## The old code

The previous implementation remains in the history up to commit `7959f356` (no longer tagged). It is not deployed and
is not maintained.

## Develop

Node 22 (≥ 22.18; `.nvmrc` names the exact version the production image runs) and pnpm via corepack:

```bash
corepack enable
pnpm install --frozen-lockfile --ignore-scripts   # as CI and the Dockerfile: no package install scripts
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:server
# with a throwaway Postgres (see AGENTS.md "Commands"): pnpm test:pg, then pnpm test:e2e (Playwright, Chromium)
CV_HOST_LANDING=cv.localhost CV_HOST_APP=cv-app.localhost CV_HOST_API=cv-api.localhost pnpm --filter @cv/web dev
# then open http://cv.localhost:3000/ and http://cv-app.localhost:3000/
```

Agents: read [AGENTS.md](AGENTS.md) first (`CLAUDE.md` only points there).

## Documentation map

| File | What it holds |
|---|---|
| [AGENTS.md](AGENTS.md) | how to work here: doctrine, layout, commands, CI lanes, pending rulings, per-wave notes |
| [docs/PRODUCT.md](docs/PRODUCT.md) | the product model and every behaviour rule (import, intake, match, tailoring, documents, bilingual text, privacy) |
| [docs/DESIGN.md](docs/DESIGN.md) | the design system («The Tailor's Atelier»): tokens, type, components; read before any UI change |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | the env contract, activation and observability |
| [docs/REPO_BOUNDARY.md](docs/REPO_BOUNDARY.md) | what never goes into this public repository |
| [ECOSYSTEM.md](ECOSYSTEM.md) | the MADFAM services cv consumes (Janua, Dhanam, Selva, Enclii, HCM, Pliego, tlacuilo) |
| [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) | contributing; reporting a vulnerability |

## Licence

Code: AGPL-3.0-only ([LICENSE](LICENSE)); documentation: MIT ([NOTICE](NOTICE)). © 2026 Innovaciones
MADFAM S.A.S. de C.V. · Cuernavaca, Morelos, México.

Security reports: [SECURITY.md](SECURITY.md) (security@madfam.io or GitHub private reporting).
