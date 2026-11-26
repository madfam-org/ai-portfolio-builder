# Ecosystem roles

> Last Updated: 2026-11-26
>
> Boundary checkpoint (2026-10-22): roles only. MADFAM's private ops repository owns topology,
> operator procedures and secret handling; see [docs/REPO_BOUNDARY.md](docs/REPO_BOUNDARY.md).

MADFAM CV (working label) **owns** the portfolio product: the landing, the editor and publishing
journey, the portfolio data model and the public portfolio pages (invite-only private beta since 2026-11). It
**consumes** everything else and never re-implements it:

| Capability | Owner | How this product uses it | When |
|---|---|---|---|
| Deploy, domains, tunnel routes, status, secret intake | Enclii | `enclii.yaml`, `infra/k8s/production/` | wave 1 (now) |
| Sign-in, sessions, account switching, service tokens; the beta's invite gate (`cv` entitlement) | Janua | OIDC authorization code with PKCE on the app host; RS256 tokens of audience `cv-api` on the API (`janua.client.yaml`) | now |
| Database | Enclii onboarding (Postgres through the platform pooler) | owner-scoped portfolio rows keyed by the Janua `sub` | now |
| Object storage | Enclii onboarding (R2) | uploaded CVs and images, public and private buckets split | later |
| LLM inference (CV text is personal data) | Selva gateway (`/v1`) | the only inference path, sensitivity `restricted` | later |
| Catalog, checkout, entitlements | Dhanam | plans and checkout, entitlements read from the Janua claim; no payment key in this app | later |
| CFDI | Karafiel, via Dhanam | none in this app | later |
| Product email | the platform sender, through Janua (auth mail) and Angelia Courier | never direct | later |
| Analytics | self-hosted, first-party and cookieless only (R41, amended 2026-11-12: Umami if its staging check passes, otherwise Plausible) | none deployed as of 2026-11-26; no analytics code in this app | later |
| Market income range per job (INEGI ENOE) | Symbiosis HCM (`GET /api/v1/market-benchmarks/`) | client credentials; only the job title (or occupation code) and the state leave cv, never the person ([docs/PRODUCT.md](docs/PRODUCT.md) «Market income range») | now |
| Reading images (OCR) of job postings | tlacuilo (`text_document` lane) | client credentials, one page image per call, nothing stored ([AGENTS.md](AGENTS.md) «Reading images through tlacuilo») | built, dormant |
| Consent and attribution | PhyndCRM | never rebuilt in-app | later |
| User custom domains | Enclii custom hostnames | the app never holds a DNS provider token | later |

Today the product holds the beta's personal data (profiles, jobs, documents; [privacy notice](https://cv.madfam.io/privacidad)) and the secrets the env contract names ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)); it holds no money and no identity of its own.

## Paper physics: Pliego (W5-P, 2026-10-22)

| Capability | Owner | How this product uses it | When |
|---|---|---|---|
| Paper stocks (grammage, caliper, colour, bending stiffness, scoring) and print folds | Pliego (`pliego.madfam.io`) | build-time, pinned copies of two stock cards and of the letter fold its kernel computes (`apps/web/src/lib/pliego/vendor/`, CERN-OHL-W-2.0); screen-only paper preview and printing advice; no runtime call | now |
