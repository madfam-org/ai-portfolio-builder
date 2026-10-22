# Contributing

> Boundary checkpoint (2026-10-22): guide. Operational detail stays out of this repository per the
> repo-boundary contract ([docs/REPO_BOUNDARY.md](docs/REPO_BOUNDARY.md)).

1. **Read [AGENTS.md](./AGENTS.md)** for the doctrine, the layout and the CI lanes.
2. **Run the checks** before you push: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
   `pnpm test`, `pnpm build`, `pnpm test:server`. Keep every source file under 600 lines.
3. **Truth in copy.** No invented users, metrics, logos or testimonials; anything not built says
   "próximamente" / "coming soon".
4. **No secrets, no prices, no client names.** Hosts come from the host table only.
5. **One concern per pull request,** with a clear English title and a body that says why.

**Licence.** Contributions are accepted under the project licence (AGPL-3.0-only for code, MIT for
docs): inbound equals outbound.
