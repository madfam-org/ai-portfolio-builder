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

**W6-A:** the owner approved `cv-p.madfam.io` (2026-10-22): «We will be hosting our users' CVs and portfolios in our own
infra and ecosystem». `CV_HOST_PAGES` is set in production and the domain is in `enclii.yaml`; it answers once the
coordinator's DNS and tunnel steps run. Its reads, and cv-api's public reads, are rate limited per client
(docs/DEPLOYMENT.md "Rate limit on unauthenticated reads").

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
  User-Agent `MADFAM-CV-Intake/1.0 (+https://cv.madfam.io/lector; …)`, explained on that page; logs carry the host and outcome, never the URL).
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
  main-thread, no eval, no network), DOCX (`word/document.xml` only, with the W4-I ZIP reader), TXT, HTML (cv's own
  tolerant parser, nothing executed). Only the resulting text is sent. Scanned PDFs and images: «Aún no leemos imágenes» (OCR belongs to tlacuilo,
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
keep their W2 meaning.

**The reader page (W6-A):** `cv.madfam.io/lector` (es-MX) and `/en/lector` explain the link reader to the operators of
the sites it reads: when it fetches (one explicit request by a signed-in person), what (robots.txt, a documented ATS API
or the one page, HTML only), the code's limits, what it never does (crawl, sign in, send cookies, evade blocks, retry a
401/403/429/451, read the boards that forbid it), how to opt out (`User-agent: madfam-cv` / `Disallow: /`) and the
contact, support@madfam.io. Copy: `apps/web/src/lib/copy/reader.ts`; the User-Agent and the token on the page are the
code's own constants. Indexing follows the landing (noindex until `CV_INDEXABLE`); it is in the sitemap when that
exists.

Rejected for now, with reasons in the W5-J report: crawling or searching boards, any login to a
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
| `GET /api/v1/jobs/:id/benchmark` | W5-H: the job's market income range from Symbiosis HCM (INEGI ENOE); 503 `not_configured` while dormant, 503 `benchmark_unavailable` when HCM cannot answer |
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

## Market income range (W5-H)

The job page (`/empleos/:id`) shows «Rango de ingreso en el mercado»: what salaried people in the job's occupation
declare they earn per month, from INEGI's Encuesta Nacional de Ocupación y Empleo (ENOE), as computed and served by
Symbiosis HCM (`GET /api/v1/market-benchmarks/` there). It is official public statistics, not a MADFAM survey, not an
offer and not a prediction. cv is never the data owner: it holds no figure and caches answers only in memory.

- **What leaves cv**: the job title (cleaned, at most 120 characters) and the state as ISO 3166-2:MX, nothing else.
  Never the person's identity, profile or CV. The browser never calls HCM; cv's server does, with its own Janua
  client-credentials token (scope `hcm-benchmarks:read`).
- **State**: the job's structured state field when it has one (lane W5-J), else the location text when it names
  exactly one state («Ciudad de México», «Monterrey, Nuevo León»); otherwise the national figure. The page says which.
- **What is shown, always with its source**: the median, P25-P75 and, when HCM publishes them, P10-P90 (MXN per
  month), n, the quarter and «Datos de la ENOE (INEGI)», the occupation (SINCO) with how the title was classified and
  its confidence, the share of people who declared an amount (as «de cada 100»), and the methodology notes.
- **Withheld, never estimated**: below n = 30 HCM publishes nothing and the page says «sin datos suficientes» with
  n; P10/P90 need n = 100. A title HCM cannot classify, or that fits several occupations, shows no numbers.
- **The posting's salary**: when the job states a monthly MXN salary, the page says between which published
  percentiles it falls (the midpoint of a range), with the caveat that postings are usually gross and the ENOE
  records declared amounts. Any other period or currency is shown as not comparable.
- **Dormant by default**: without `HCM_API_URL`, `HCM_CLIENT_ID` and `HCM_CLIENT_SECRET` the route answers 503
  `not_configured` and the panel says the comparison is not available yet. HCM down or slow (3 s budget, circuit
  breaker after 3 failures for 30 s): 503 `benchmark_unavailable`; the rest of the page is unaffected.

## Luxury retail beta (W7, B3)

The first beta persona works in luxury retail in Mexico and is looking for a comparable or better role in Mexico
City while employed. What cv does for that search, and what it deliberately does not do:

### Luxury career sites

Checked on 2026-10-22 by fetching each house's public careers page, its `robots.txt` and, where reachable, one job
page and the terms of use (the lane report lists every URL). **No provider these houses use publishes a key-free
public posting API**, so no new ATS reader was added; their job pages go through the existing page path, each only
when its `robots.txt` allows it:

