# Product: one core profile, a tailored CV for every job

> Last Updated: 2026-10-22. Status: incubating, pre-launch. The brand is not ruled ("MADFAM CV" is a working
> label). Nothing below is offered to the public until sign-in is configured and the coordinator says so.

## The owner requirement (verbatim, 2026-10-22)

> «A key feature of our portfolio and job-specific CV builder is precisely that: it needs to be able to take core
> information from the user/applicant, and then be fed a range of jobs and be able to produce a matching range of
> tailored CVs/portfolios/presentations/frontends for each job which is being applied for»

## The model (W2)

One person (a Janua `sub`) has:

| Table | What it holds | Rules |
|---|---|---|
| `profiles` | ONE core profile: display name (prefilled from Janua's `name` claim, editable), headline, summary, locale, contact (user-entered email, phone, location, links) | `unique (owner_sub)` |
| `profile_items` | the building blocks: experience, education, skill, project, certification, achievement, language, publication, volunteering, award, link. Each has a `position`, a `content` validated per kind (dates live inside the content) and `tags` (keywords for matching) | composite FK `(profile_id, owner_sub)` |
| `jobs` | the jobs applied to: title, company, location, source URL, the posting text the person pastes (required, at most 50 000 characters), `parsed` (filled by Selva in W6; null now), status (saved → applying → applied → interview → offer / rejected / archived), notes | `unique (id, owner_sub)` |
| `artifacts` | the tailored outputs: kind `cv`, `portfolio`, `presentation` or `cover_letter`; `job_id` null for a general artifact or set for one tailored to a job (several per job and kind are allowed: versions); `content` = ordered profile item ids + per-item overrides + free text blocks (+ slides for a presentation) | composite FK `(job_id, owner_sub)`; every referenced item id must belong to the same owner (checked in the same transaction) |

Every row carries `owner_sub`; every parent has `unique (id, owner_sub)`; children point at it with a composite
FK, so no row can hang under another person's row even if the code is bypassed. Every repository function takes
`ownerSub` first; another person's id is a 404, the same as a missing one.

### Sharing

An artifact is private until its owner publishes it:

- **`link`**: a 256-bit random share token; readable at `GET /api/v1/public/s/<token>` by whoever has the link,
  always `X-Robots-Tag: noindex`.
- **`public`**: a slug the owner chooses (3–64 characters, `a-z 0-9 -`, never a reserved word such as `api`,
  `admin`, `health`); readable at `GET /api/v1/public/a/<slug>`. Search indexing is the owner's explicit choice
  (`indexable`, default off).
- Unpublishing returns the artifact to private `ready`; the token and the slug stop working at once. Drafts and
  private artifacts are never readable publicly, a link artifact is never reachable by slug and a public one
  never by token (database CHECK constraints plus tests).
- **Moderation**: an operator can suspend an artifact (`suspended_at`, `suspended_reason`); a suspended artifact is
  never served publicly and its owner cannot publish it again (docs/DEPLOYMENT.md "Moderation").

The public reads are plain JSON on cv-api. The rendered pages live on a separate flat host for user content (W3-1;
working label `cv-p.madfam.io`, the label is the owner's call): `/<slug>` and `/l/<token>`, inert until `CV_HOST_PAGES`
names it. The host is read from configuration, never hard-coded.

### The app (cv-app.madfam.io), declared in W3-1

| Path (en under `/en`) | Page | Built in |
|---|---|---|
| `/` | home: the three parts of the journey | W3-1 |
| `/perfil` | the core profile and its items | W3-2 |
| `/empleos`, `/empleos/:id` | jobs pipeline, one job | W3-3 |
| `/empleos/:id/adaptar` | tailoring workspace: keyword match (no AI), selection, overrides, «Crear CV, portafolio y presentación» | W3-3 |
| `/documentos`, `/documentos/:id` | artifacts, the editor and the publish dialog | W3-4 |
| `/documentos/:id/vista-previa`, `/documentos/:id/imprimir` | preview (same renderer as the pages host), print view | W3-4 |
| `/ajustes` | account and data settings | later |

### Documents: renderers, preview, print and publish (W3-4)

- **One renderer per kind** (`apps/web/src/components/render/`): `cv/base` (ATS-friendly: one column, semantic
  headings, standard section names, real text, A4 or Carta print), `portfolio/base` (one-page site), `presentation/base`
  (HTML slides; ←/→, Space, Home/End; print = one 13.333 × 7.5 in slide per page) and `cover_letter/base`. Each is
  driven only by the artifact's content (ordered item ids, per-item overrides, text blocks, slides) resolved against the
  owner's profile on the server (`model.ts`); the cv-app preview, the print view and the pages host share it. React text
  only, no images, http(s) links with `rel="ugc nofollow noopener noreferrer"`, nothing invented.
- **PDF = the browser's print** («Guardar como PDF» from `/documentos/:id/imprimir`), which keeps a real text layer;
  no server-side PDF yet.
- **Publish** from `/documentos/:id`: private, by link (`/l/<token>` on the pages host; never indexed; «Cambiar enlace»
  rotates it) or public at a chosen address (reserved words refused; «Permitir que buscadores indexen esta página» maps
  to `indexable`, off by default). At most 20 different documents published per 24 hours (429 `publish_limit`, stated in
  the UI). A suspended document says so and cannot be shared. Publishing is off while the pages host is not configured.

### Templates (W4-T)

- **One registry** (`apps/web/src/lib/templates.ts`): kind → templates, with es/en labels, a one-line trade-off and,
  for CVs and letters, the ATS note. It is the API's allowlist, the renderer table's key list (a unit test keeps them
  equal) and the pickers' source. Ids are append-only: once stored, never removed or renamed.

  | Kind | Templates |
  |---|---|
  | `cv` | `base` (one column, system fonts; «Pensado para sistemas ATS»), `compacto` (denser single column), `clasico` (serif typographic hierarchy, single column) |
  | `portfolio` | `base` (cards), `lista` (one column, no cards) |
  | `presentation` | `base` (light), `contraste` (dark slides on screen, black on white when printed) |
  | `cover_letter` | `base`, `formal` (traditional letter, serif; adds no date or recipient) |

- A template **restyles the same semantic markup** (`components/render/templates.module.css`), never restructures it:
  every CV template is one column of real text under h1–h3, no layout tables, no images, no ligatures (so «fi» reaches
  the PDF text layer as letters). There is deliberately no two-column or graphic CV.
- **Allowlist:** a template outside its kind's list is a 400 `invalid_body` on `template` (create, PATCH against the
  stored kind) or on `artifacts.N.template` (batch, where each document may name its own `template`; absent → the set's).
  Rows stored before the allowlist keep rendering (fallback to `base`, logged) and stay editable without sending
  `template`.
- **Pickers:** one per chosen kind in `/empleos/:id/adaptar`; a radio group with each trade-off on `/documentos/:id`
  (saving updates the artifact; a published one changes its public page at once, as the picker says).
- **Print:** every template prints on Carta and A4 (e2e: every page's size, the name and every entry in the PDF text
  layer of a multi-page CV) and the presentation on 13.333 × 7.5 in pages.

### Tailoring before AI: `GET /api/v1/jobs/:id/match`

A deterministic, AI-free score of each profile item against a job posting (`keyword-overlap-v1`, in
`apps/web/src/server/api/match.ts`): Spanish and English text is lower-cased and stripped of accents and
stopwords; a tag scores 3 when all its words appear in the posting and each other matching word of the item
scores 1; items are ranked by score, then position. It also lists the posting's most frequent words that no item
covers. It calls no network and no model. Assisted writing through Selva arrives in W6.

### Data portability and data rights (W4-I)

- **Import** on `/perfil`: the person's OWN LinkedIn data export ZIP («Download your data»,
  <https://www.linkedin.com/help/linkedin/answer/50191>) or a JSON Resume `.json`, read **in the browser**
  (`src/components/import/`): from the ZIP only the index and the career files are opened (Profile, Positions,
  Education, Skills, Certifications, Languages, Projects, Honors, Publications, Volunteering; categories per
  <https://www.linkedin.com/help/linkedin/answer/a1339364>); messages, connections and every other file are never read.
  LinkedIn does not publish its CSV headers, so each field is found by header aliases (English and Spanish). A grouped
  preview (duplicates of existing items unchecked, «ya existe») is sent only on confirmation, as one batch call. No AI,
  no scraping, no connection to LinkedIn.
- **Export and deletion** on `/ajustes`: «Descargar mis datos» (full JSON), «Exportar como JSON Resume», «Eliminar mis
  datos» behind a typed «ELIMINAR»; the Janua account is managed in Janua (linked, never deleted from here).

### Job intake (W5-J): link, ATS, paste, file, browser capture

`/empleos/nuevo` brings a posting in four ways, all ending in ONE preview where every field shows where it came from
(«de los datos estructurados (JSON-LD)», «del texto», «de la API pública del sistema de reclutamiento» …) and can be
edited. **Nothing is stored before «Guardar vacante»** (`POST /api/v1/jobs`, the job ceiling applies); no AI is used.

- **Link** (`POST /api/v1/jobs/intake {source:'url'}`), fetched by cv's server once, only on that explicit POST by the
  signed-in owner, through an SSRF guard (`apps/web/src/server/ingest/fetcher.ts`: https and port 443 only, no userinfo,
  DNS resolved and EVERY answer checked public, the socket pinned to the vetted address, every redirect re-checked,
  at most 3; no cookie or credential sent; 2 MB after decompression; 8 s for the whole chain; HTML or JSON only;
  User-Agent `MADFAM-CV-Intake/1.0 (+https://cv.madfam.io/; …)`; logs carry the host and outcome, never the URL).
  Order: a board that forbids server reads → `capture_only` (LinkedIn, Indeed, Google, Glassdoor, Talent.com,
  Computrabajo; `ingest/boards.ts`); a known ATS → its public, key-free API (Greenhouse, Lever, SmartRecruiters, Ashby,
  Workable, Recruitee, Pinpoint; `ingest/ats.ts` cites the provider docs); otherwise robots.txt for the token
  `madfam-cv` (RFC 9309: 4xx allows, 5xx or unreachable disallows), then the page, read as schema.org `JobPosting`
  JSON-LD → microdata → Open Graph → labeled lines of the readable text. A 401/403/429 from the site is reported
  («bloqueó la lectura automática») and never retried or evaded. Per owner: 20 link reads per 10 minutes and 100 per
  day, 120 intake calls per 10 minutes, in memory per pod (no log of the sites a person reads is kept).
- **Paste** (`{source:'text', kind:'paste'}`): labeled lines («Empresa:», «Ubicación:», «Sueldo:», «Job type:» …), a
  line that is only a work mode («Remoto», «Home office», «Híbrido», «Presencial»), the first line as a title
  suggestion; a pasted page's HTML or JSON-LD is read as a page.
- **File**, read in the browser: PDF text layer (pdf.js, `pdfjs-dist`, Apache-2.0, loaded only when a PDF is picked,
  main-thread, no eval, no network), DOCX (`word/document.xml` only, with the W4-I ZIP reader), TXT, HTML (DOMParser,
  inert). Only the resulting text is sent. Scanned PDFs and images: «Aún no leemos imágenes» (OCR belongs to tlacuilo,
  not available to cv yet; typed seam in `ingest/seams.ts`).
- **«Capturar desde tu navegador»**: a bookmark (generated and served by cv-app itself) that, on the job page the
  person has open, reads that page's JobPosting JSON-LD, og:/description meta, JobPosting microdata and visible text,
  and opens `/empleos/capturar` with the data in the URL FRAGMENT (never sent to a server; cleared from the address bar
  at once; kept in the tab's sessionStorage if sign-in comes first). cv-app's CSP, COOP and same-origin checks are
  unchanged: the capture page posts to its own same-origin intake. Any page could open that URL with any fragment;
  that is no more than a paste, and nothing is stored until the person saves.

**Typed job fields** (migration `0002_job_intake_fields`, additive and nullable; rows from before keep working). W5-H
(HCM benchmarking) reads them; the vocabularies live in `apps/web/src/server/ingest/vocab.ts` and are append-only:

| Column (API field) | Meaning |
|---|---|
| `source_kind` (`sourceKind`) | how the job arrived: `paste`, `url`, `ats`, `capture`, `pdf`, `docx`, `file`; null before W5-J; set at creation only |
| `country_code` (`countryCode`) | ISO 3166-1 alpha-2 (`MX`), only when stated |
| `state_code` (`stateCode`) | ISO 3166-2 (`MX-JAL`), only when exactly one Mexican entity is named unambiguously (`ingest/mx.ts`) |
| `employment_type` (`employmentType`) | `full_time`, `part_time`, `contract`, `temporary`, `internship`, `volunteer`, `per_diem`, `other` |
| `work_mode` (`workMode`) | `onsite`, `hybrid`, `remote` |
| `salary_min`, `salary_max` (`salaryMin`, `salaryMax`) | numeric(14,2), a STATED salary only (never `estimatedSalary`); min ≤ max |
| `salary_currency` (`salaryCurrency`) | ISO 4217 (`MXN`), only when written («$» alone is no currency) |
| `salary_period` (`salaryPeriod`) | `hour`, `day`, `week`, `month`, `year`; null when not written (e.g. «quincenal») |
| `date_posted`, `valid_through` (`datePosted`, `validThrough`) | dates (`YYYY-MM-DD`) |

A currency or period without an amount is refused (API 400 and a database CHECK); `title`, `company` and `location`
keep their W2 meaning. Rejected for now, with reasons in the W5-J report: crawling or searching boards, any login to a
board, e-mail forward-in (Angelia has no inbound mail), a PWA share target (shares a link only, which the blocked boards
do not serve), OCR in cv, AI parsing (Selva's restricted tier answers 503; typed seam, off).

## API (cv-api.madfam.io, bearer Janua token of audience `cv-api`)

| Method and path | What |
|---|---|
| `GET /api/v1/me` | `{sub}` |
| `GET`, `PUT /api/v1/profile` | the profile and its items; full replace of the editable fields |
| `GET`, `POST /api/v1/profile/items`; `GET`, `PATCH`, `DELETE /api/v1/profile/items/:id` | profile items |
| `POST /api/v1/profile/items/reorder` `{itemIds}` | «Subir» / «Bajar»: positions 0..n-1 in one transaction; any foreign id refuses all (422) |
| `GET`, `POST /api/v1/jobs`; `GET`, `PATCH`, `DELETE /api/v1/jobs/:id` | jobs (deleting a job that still has artifacts is a 409); W5-J typed posting fields optional (see "Job intake") |
| `GET /api/v1/jobs/:id/match` | the deterministic match |
| `GET /api/v1/artifacts?job_id=&kind=`, `POST /api/v1/artifacts`; `GET`, `PATCH`, `DELETE /api/v1/artifacts/:id` | artifacts |
| `POST /api/v1/artifacts/batch` `{jobId?, locale?, template?, artifacts: [{kind, title, content, template?}] (1-4)}` (templates: the registry allowlist per kind) | several artifacts for one job in ONE transaction: all or none |
| `POST /api/v1/artifacts/:id/publish` `{visibility:'link'}` or `{visibility:'public', slug, indexable?}`; `POST /api/v1/artifacts/:id/unpublish` | sharing (publishing: at most 20 per owner per 24 h, then 429 `publish_limit`) |
| `GET /api/v1/public/a/:slug`, `GET /api/v1/public/s/:token` | public reads (no token) |
| `POST /api/v1/profile/items/batch` `{items: [{kind, content, tags?}] (≤300), profile?: {displayName?, headline?, summary?, contact?}}` | W4-I import: every item validated per kind, appended after the existing ones, chosen header fields applied (contact links added by URL), ONE transaction: all or none |
| `GET /api/v1/me/export[?format=full\|json-resume]` | W4-I «Descargar mis datos»: everything the owner holds (`schema: "madfam-cv-export"`, `version: 1`; share state included; never the owner key) or the profile as JSON Resume v1.0.0; `Content-Disposition: attachment`, `no-store` |
| `DELETE /api/v1/me` `{confirm: "delete-all-my-data"}` | W4-I «Eliminar mis datos»: every row of the owner in ONE transaction (published pages stop at once); the Janua account is not touched |
| `POST /api/v1/jobs/intake` `{source:"url", url}` · `{source:"text", kind?, text}` · `{source:"capture", kind?, capture}` | W5-J: a PREVIEW of a job (`{draft}`: fields with their provenance, the posting text, notes); nothing stored. 422 `intake_failed` with a `reason` (`capture_only` + `board`, `robots_disallowed`, `private_address`, `blocked_by_site` + `status`, `unreadable` …); 429 `rate_limited` (`retryAfter`) or `quota_exceeded` (checked before any fetch) |

Abuse ceilings (`apps/web/src/server/api/limits.ts`; not product tiers, the owner may tune them): a request body is at
most 256 KiB (413 `body_too_large`; the server never buffers more than 512 KiB of any body, `next.config.ts`), and one
person holds at most 500 profile items, 500 jobs and 1 000 artifacts (creating past a ceiling is 429
`quota_exceeded` with `resource` and `limit`; nothing is stored).

Bodies are validated with zod and strict: an unknown field is a 400, so `owner_sub`, ids, status, tokens and
timestamps can never be set from a body. The app (`cv-app.madfam.io`) reaches the same handlers through its
same-origin proxy `/api/v1/*`, which adds the signed-in person's access token on the server.
