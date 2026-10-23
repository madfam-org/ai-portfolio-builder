/**
 * The person's OWN LinkedIn data export («Descargar tus datos» / «Download your data»: Me → Settings & Privacy →
 * Data privacy → Download your data; https://www.linkedin.com/help/linkedin/answer/50191), read in the browser.
 *
 * Which files: LinkedIn's help page lists the export's data categories
 * (https://www.linkedin.com/help/linkedin/answer/a1339364): Profile, Positions, Education, Skills, Certifications,
 * Languages, Projects, Honors, Publications and Volunteering are the ones that describe a career, so they are the only
 * files opened. Every other file (Messages, Connections, Invitations, Ad Targeting, Inferences, ...) is never read:
 * only the archive's index (file names) is, and nothing of those files is decompressed or kept.
 *
 * Columns: LinkedIn does not publish its CSV headers, and they changed between export generations (e.g. Positions
 * «Started On» / «Finished On», older «Start Date» / «End Date»). Each field is therefore found through a list of
 * header aliases, matched on a normalized key (csv.ts `headerKey`), English and Spanish; a missing file or column
 * leaves that part empty, never an error.
 */
import type { ItemKind } from '../../lib/copy/app.ts';
import { languageCodeFromName } from '../../lib/languages.ts';
import { pick, readTable } from './csv.ts';
import { fitHeader, makeItem, type ImportResult, type Raw } from './model.ts';
import { listEntries, readEntryText, ZIP_LIMITS, type BlobLike, type ZipEntry, type ZipLimits } from './zip.ts';

/** Header aliases per field (normalized keys: csv.ts headerKey). */
const H = {
  firstName: ['firstname', 'nombre', 'nombrepila'],
  lastName: ['lastname', 'apellidos', 'apellido'],
  headline: ['headline', 'titular', 'extracto'],
  summary: ['summary', 'resumen', 'acercade', 'about'],
  geo: ['geolocation', 'location', 'ubicacion', 'ubicaciongeografica', 'ciudad'],
  websites: ['websites', 'sitiosweb', 'paginasweb'],
  company: ['companyname', 'company', 'organization', 'organizationname', 'nombredelaempresa', 'empresa', 'organizacion', 'nombredelaorganizacion'],
  title: ['title', 'titulo', 'cargo', 'puesto', 'name', 'nombre'],
  role: ['role', 'cargo', 'funcion', 'puesto', 'title', 'titulo'],
  description: ['description', 'descripcion'],
  location: ['location', 'ubicacion', 'lugar'],
  start: ['startedon', 'startdate', 'start', 'from', 'fechadeinicio', 'iniciadoel', 'inicio', 'desde', 'fechainicio'],
  end: ['finishedon', 'enddate', 'end', 'to', 'fechadefinalizacion', 'fechadefin', 'finalizadoel', 'fin', 'hasta', 'fechafin'],
  school: ['schoolname', 'school', 'nombredelaescuela', 'escuela', 'institucion', 'centrodeestudios', 'universidad'],
  degree: ['degreename', 'degree', 'titulacion', 'grado', 'titulo'],
  fieldOfStudy: ['fieldofstudy', 'disciplinaacademica', 'areadeestudio', 'campodeestudio'],
  notes: ['notes', 'notas'],
  activities: ['activities', 'actividades', 'actividadesygrupos'],
  name: ['name', 'nombre', 'skill', 'skillname', 'aptitud', 'idioma', 'language', 'title', 'titulo'],
  authority: ['authority', 'issuer', 'issuingorganization', 'autoridad', 'emisor', 'entidademisora', 'organizacionemisora'],
  license: ['licensenumber', 'credentialid', 'numerodelicencia', 'iddelacredencial', 'iddecredencial'],
  url: ['url', 'link', 'enlace'],
  proficiency: ['proficiency', 'competencia', 'nivel', 'niveldecompetencia'],
  issued: ['issuedon', 'date', 'fecha', 'fechadeexpedicion', 'fechadeemision', 'expedidoel'],
  issuer: ['issuer', 'emisor', 'otorgadopor', 'association', 'asociadocon'],
  publisher: ['publisher', 'editorial', 'publicacion', 'editor'],
  published: ['publishedon', 'date', 'fecha', 'fechadepublicacion', 'publicadoel'],
  cause: ['cause', 'causa'],
} as const;

