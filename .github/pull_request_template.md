## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Boundary checklist

This repository is public (docs/REPO_BOUNDARY.md). Tick each line or explain below why it does not apply.

- [ ] No secret values, tokens, client-id literals or credentials anywhere in the diff, the PR body or CI logs.
- [ ] No cluster topology: no node names, IP addresses, hardware, tunnel ids, secret-store paths or private runbook content.
- [ ] No prices, tiers or invented proof (users, metrics, logos, testimonials); no client identities; synthetic fixtures only.
- [ ] Ecosystem seams are consumed, not rebuilt (Janua for identity, Dhanam for money, Selva for LLMs, Enclii for deploy).
- [ ] Hosts come from the host table (apps/web/src/lib/config.ts), never a scattered literal; madfam.io only.
- [ ] README.md and AGENTS.md still tell the truth after this change.

## Tests

- [ ] New or changed behaviour has tests, and the CI jobs that cover the touched paths are green.

## Notes for the reviewer

<!-- Anything surprising, anything skipped and why, follow-ups. -->
