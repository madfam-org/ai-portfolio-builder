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
| `/ajustes` | account and data settings: download my data (cv JSON or JSON Resume), delete my data | W4-I |

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

## API (cv-api.madfam.io, bearer Janua token of audience `cv-api`)

| Method and path | What |
|---|---|
| `GET /api/v1/me` | `{sub}` |
| `GET`, `PUT /api/v1/profile` | the profile and its items; full replace of the editable fields |
| `GET`, `POST /api/v1/profile/items`; `GET`, `PATCH`, `DELETE /api/v1/profile/items/:id` | profile items |
| `POST /api/v1/profile/items/reorder` `{itemIds}` | «Subir» / «Bajar»: positions 0..n-1 in one transaction; any foreign id refuses all (422) |
| `GET`, `POST /api/v1/jobs`; `GET`, `PATCH`, `DELETE /api/v1/jobs/:id` | jobs (deleting a job that still has artifacts is a 409) |
| `GET /api/v1/jobs/:id/match` | the deterministic match |
| `GET /api/v1/artifacts?job_id=&kind=`, `POST /api/v1/artifacts`; `GET`, `PATCH`, `DELETE /api/v1/artifacts/:id` | artifacts |
| `POST /api/v1/artifacts/batch` `{jobId?, locale?, template?, artifacts: [{kind, title, content, template?}] (1-4)}` (templates: the registry allowlist per kind) | several artifacts for one job in ONE transaction: all or none |
| `POST /api/v1/artifacts/:id/publish` `{visibility:'link'}` or `{visibility:'public', slug, indexable?}`; `POST /api/v1/artifacts/:id/unpublish` | sharing (publishing: at most 20 per owner per 24 h, then 429 `publish_limit`) |
| `GET /api/v1/public/a/:slug`, `GET /api/v1/public/s/:token` | public reads (no token) |
| `POST /api/v1/profile/items/batch` `{items: [{kind, content, tags?}] (≤300), profile?: {displayName?, headline?, summary?, contact?}}` | W4-I import: every item validated per kind, appended after the existing ones, chosen header fields applied (contact links added by URL), ONE transaction: all or none |
| `GET /api/v1/me/export[?format=full\|json-resume]` | W4-I «Descargar mis datos»: everything the owner holds (`schema: "madfam-cv-export"`, `version: 1`; share state included; never the owner key) or the profile as JSON Resume v1.0.0; `Content-Disposition: attachment`, `no-store` |
| `DELETE /api/v1/me` `{confirm: "delete-all-my-data"}` | W4-I «Eliminar mis datos»: every row of the owner in ONE transaction (published pages stop at once); the Janua account is not touched |

Abuse ceilings (`apps/web/src/server/api/limits.ts`; not product tiers, the owner may tune them): a request body is at
most 256 KiB (413 `body_too_large`; the server never buffers more than 512 KiB of any body, `next.config.ts`), and one
person holds at most 500 profile items, 500 jobs and 1 000 artifacts (creating past a ceiling is 429
`quota_exceeded` with `resource` and `limit`; nothing is stored).

Bodies are validated with zod and strict: an unknown field is a 400, so `owner_sub`, ids, status, tokens and
timestamps can never be set from a body. The app (`cv-app.madfam.io`) reaches the same handlers through its
same-origin proxy `/api/v1/*`, which adds the signed-in person's access token on the server.
