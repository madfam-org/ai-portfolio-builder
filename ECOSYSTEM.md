# Ecosystem roles

> Last Updated: 2026-10-22
>
> Boundary checkpoint (2026-10-22): roles only. MADFAM's private ops repository owns topology,
> operator procedures and secret handling; see [docs/REPO_BOUNDARY.md](docs/REPO_BOUNDARY.md).

MADFAM CV (working label) **owns** the portfolio product: the landing, the editor and publishing
journey (from the next waves), the portfolio data model and the public portfolio pages. It
**consumes** everything else and never re-implements it:

| Capability | Owner | How this product uses it | When |
|---|---|---|---|
| Deploy, domains, tunnel routes, status, secret intake | Enclii | `enclii.yaml`, `infra/k8s/production/` | wave 1 (now) |
| Sign-in, sessions, account switching, service tokens | Janua | OIDC authorization code with PKCE on the app host; RS256 tokens of audience `cv-api` on the API (`janua.client.yaml`) | next wave |
| Database | Enclii onboarding (Postgres through the platform pooler) | owner-scoped portfolio rows keyed by the Janua `sub` | data wave |
| Object storage | Enclii onboarding (R2) | uploaded CVs and images, public and private buckets split | later |
| LLM inference (CV text is personal data) | Selva gateway (`/v1`) | the only inference path, sensitivity `restricted` | later |
| Catalog, checkout, entitlements | Dhanam | plans and checkout, entitlements read from the Janua claim; no payment key in this app | later |
| CFDI | Karafiel, via Dhanam | none in this app | later |
| Product email | the platform sender, through Janua (auth mail) and Angelia Courier | never direct | later |
| Analytics | self-hosted Plausible | cookieless; off until configured | later |
| Consent and attribution | PhyndCRM | never rebuilt in-app | later |
| User custom domains | Enclii custom hostnames | the app never holds a DNS provider token | later |

Today (wave 1) the product holds no money, no identity, no personal data and no secret.
