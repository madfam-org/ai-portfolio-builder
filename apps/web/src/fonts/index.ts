/**
 * CV's two typefaces (DESIGN.md «Typography»), self-hosted: next/font/local serves them from CV's own origin, so the
 * strict CSP (`font-src 'self'`) holds on every host. Both are SIL Open Font License 1.1 (LICENSE-*.txt beside them),
 * from the @fontsource-variable 5.3.0 packages, Latin subset (Spanish and English), variable weight.
 *
 * - Newsreader (Production Type): the serif voice — names, page titles, section heads, documents in «Clásica».
 * - Instrument Sans (Instrument): the working voice — body text, controls, labels, most documents.
 *
 * Checksums (SHA-256) of the vendored files, to refresh only from the same packages:
 *   newsreader-latin-wght.woff2            62981321d9a3cc7a61a73792729043703fd6112da86e8ec848bb57f088578757
 *   instrument-sans-latin-wght.woff2       2ee17598a98d8a59e4df8152d015bec9ab8e4d5672cc0ab42bef806b568e3971
 *   instrument-sans-latin-wght-italic.woff2 77210cdde0281b5ecb0d592e063a98656f1bc36993a3b98f506eb91ff4a433a5
 */
import localFont from 'next/font/local';

export const serif = localFont({
  src: [{ path: './newsreader-latin-wght.woff2', weight: '200 800', style: 'normal' }],
  variable: '--font-serif',
  display: 'swap',
  fallback: ['Iowan Old Style', 'Palatino Linotype', 'Georgia', 'serif'],
});

export const sans = localFont({
  src: [
    { path: './instrument-sans-latin-wght.woff2', weight: '400 700', style: 'normal' },
    { path: './instrument-sans-latin-wght-italic.woff2', weight: '400 700', style: 'italic' },
  ],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
});
