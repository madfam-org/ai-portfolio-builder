/**
 * The e2e server launcher (playwright.config.ts `webServer`): `node e2e/support/serve.ts`.
 *
 * 1. Resets and migrates the throwaway test database as the owner (test-pg/harness.ts; the name must end in `_test`).
 * 2. Starts the local RS256 issuer (test-support/janua-tokens.ts: a JWKS on a loopback port) and a TEST-ONLY mint
 *    endpoint that hands the specs a Janua-style access token or a ready Auth.js session cookie for a given person.
 *    Product code has no test route: the cookie is the one Auth.js would set after a real Janua sign-in.
 * 3. Boots the BUILT standalone server (run `pnpm build` first) with every host on `*.localhost`, sign-in configured
 *    with dummy client values, the JWKS above, and the runtime database URL as the `cv_app` role.
 * Every secret here is random per run and never leaves this process tree.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { encode } from 'next-auth/jwt';
import { resetAndMigrate, testUrls } from '../../test-pg/harness.ts';
import { startTestIssuer } from '../../test-support/janua-tokens.ts';
import { E2E_MINT_PORT, E2E_PORT, HOSTS } from './env.ts';

const web = join(import.meta.dirname, '..', '..');
const standalone = join(web, '.next', 'standalone');
const server = join(standalone, 'apps', 'web', 'server.js');
if (!existsSync(server)) throw new Error(`missing ${server}: run \`pnpm build\` first`);
const staticDst = join(standalone, 'apps', 'web', '.next', 'static');
if (!existsSync(staticDst)) cpSync(join(web, '.next', 'static'), staticDst, { recursive: true });

const { app } = testUrls();
await resetAndMigrate();
const issuer = await startTestIssuer();
const authSecret = randomBytes(32).toString('hex');
const clientCredential = randomBytes(24).toString('hex');
const COOKIE = 'authjs.session-token';

const mint = createServer((req, res) => {
  void (async () => {
    const q = new URL(req.url ?? '/', 'http://mint.local').searchParams;
    const sub = q.get('sub');
    if (!sub) {
      res.writeHead(400).end();
      return;
    }
    const name = q.get('name') ?? sub;
    const email = q.get('email') ?? null;
    const accessToken = await issuer.token({ sub, name, ...(email ? { email } : {}) }, { expiresIn: '1h' });
    const body: Record<string, unknown> = { accessToken };
    if (req.url?.startsWith('/session')) {
      const token = { sub, name, email, accessToken, expiresAt: Math.floor(Date.now() / 1000) + 3600 };
      body.cookie = { name: COOKIE, value: await encode({ token, secret: authSecret, salt: COOKIE, maxAge: 3600 }) };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  })().catch(() => res.writeHead(500).end());
});
await new Promise<void>((resolve) => mint.listen(E2E_MINT_PORT, '127.0.0.1', resolve));

const child = spawn(process.execPath, [server], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(E2E_PORT),
    HOSTNAME: 'localhost',
    CV_HOST_LANDING: HOSTS.landing,
    CV_HOST_APP: HOSTS.app,
    CV_HOST_API: HOSTS.api,
    CV_HOST_PAGES: HOSTS.pages,
    AUTH_SECRET: authSecret,
    AUTH_JANUA_CLIENT_ID: 'cv-web-e2e',
    AUTH_JANUA_CLIENT_SECRET: clientCredential,
    ...issuer.env,
    APP_DATABASE_URL: app,
  },
});

const stop = () => {
  child.kill('SIGTERM');
  mint.close();
  void issuer.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', (code) => {
  mint.close();
  void issuer.close();
  process.exit(code ?? 1);
});
