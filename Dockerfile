# cv (MADFAM CV, working label): ONE image serves three hosts, routed by Host (docs/DEPLOYMENT.md):
#   cv.madfam.io (landing), cv-app.madfam.io (app shell), cv-api.madfam.io (API); /health and /ready on any Host.
# Build context: the repository root (pnpm workspace).
#   docker build -t cv .
#
# - Base pinned by digest: the same node:22-alpine multi-arch index fulcra runs (re-resolved 2026-10-21).
#   Dependabot (docker) proposes bumps.
# - pnpm comes from corepack at the version pinned in package.json `packageManager`; the lockfile is frozen.
# - Runs as uid 1001 with a read-only root filesystem; the only writable paths are /tmp and /app/.next/cache
#   (emptyDir volumes in Kubernetes).
# - No secrets and no NEXT_PUBLIC_* values at build time; all configuration is runtime env.
# - Every COPY source below is mirrored in the `paths` of .github/workflows/build-deploy.yml and the trigger
#   paths of .github/workflows/image.yml.

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
ENV NEXT_TELEMETRY_DISABLED=1 \
    CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo

# Workspace manifests first, so the dependency layer caches independently of source changes. `.npmrc` maps the
# @pliego scope to MADFAM's registry (npm.madfam.io; world-readable, no token): @pliego/engine is a dev dependency
# the build installs (W5-P phase 3; it bakes the page turn, nothing at runtime imports it).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
RUN corepack enable \
 && pnpm install --frozen-lockfile --ignore-scripts

COPY apps/web apps/web
RUN pnpm --filter @cv/web run build \
 && test -f apps/web/.next/standalone/apps/web/server.js

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime

LABEL org.opencontainers.image.source="https://github.com/madfam-org/ai-portfolio-builder" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.title="cv"

# HOSTNAME=0.0.0.0 matters beyond binding: Next.js treats the proxy's rewrites as internal only when their
# origin equals the server's own (see apps/web/test-server/standalone.test.ts).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp \
    TMPDIR=/tmp

# The runtime needs only node. npm, npx, corepack and yarn (and their bundled dependencies, which trip image
# scanners) are removed.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && ! command -v npm \
 && ! command -v npx \
 && addgroup -S -g 1001 app \
 && adduser -S -u 1001 -G app -h /tmp -s /sbin/nologin app

WORKDIR /app
# Root-owned and therefore read-only for uid 1001.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# The committed SQL migrations, applied by the same image in migration mode (CV_MIGRATE_AND_EXIT=true; the
# PreSync Job). The standalone server chdirs to /app/apps/web, so they are read from ./drizzle there.
COPY --from=build /repo/apps/web/drizzle ./apps/web/drizzle

# Next.js writes its cache under the app's .next/cache; point it at the writable volume.
RUN mkdir -p /app/.next/cache \
 && chown 1001:1001 /app/.next/cache \
 && ln -s /app/.next/cache /app/apps/web/.next/cache \
 && test -f /app/apps/web/server.js

# The git commit this image was built from, reported as `revision` by /health and /api/v1/meta (null when
# unset). The build workflow passes it as a build arg; declared last so a new commit rebuilds only this layer.
ARG CV_REVISION=""
ENV CV_REVISION=${CV_REVISION}

USER 1001:1001
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
