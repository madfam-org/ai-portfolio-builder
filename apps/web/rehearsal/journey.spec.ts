/**
 * The rehearsal: one synthetic persona (invented; an invented employer on `.example`) goes through cv the way a beta
 * person will, and every screen is saved as a full-page screenshot under `rehearsal-output/<project>/`. The data is
 * seeded through the API so the screens are populated the way a real profile is; the pages themselves are loaded in a
 * real browser. This is for LOOKING, not for gating: the only hard failures are a page that does not load, a 5xx, a
 * CSP violation or an uncaught page error, all listed in `report.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { apiAs, signIn } from '../e2e/support/fixtures.ts';
import { url } from '../e2e/support/env.ts';

interface Finding {
  step: string;
  kind: 'console' | 'csp' | 'pageerror' | 'http';
  detail: string;
}

test('the whole journey, screen by screen', async ({ page, context }, info) => {
  const project = info.project.name;
  const out = join(import.meta.dirname, '..', 'rehearsal-output', project);
  mkdirSync(out, { recursive: true });
  const persona = { sub: `janua|rehearsal-${project}`, name: 'Valeria Ficticia Robles', email: 'valeria@example.test' };
  const findings: Finding[] = [];
  let step = 'start';
  let n = 0;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chromium notes that COOP is ignored on plain http (the pages host runs under its production name here): not a finding.
    if (/Cross-Origin-Opener-Policy header has been ignored/.test(m.text())) return;
    findings.push({ step, kind: /Content Security Policy|Refused to/i.test(m.text()) ? 'csp' : 'console', detail: m.text().slice(0, 300) });
  });
  page.on('pageerror', (e) => findings.push({ step, kind: 'pageerror', detail: String(e).slice(0, 300) }));
  page.on('response', (r) => {
    if (r.status() >= 500) findings.push({ step, kind: 'http', detail: `${r.status()} ${new URL(r.url()).pathname}` });
  });

  async function see(name: string, target: string, ready?: (p: Page) => Promise<unknown>) {
    step = name;
    n += 1;
    const res = await page.goto(target, { waitUntil: 'networkidle' });
    expect(res?.status(), `${name}: ${target}`).toBeLessThan(400);
    if (ready) await ready(page);
    await page.screenshot({ path: join(out, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: true });
  }
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await apiAs(persona, method, path, body);
    expect(res.status, `${method} ${path}`).toBeLessThan(300);
    return res.json!;
  };

  // Before sign-in: what a visitor and an invited person see first.
  await see('landing', url('landing', '/'));
  await see('privacy-notice', url('landing', '/privacidad'));
  await see('app-signed-out', url('app', '/'));

  // First sign-in, nothing captured yet.
  await signIn(context, persona);
  await see('home-first-run', url('app', '/'), (p) => p.getByRole('heading', { name: 'Primeros pasos' }).waitFor());
  await see('profile-empty', url('app', '/perfil'));
  await see('jobs-empty', url('app', '/empleos'));
  await see('job-new', url('app', '/empleos/nuevo'));
  await see('documents-empty', url('app', '/documentos'));

  // A profile the way a store professional would fill it (all invented).
  await api('PUT', '/api/v1/profile', {
    displayName: 'Valeria Ficticia Robles',
    headline: 'Asesora de ventas de lujo · clienteling y visual merchandising',
    summary:
      'Ocho años en tiendas de lujo en México. Cartera propia de clientes frecuentes, metas de venta cumplidas de forma consistente y experiencia abriendo una boutique. Busco un puesto de asesora senior o subgerente en Ciudad de México.',
    contact: { email: 'valeria@example.test', phone: '+52 55 5555 0100', location: 'Ciudad de México', links: [{ label: 'Portafolio', url: 'https://valeria.example.test' }] },
  });
  const item = async (kind: string, content: unknown, tags: string[] = []) => ((await api('POST', '/api/v1/profile/items', { kind, content, tags })).item as { id: string }).id;
  const exp1 = await item(
    'experience',
    { role: 'Asesora de ventas senior', organization: 'Maison Ejemplo', location: 'Ciudad de México', startDate: '2021-03', current: true, summary: 'Atención a clientes de alta gama en boutique de calle.', highlights: ['Cumplimiento de meta anual por encima del objetivo (cifra ilustrativa)', 'Cartera de clientes frecuentes atendida con seguimiento personal', 'Capacitación de dos asesoras nuevas en producto y ceremonia de venta'] },
    ['clienteling', 'ventas', 'lujo'],
  );
  const exp2 = await item('experience', { role: 'Asesora de ventas', organization: 'Casa Ejemplo', location: 'Guadalajara, Jalisco', startDate: '2017-06', endDate: '2021-02', highlights: ['Apertura de boutique: montaje de piso y primer inventario', 'Eventos privados para clientes'] }, ['visual merchandising']);
  const edu = await item('education', { institution: 'Universidad Ejemplo', degree: 'Licenciatura en Mercadotecnia', startDate: '2012', endDate: '2016' });
  const sk1 = await item('skill', { name: 'Clienteling y CRM', level: 'advanced' }, ['clienteling', 'crm']);
  const sk2 = await item('skill', { name: 'Visual merchandising', level: 'intermediate' });
  const lang = await item('language', { name: 'Inglés', code: 'en', level: 'B2' });
  const cert = await item('certification', { name: 'Formación de producto: marroquinería', issuer: 'Maison Ejemplo', date: '2022-09' });
  await see('profile-filled', url('app', '/perfil'));
  await see('home-after-profile', url('app', '/'));

  // A job, its page (market range), the tailoring workspace.
  const job = (
    await api('POST', '/api/v1/jobs', {
      title: 'Asesora de ventas senior',
      company: 'Boutique Ejemplo',
      location: 'Ciudad de México',
      stateCode: 'MX-CMX',
      countryCode: 'MX',
      employmentType: 'full_time',
      workMode: 'onsite',
      salaryMin: 18000,
      salaryMax: 24000,
      salaryCurrency: 'MXN',
      salaryPeriod: 'month',
      sourceKind: 'paste',
      sourceText:
        'Boutique Ejemplo busca Asesora de ventas senior para su tienda en Ciudad de México.\nRequisitos: experiencia en ventas de lujo, clienteling, manejo de CRM, inglés intermedio, visual merchandising.\nOfrecemos: sueldo base más comisiones, capacitación de producto.',
    })
  ).job as { id: string };
  await see('jobs-list', url('app', '/empleos'));
  await see('job-detail', url('app', `/empleos/${job.id}`));
  await see('job-tailor', url('app', `/empleos/${job.id}/adaptar`));

  // The four documents for that job.
  const items = [{ itemId: exp1 }, { itemId: exp2 }, { itemId: edu }, { itemId: sk1 }, { itemId: sk2 }, { itemId: lang }, { itemId: cert }];
  const set = (await api('POST', '/api/v1/artifacts/batch', {
    jobId: job.id,
    artifacts: [
      { kind: 'cv', title: 'CV · Boutique Ejemplo', content: { items, showContact: true } },
      { kind: 'portfolio', title: 'Portafolio · Boutique Ejemplo', content: { items, intro: 'Soy Valeria. Acompaño a cada cliente antes, durante y después de su compra.' } },
      { kind: 'presentation', title: 'Presentación · Boutique Ejemplo', content: { items, slides: [{ title: 'Quién soy', body: 'Ocho años en tiendas de lujo.', itemIds: [] }, { title: 'Experiencia', itemIds: [exp1, exp2] }, { title: 'Lo que aporto', itemIds: [sk1, sk2, lang] }] } },
      { kind: 'cover_letter', title: 'Carta · Boutique Ejemplo', content: { items: [{ itemId: exp1 }], greeting: 'Estimado equipo de Boutique Ejemplo:', summary: 'Me interesa el puesto de asesora de ventas senior porque combina la atención personal al cliente con la formación de equipo, que es lo que hago hoy.', closing: 'Quedo atenta. Saludos cordiales,' } },
    ],
  })) as { artifacts: { id: string; kind: string }[] };
  const id = Object.fromEntries(set.artifacts.map((a) => [a.kind, a.id])) as Record<string, string>;
  await see('documents-list', url('app', '/documentos'));
  for (const kind of ['cv', 'portfolio', 'presentation', 'cover_letter']) {
    await see(`document-${kind}`, url('app', `/documentos/${id[kind]}`));
    await see(`preview-${kind}`, url('app', `/documentos/${id[kind]}/vista-previa`));
  }
  await see('print-cv', url('app', `/documentos/${id.cv}/imprimir`));
  await see('print-cover-letter', url('app', `/documentos/${id.cover_letter}/imprimir`));

  // Sharing: what the person sees after publishing, and what a recruiter sees.
  for (const kind of ['cv', 'portfolio', 'presentation']) {
    const shared = (await api('POST', `/api/v1/artifacts/${id[kind]}/publish`, { visibility: 'link' })).artifact as { shareToken: string };
    if (kind === 'cv') await see('document-cv-shared', url('app', `/documentos/${id.cv}`));
    await see(`public-${kind}`, url('pages', `/l/${shared.shareToken}`));
  }

  await see('settings', url('app', '/ajustes'));

  // English.
  await see('en-home', url('app', '/en'));
  await see('en-profile', url('app', '/en/perfil'));
  await see('en-job-detail', url('app', `/en/empleos/${job.id}`));
  await see('en-documents', url('app', '/en/documentos'));
  await see('en-landing', url('landing', '/en'));

  writeFileSync(join(out, 'report.json'), JSON.stringify({ project, screens: n, findings }, null, 2));
  expect(n, 'screens walked').toBeGreaterThanOrEqual(34);
  expect(findings.filter((f) => f.kind !== 'console'), 'no CSP violation, page error or 5xx').toEqual([]);
});
