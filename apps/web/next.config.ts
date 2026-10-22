import type { NextConfig } from 'next';

/**
 * Runtime contract (docs/DEPLOYMENT.md): standalone server on port 3000, no powered-by header. Host routing,
 * the per-request nonce CSP, X-Robots-Tag and the security headers are set in src/proxy.ts, because they
 * depend on the Host and on runtime environment that a build-time config cannot see.
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // proxy.ts sees the raw path; routing.ts tolerates one trailing slash itself, so no 308 hop happens before
  // the Host is checked (an unknown Host gets its 404 directly).
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