type FileId = 'profile' | 'positions' | 'education' | 'skills' | 'certifications' | 'languages' | 'projects' | 'honors' | 'publications' | 'volunteering';

/** The ONLY files opened, by lower-case base name. */
export const LINKEDIN_FILES: Record<FileId, readonly string[]> = {
  profile: ['profile.csv'],
  positions: ['positions.csv'],
  education: ['education.csv'],
  skills: ['skills.csv'],
  certifications: ['certifications.csv'],
  languages: ['languages.csv'],
  projects: ['projects.csv'],
  honors: ['honors.csv'],
  publications: ['publications.csv'],
  volunteering: ['volunteering.csv', 'volunteer experiences.csv', 'volunteer_experiences.csv'],
};

/** The display names of the files read (copy: «leemos solo …»). */
export const LINKEDIN_FILE_NAMES: readonly string[] = Object.values(LINKEDIN_FILES).map((names) => names[0]!.replace(/^\w/, (c) => c.toUpperCase()));

const KIND: Partial<Record<FileId, ItemKind>> = {
  positions: 'experience',
  education: 'education',
  skills: 'skill',
  certifications: 'certification',
  languages: 'language',
  projects: 'project',
  honors: 'award',
  publications: 'publication',
  volunteering: 'volunteering',
};

/**
 * LinkedIn's five proficiency labels → the profile's levels. Only the two ends are certain (native; elementary = A2);
 * the working levels are an approximation the preview shows next to the item, so the person can uncheck or edit it.
 */
export function languageLevel(raw: string): string | undefined {
  const v = raw.toLowerCase();
  if (!v) return undefined;
  if (/native|bilingual|nativ|biling/.test(v)) return 'native';
  if (/full professional|profesional completa/.test(v)) return 'C1';
  if (/limited|limitad/.test(v)) return 'B1';
  if (/professional working|profesional|laboral/.test(v)) return 'B2';
  if (/elementary|elemental|b[aá]sic/.test(v)) return 'A2';
  const cefr = v.toUpperCase().match(/\b([ABC][12])\b/);
  return cefr ? cefr[1] : undefined;
}

/** «[PERSONAL:https://a.test,COMPANY:https://b.test]» or a plain list → URLs. */
function websites(raw: string): { label?: string; url: string }[] {
  return [...raw.matchAll(/(?:([A-Za-z]+):)?((?:https?:\/\/|www\.)[^\s,\]]+)/g)].map((m) => ({ url: m[2]! }));
}

const joinText = (...parts: string[]) => parts.filter(Boolean).join('\n\n');

