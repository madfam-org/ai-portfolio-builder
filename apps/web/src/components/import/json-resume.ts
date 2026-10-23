/**
 * JSON Resume (https://jsonresume.org/schema, v1.0.0: https://github.com/jsonresume/resume-schema) → an import.
 * Sections mapped: basics (header and contact), work, volunteer, education, awards, certificates, publications,
 * skills, languages, projects. `interests`, `references` and `meta` are ignored (counted, never kept).
 * Pre-v1 names some tools still write are accepted too (`work[].company`, `work[].website`, `publications[].website`).
 */
import { languageCodeFromName } from '../../lib/languages.ts';
import { fitHeader, makeItem, type ImportResult, type Raw } from './model.ts';

export class NotJsonResumeError extends Error {}

/** The largest .json file read (bytes). */
export const JSON_RESUME_MAX_BYTES = 2 * 1024 * 1024;

const MAPPED = ['basics', 'work', 'volunteer', 'education', 'awards', 'certificates', 'publications', 'skills', 'languages', 'projects'] as const;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object' && !Array.isArray(x)) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** JSON Resume `skills[].level` («Master», «Intermediate», ...) → the profile's skill levels. */
export function skillLevel(raw: string): string | undefined {
  const v = raw.toLowerCase();
  if (/master|expert|experto|avanzad[oa] alto/.test(v)) return 'expert';
  if (/advanced|avanzad/.test(v)) return 'advanced';
  if (/intermediate|intermedi/.test(v)) return 'intermediate';
  if (/beginner|basic|novice|principiante|b[aá]sic/.test(v)) return 'beginner';
  return undefined;
}

/** `languages[].fluency` → CEFR or native when it says so; anything else stays unset. */
export function fluencyLevel(raw: string): string | undefined {
  const v = raw.toLowerCase();
  if (/native|bilingual|nativ|biling|mother tongue|lengua materna/.test(v)) return 'native';
  const cefr = raw.toUpperCase().match(/\b([ABC][12])\b/);
  return cefr ? cefr[1] : undefined;
}

const withHighlights = (summary: string, highlights: string[]) => [summary, ...highlights.map((h) => `• ${h}`)].filter(Boolean).join('\n');

/** Parses the file text. Throws NotJsonResumeError when it is not JSON or has none of the mapped sections. */
export function parseJsonResume(text: string): ImportResult {
  if (text.length > JSON_RESUME_MAX_BYTES) throw new NotJsonResumeError('too large');
  let doc: unknown;
  try {
    doc = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new NotJsonResumeError('not JSON');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new NotJsonResumeError('not an object');
  const d = doc as Raw;
  const present = MAPPED.filter((k) => d[k] !== undefined);
  if (present.length === 0) throw new NotJsonResumeError('no JSON Resume sections');
  const ignored = Object.keys(d).filter((k) => !(MAPPED as readonly string[]).includes(k) && k !== '$schema').length;
  const result: ImportResult = { source: 'json-resume', items: [], header: { contact: {} }, skipped: [], read: [...present], ignored };

  const basics = (d.basics && typeof d.basics === 'object' ? d.basics : {}) as Raw;
  const loc = (basics.location && typeof basics.location === 'object' ? basics.location : {}) as Raw;
  const location = [str(loc.city), str(loc.region), str(loc.countryCode)].filter(Boolean).join(', ') || str(loc.address);
  const links = [
    ...(str(basics.url) ? [{ label: '', url: str(basics.url) }] : []),
    ...arr(basics.profiles).map((p) => ({ label: str(p.network) || str(p.username), url: str(p.url) })),
  ];
  result.header = fitHeader({ displayName: str(basics.name), headline: str(basics.label), summary: str(basics.summary), contact: { email: str(basics.email), phone: str(basics.phone), location, links } });

  const each = (section: string, map: (e: Raw) => { kind: Parameters<typeof makeItem>[1]; raw: Raw; tags?: unknown }) =>
    arr(d[section]).forEach((e, i) => {
      const { kind, raw, tags } = map(e);
      makeItem(result, kind, raw, { file: section, row: i + 1 }, tags);
    });

  each('work', (e) => ({
    kind: 'experience',
    raw: {
      role: str(e.position),
      organization: str(e.name) || str(e.company),
      location: str(e.location),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      current: !str(e.endDate) && str(e.startDate) ? true : undefined,
      summary: str(e.summary) || str(e.description),
      highlights: strings(e.highlights),
    },
  }));
  each('volunteer', (e) => ({
    kind: 'volunteering',
    raw: { role: str(e.position), organization: str(e.organization), startDate: str(e.startDate), endDate: str(e.endDate), summary: withHighlights(str(e.summary), strings(e.highlights)) },
  }));
  each('education', (e) => ({
    kind: 'education',
    raw: {
      institution: str(e.institution),
      degree: str(e.studyType),
      field: str(e.area),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      summary: str(e.score),
      highlights: strings(e.courses),
    },
  }));
  each('awards', (e) => ({ kind: 'award', raw: { title: str(e.title), issuer: str(e.awarder), date: str(e.date), summary: str(e.summary) } }));
  each('certificates', (e) => ({ kind: 'certification', raw: { name: str(e.name), issuer: str(e.issuer), date: str(e.date), url: str(e.url) } }));
  each('publications', (e) => ({
    kind: 'publication',
    raw: { title: str(e.name), publisher: str(e.publisher), date: str(e.releaseDate), url: str(e.url) || str(e.website), summary: str(e.summary) },
  }));
  each('skills', (e) => ({ kind: 'skill', raw: { name: str(e.name), level: skillLevel(str(e.level)) }, tags: strings(e.keywords) }));
  // W7 (B4): a recognised language name also gives its ISO 639 code (lib/languages.ts).
  each('languages', (e) => ({ kind: 'language', raw: { code: languageCodeFromName(str(e.language)) ?? undefined, name: str(e.language), level: fluencyLevel(str(e.fluency)) } }));
  each('projects', (e) => ({
    kind: 'project',
    raw: {
      name: str(e.name),
      role: strings(e.roles).join(', '),
      url: str(e.url),
      startDate: str(e.startDate),
      endDate: str(e.endDate),
      summary: str(e.description),
      highlights: strings(e.highlights),
    },
    tags: strings(e.keywords),
  }));
  return result;
}
