/** Shared fixtures of the renderer tests (test/render-*.test.ts): one owner's profile and items, one per kind. */
import type { RenderData } from '../src/components/render/model.ts';

export const XSS = '<img src=x onerror="alert(1)">';

export const ITEMS = [
  { id: 'e1', kind: 'experience', content: { role: 'Ingeniera de datos', organization: 'Acme', employmentType: 'full_time', location: 'CDMX', startDate: '2022-01', current: true, summary: 'Original summary', highlights: ['Original highlight'] } },
  { id: 'e2', kind: 'experience', content: { role: 'Analista', organization: 'Beta', startDate: '2019', endDate: '2021-12' } },
  { id: 'd1', kind: 'education', content: { institution: 'UNAM', degree: 'Ingeniería', field: 'Computación', startDate: '2014', endDate: '2018' } },
  { id: 's1', kind: 'skill', content: { name: 'Python', level: 'advanced', years: 5 } },
  { id: 's2', kind: 'skill', content: { name: 'SQL' } },
  { id: 'l1', kind: 'language', content: { name: 'Inglés', level: 'C1' } },
  { id: 'p1', kind: 'project', content: { name: 'Tablero', url: 'javascript:alert(1)', links: [{ label: 'Código', url: 'https://example.test/code' }, { label: 'Malo', url: 'data:text/html,hi' }] } },
  { id: 'c1', kind: 'certification', content: { name: 'Cert', issuer: 'Org', date: '2023-05-10', expiresOn: '2026-05', credentialId: 'AB-1' } },
  { id: 'x1', kind: 'link', content: { label: 'Sitio', url: 'https://ana.example.test' } },
] as const;

export function data(kind: string, content: Record<string, unknown>, opts: { contact?: unknown; locale?: string; template?: string } = {}): RenderData {
  return {
    artifact: { kind, title: `Documento ${kind}`, locale: opts.locale ?? 'es-MX', template: opts.template ?? 'base', content },
    profile: { displayName: 'Ana Prueba', headline: 'Ingeniera de datos', summary: 'Resumen del perfil', ...(opts.contact === undefined ? {} : { contact: opts.contact }) },
    items: ITEMS.map((i) => ({ ...i, content: { ...i.content } })),
  };
}

export const CONTACT = { email: 'ana@example.test', phone: '+52 55 1234 5678', location: 'Cuernavaca', links: [{ label: 'GitHub', url: 'https://github.example.test/ana' }, { label: 'Mal', url: 'javascript:alert(1)' }] };
