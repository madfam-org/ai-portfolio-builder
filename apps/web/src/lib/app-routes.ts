/**
 * Every page of the core journey on the app host (cv-app.madfam.io), declared ONCE (W3-1) so the follow-on PRs
 * (W3-2 profile, W3-3 jobs and tailoring, W3-4 documents) fill pages in without touching routing.
 *
 * Public paths are Spanish (es-MX is the source locale); `/en` prefixes the English version of each:
 *   /                      inicio                 /en
 *   /perfil                the core profile        /en/perfil
 *   /empleos               jobs (pipeline)         /en/empleos
 *   /empleos/:id           one job                 /en/empleos/:id
 *   /empleos/:id/adaptar   tailoring workspace     /en/empleos/:id/adaptar
 *   /documentos            artifacts               /en/documentos
 *   /documentos/:id        one artifact (editor)   /en/documentos/:id
 *   /documentos/:id/vista-previa   preview         /en/documentos/:id/vista-previa
 *   /documentos/:id/imprimir       print view      /en/documentos/:id/imprimir
 *   /ajustes               settings                /en/ajustes
 * `:id` is a UUID (anything else is the HTML 404, never a database cast error). Each path is rewritten to the
 * internal route `/h/app/<locale><path>` (src/app/h/app/[locale]/...). Dependency-free: routing.ts and pages share it.
 */
import { UUID } from './api-routes.ts';
import type { Locale } from './routing.ts';

export type AppRouteName =
  | 'home'
  | 'profile'
  | 'jobs'
  | 'job'
  | 'jobTailor'
  | 'artifacts'
  | 'artifact'
  | 'artifactPreview'
  | 'artifactPrint'
  | 'settings';

/** Path segments per route; `:id` is a UUID parameter. Order of this table is irrelevant (exact matching). */
export const APP_ROUTE_SEGMENTS: Readonly<Record<AppRouteName, readonly string[]>> = {
  home: [],
  profile: ['perfil'],
  jobs: ['empleos'],
  job: ['empleos', ':id'],
  jobTailor: ['empleos', ':id', 'adaptar'],
  artifacts: ['documentos'],
  artifact: ['documentos', ':id'],
  artifactPreview: ['documentos', ':id', 'vista-previa'],
  artifactPrint: ['documentos', ':id', 'imprimir'],
  settings: ['ajustes'],
};

/** The routes that take an id. */
export type AppRouteWithId = 'job' | 'jobTailor' | 'artifact' | 'artifactPreview' | 'artifactPrint';
export type AppRouteWithoutId = Exclude<AppRouteName, AppRouteWithId>;

function build(name: AppRouteName, locale: Locale, id?: string): string {
  const segments = APP_ROUTE_SEGMENTS[name].map((s) => {
    if (s !== ':id') return s;
    if (!id || !UUID.test(id)) throw new Error(`app route ${name} needs a UUID id`);
    return id;
  });
  const prefix = locale === 'en' ? '/en' : '';
  const path = `${prefix}/${segments.join('/')}`;
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/** Typed public path builders: `appPath.job('es', id)` → `/empleos/<id>`. */
export const appPath = {
  home: (l: Locale) => build('home', l),
  profile: (l: Locale) => build('profile', l),
  jobs: (l: Locale) => build('jobs', l),
  job: (l: Locale, id: string) => build('job', l, id),
  jobTailor: (l: Locale, id: string) => build('jobTailor', l, id),
  artifacts: (l: Locale) => build('artifacts', l),
  artifact: (l: Locale, id: string) => build('artifact', l, id),
  artifactPreview: (l: Locale, id: string) => build('artifactPreview', l, id),
  artifactPrint: (l: Locale, id: string) => build('artifactPrint', l, id),
  settings: (l: Locale) => build('settings', l),
} as const satisfies Record<AppRouteName, (l: Locale, id: string) => string>;

/** The same page in the other locale (language switch). */
export function appPathFor(name: AppRouteName, locale: Locale, id: string | null): string {
  return build(name, locale, id ?? undefined);
}

export interface AppMatch {
  name: AppRouteName;
  locale: Locale;
  id: string | null;
  /** Internal route under src/app. */
  internal: string;
}

/** Exact match of a normalised public path (no query, no trailing slash) to an app route, or null. */
export function matchAppPath(path: string): AppMatch | null {
  if (!path.startsWith('/')) return null;
  let parts = path.split('/').slice(1);
  if (parts.length === 1 && parts[0] === '') parts = [];
  let locale: Locale = 'es';
  if (parts[0] === 'en') {
    locale = 'en';
    parts = parts.slice(1);
  }
  for (const [name, segments] of Object.entries(APP_ROUTE_SEGMENTS) as [AppRouteName, readonly string[]][]) {
    if (segments.length !== parts.length) continue;
    let id: string | null = null;
    const ok = segments.every((s, i) => {
      const part = parts[i]!;
      if (s === ':id') {
        id = part;
        return UUID.test(part);
      }
      return s === part;
    });
    if (!ok) continue;
    const rest = parts.length ? `/${parts.join('/')}` : '';
    return { name, locale, id, internal: `/h/app/${locale}${rest}` };
  }
  return null;
}

/** The navigation of the signed-in app, in order. */
export const APP_NAV: readonly AppRouteWithoutId[] = ['home', 'profile', 'jobs', 'artifacts', 'settings'];

/** Which nav entry a route belongs to (detail pages highlight their list). */
export function navSection(name: AppRouteName): AppRouteWithoutId {
  if (name === 'job' || name === 'jobTailor') return 'jobs';
  if (name === 'artifact' || name === 'artifactPreview' || name === 'artifactPrint') return 'artifacts';
  return name;
}
