# Repository boundary

> Last Updated: 2026-10-22

`madfam-org/ai-portfolio-builder` is a **public** repository. It owns MADFAM CV (working label):
the landing, the app and the API served at `cv.madfam.io`, `cv-app.madfam.io` and `cv-api.madfam.io`,
their tests, deployment manifests and product documentation.

Keep here: product code, tests with synthetic fixtures, secret **names**, deployment manifests with
placeholder digests, and documentation that is true today.

Never put here:

- secret values, tokens, `jnc_` client-id literals or credentials of any kind;
- node hostnames, IP addresses, hardware, cluster names or tunnel ids;
- secret-store paths or break-glass procedures (production operations are Enclii-first);
- raw links into MADFAM's private ops repository (name a document, never link it);
- hand-typed prices, tiers, revenue plans or market sizing;
- client identities, people's names beyond the public maintainer handles, or private evidence;
- local packages named `@madfam/*` (use `@cv/*` with `"private": true`);
- the `.com` domain that shares MADFAM's name: it belongs to a third party. `madfam.io` is canonical.

Enclii owns routine deployment, observability and secret intake. Licensing, naming, visibility and
access rulings remain with the owner. A test skip or an unavailable dependency is not verification,
and a pending CI run is not green.

Canonical policy: the MADFAM repository boundary contract, kept in MADFAM's private ops repository.
The [public ecosystem contract hub](https://github.com/madfam-org/solarpunk-foundry) owns shared public
ecosystem guidance.
