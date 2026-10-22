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
  experimental: {
    // Security (W4-S): with a proxy present, Next.js buffers a copy of EVERY request body (any Host, any path, before
    // the proxy decides) up to this size, 10 MB by default; 40 unauthenticated 10 MB POSTs to the landing took one
    // pod from 88 to 659 MiB RSS (limit 512Mi). The largest body cv accepts is the API's 256 KiB
    // (server/api/handler.ts MAX_BODY_BYTES); a longer body is truncated here, so it is still over that cap (413).
    proxyClientMaxBodySize: '512kb',
  },
};

export default nextConfig;