| System (who uses it, as observed) | How cv reads one posting |
|---|---|
| SAP SuccessFactors Career Site Builder (Prada Group, Burberry, Sephora, El Palacio de Hierro) | schema.org `JobPosting` **microdata** (`http://schema.org`); its Java-style `datePosted` («Wed Oct 14 00:00:00 UTC 2026») is now read; its XML job feeds are per-customer for contracted boards, not a public API |
| Workday (Chanel, Kering, Richemont tenants) | the job page's **JSON-LD** (entity-escaped names decoded); `/wday/cxs/` JSON is undocumented and never called. Some tenants' `robots.txt` disallow their site (`Disallow: /Kering/`, `/richemont/`): cv also checks the path **without its locale segment** (`/en-US/Kering/…` → `/Kering/…`) and refuses either |
| Oracle Recruiting Cloud (Hermès, Tiffany & Co.) | client-rendered; only the Open Graph title and description are readable by a server (the bookmark reads the full page in the person's browser). Oracle reserves its candidate-experience REST resources for internal use |
| Eightfold (Kering's front end), Lumesse/Cornerstone TalentLink (Dior and, by reference scheme, other LVMH maisons) | customer API key / no public documentation: capture from the browser |
| lvmh.com (the group's listing of maison postings) | **capture-only** (`boards.ts`): robots allows, but the legal terms reserve the content for personal and private use and prohibit extraction |
| Sites behind bot protection (careers.chanel.com, careers.richemont.com, jobs.louisvuitton.com, liverpool.com.mx, Computrabajo) | the 403 is reported honestly («bloqueó la lectura automática») and never evaded; capture, paste or file |

A posting that is **no longer open** but still answers 200 (Workday `postingAvailable: false`, a SuccessFactors
«Sorry, this position has been filled» page, the Spanish and English equivalents) is now the failure
`posting_closed` instead of a draft made of the site's navigation (`ingest/closed.ts`); a live JobPosting always wins.

### Retail and luxury content, languages, discretion

- **Profile:** a folded «Ideas para ventas de lujo y retail» guide inside the forms of experience, achievements,
  skills, languages, certifications and projects (`components/profile/SectorGuide.tsx`, `SECTOR_GUIDE_COPY` in
  `lib/copy/profile.ts`): what luxury hiring looks for (target attainment, average ticket, UPT, conversion, client book
  size and retention, clienteling and CRM, VIC events, product and brand training, visual merchandising, languages with
  their CEFR level, team leadership), example formats whose figures are marked illustrative, and suggested keywords the
  person adds to the item's tags with one click. No schema change: every field already existed.
- **Languages per job:** the tailoring workspace's language control is a plain radio group that says what changes
  (section titles, dates) and what does not (the person's own text, translated per item under «Ajustar el texto para
  este empleo»), lists the languages the job's documents already exist in, and offers «Preparar también la versión en
  inglés» after a set is created. A version in a language other than the profile's carries « (English)» or
  « (Español)» in its title. `/documentos/:id` keeps its own per-document language.
- **Templates:** the «Clásica» CV description says it suits luxury houses; nothing is chosen automatically.
- **Discretion:** before a document becomes link-shared or public, the publish panel shows «Búsqueda confidencial»:
  who will see it, that a link can be forwarded, that indexing stays off unless ticked, and the document's current
  title (shown in the browser tab and when shared), with where to change it. cv sends no e-mail about jobs or
  documents; the public reads carry the document, the profile header and the chosen items, never the job.
- **General market, said out loud (W7)**: the general figure carries «Mercado general: todas las empresas y tiendas de
  esta ocupación, de cualquier giro y tamaño».
- **Retail segment (W7)**: when HCM resolves the title to a store sales or store management occupation (SINCO 4211,
  4201, 1411, 1711; decided from the code alone, never from a company or brand), cv asks HCM a second time by SINCO,
  with the same state and `segment=retail_apparel_personal`: the same ENOE statistic counting only people whose
  employer is a store of clothing, footwear, accessories or personal items (SCIAN 4631/4651). The panel shows HCM's
  exact label, which ends «no solo lujo», with its own n, quarter and source; «sin datos suficientes» when withheld;
  «no disponible» when HCM cannot answer (the general figure stays). Only the SINCO code, the state and the segment id
  leave cv on that call.
- **Above the general P90 (W7)**: a neutral note says the ENOE does not separate luxury houses from other employers
  and that commission-based roles often report income differently from a posting's pay. The panel never calls an
  offer high, atypical or an outlier.