/** Maps the CSV texts of the mapped files (by FileId) to an import. Pure: no I/O. */
export function mapLinkedIn(files: Partial<Record<FileId, string>>, ignored = 0): ImportResult {
  const result: ImportResult = { source: 'linkedin', items: [], header: { contact: {} }, skipped: [], read: [], ignored };
  const table = (id: FileId, known: readonly (readonly string[])[]) => {
    const text = files[id];
    if (text === undefined) return null;
    result.read.push(LINKEDIN_FILE_NAMES[Object.keys(LINKEDIN_FILES).indexOf(id)]!);
    return readTable(text, known.flat());
  };
  const each = (id: FileId, known: readonly (readonly string[])[], toRaw: (row: Record<string, string>) => Raw) => {
    const t = table(id, known);
    const file = LINKEDIN_FILE_NAMES[Object.keys(LINKEDIN_FILES).indexOf(id)]!;
    t?.rows.forEach((row, i) => makeItem(result, KIND[id]!, toRaw(row), { file, row: i + 1 }));
  };

  const profile = table('profile', [H.firstName, H.lastName, H.headline, H.summary]);
  const p = profile?.rows[0];
  if (p) {
    const name = [pick(p, H.firstName), pick(p, H.lastName)].filter(Boolean).join(' ');
    result.header = fitHeader({
      displayName: name,
      headline: pick(p, H.headline),
      summary: pick(p, H.summary),
      contact: { location: pick(p, H.geo), links: websites(pick(p, H.websites)) },
    });
  }

  each('positions', [H.company, H.title], (r) => {
    const end = pick(r, H.end);
    return { role: pick(r, H.title), organization: pick(r, H.company), location: pick(r, H.location), summary: pick(r, H.description), startDate: pick(r, H.start), endDate: end, current: end === '' && pick(r, H.start) !== '' ? true : undefined };
  });
  each('education', [H.school, H.degree], (r) => ({
    institution: pick(r, H.school),
    degree: pick(r, H.degree),
    field: pick(r, H.fieldOfStudy),
    startDate: pick(r, H.start),
    endDate: pick(r, H.end),
    summary: joinText(pick(r, H.notes), pick(r, H.activities)),
  }));
  each('skills', [H.name], (r) => ({ name: pick(r, H.name) }));
  each('certifications', [H.name, H.authority], (r) => ({
    name: pick(r, H.name),
    issuer: pick(r, H.authority),
    date: pick(r, H.start) || pick(r, H.issued),
    expiresOn: pick(r, H.end),
    url: pick(r, H.url),
    credentialId: pick(r, H.license),
  }));
  // W7 (B4): a recognised language name also gives its ISO 639 code, so each document prints it in its own language.
  each('languages', [H.name, H.proficiency], (r) => ({ code: languageCodeFromName(pick(r, H.name)) ?? undefined, name: pick(r, H.name), level: languageLevel(pick(r, H.proficiency)) }));
  each('projects', [H.title, H.description], (r) => ({ name: pick(r, H.title), summary: pick(r, H.description), url: pick(r, H.url), startDate: pick(r, H.start), endDate: pick(r, H.end) }));
  each('honors', [H.title, H.issued], (r) => ({ title: pick(r, H.title), issuer: pick(r, H.issuer), date: pick(r, H.issued), summary: pick(r, H.description) }));
  each('publications', [H.name, H.publisher], (r) => ({ title: pick(r, H.name), publisher: pick(r, H.publisher), date: pick(r, H.published), url: pick(r, H.url), summary: pick(r, H.description) }));
  each('volunteering', [H.company, H.role], (r) => {
    const cause = pick(r, H.cause);
    return {
      role: pick(r, H.role),
      organization: pick(r, H.company),
      startDate: pick(r, H.start),
      endDate: pick(r, H.end),
      summary: joinText(pick(r, H.description), cause ? `(${cause})` : ''),
    };
  });
  return result;
}

const baseName = (path: string) => path.split('/').pop()!.toLowerCase();

/** Which archive entry (if any) is each mapped file; the shallowest path wins; macOS resource forks are skipped. */
export function selectEntries(entries: readonly ZipEntry[]): { picked: Partial<Record<FileId, ZipEntry>>; ignored: number } {
  const picked: Partial<Record<FileId, ZipEntry>> = {};
  const usable = entries.filter((e) => !e.name.endsWith('/') && !e.name.startsWith('__MACOSX/') && !baseName(e.name).startsWith('._'));
  for (const [id, names] of Object.entries(LINKEDIN_FILES) as [FileId, readonly string[]][]) {
    const match = usable.filter((e) => names.includes(baseName(e.name))).sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
    if (match) picked[id] = match;
  }
  const used = new Set(Object.values(picked));
  return { picked, ignored: usable.filter((e) => !used.has(e)).length };
}

export class NotLinkedInError extends Error {}

/**
 * Reads a LinkedIn export ZIP: its index, then ONLY the mapped files. Throws ZipError (archive problems) or
 * NotLinkedInError (a ZIP without any of the mapped files).
 */
export async function readLinkedInZip(file: BlobLike, limits: ZipLimits = ZIP_LIMITS): Promise<ImportResult> {
  const entries = await listEntries(file, limits);
  const { picked, ignored } = selectEntries(entries);
  if (Object.keys(picked).length === 0) throw new NotLinkedInError('no LinkedIn career files in this archive');
  const texts: Partial<Record<FileId, string>> = {};
  for (const [id, entry] of Object.entries(picked) as [FileId, ZipEntry][]) texts[id] = await readEntryText(file, entry, limits);
  return mapLinkedIn(texts, ignored);
}
