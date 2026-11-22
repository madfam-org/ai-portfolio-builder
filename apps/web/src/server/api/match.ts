/**
 * `GET /api/v1/jobs/:id/match`: a deterministic, AI-free relevance score of each profile item against one job
 * posting. It gives per-job tailoring value before Selva lands (W6) and never calls the network.
 *
 * Heuristic `keyword-overlap-v3` (docs/PRODUCT.md):
 * 1. Normalise (es + en): lowercase, strip diacritics (NFD), keep letters, digits and the tech marks `+ # .`
 *    inside a word (c++, c#, node.js), drop stopwords of both languages (function words AND the everyday filler of
 *    any text: «up», «set», «best», «always», «muy», «cada» …), drop tokens shorter than 2 characters, fold a plural
 *    `s` on plain words longer than 4 characters. v3: a token is dropped when its raw OR its folded form is a stopword
 *    (v2 checked before the fold, so «nuevos», «grandes», «others» scored); and two exceptions are kept as written in
 *    capitals: the one-letter languages `C` and `R` (`KEPT_LETTERS`) and the acronym `IT` (`KEPT_ACRONYMS`). Only
 *    those exact uppercase forms: a lowercase «c» or «it», and every other all-caps word («EN», «CON», «Y»), follow
 *    the ordinary rules, so an all-caps heading never turns a stopword into a term.
 * 2. Job terms: the set of normalised tokens of the job title and the posting text.
 * 3. For each item: a tag scores 3 when every token of the tag appears in the job terms; each other distinct
 *    content token found in the job terms scores 1. Content tokens come from the item's WORDS about the work: not
 *    its place (`location`), its dates, links, codes or levels, nor how a recommender knows the person. A
 *    recommendation scores nothing at all: it is someone else's words, not a claim of the person's (v2; in v1 its
 *    generic praise outranked whole roles).
 * 4. Items are ranked by score, then by their own position, then by id (stable and reproducible).
 * 5. `missingTerms`: the job's most frequent terms that no item covers (up to 20), as a checklist for the person.
 *    Words that are not about the work are left out of this list only (never out of the score): the employer's own
 *    name, the place, and the boilerplate verbs and nouns of a posting («buscamos», «ofrecemos», «requisitos»).
 *
 * WHAT IS SHOWN. Comparison uses the normalised tokens, but `matchedTerms` and `missingTerms` carry each word as the
 * POSTING writes it (lower-cased, accents and plural kept: «inglés», «comisiones»), never the token («ingle»,
 * «comisione»). A person reads their own language, not the matcher's.
 */
const STOPWORDS = new Set(
  (
    // English
    'a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our ' +
    'this these those they their them he she his her not but if than then so such can may must should would could ' +
    'about into over under more most other some any all each per via etc ' +
    // v2: everyday filler that matches any posting (never a skill on its own)
    'up out off down set get got make made one two very just like what when where who whom why how which there here ' +
    'been being do does did done own same both through while during across within without around every only even ' +
    'still back much many few lot lots great good best better well also always ever new low high able ability strong ' +
    'based using use used want wants need needs way ways take part help helps ' +
    // Spanish (diacritics already stripped)
    'el la los las un una unos unas y o u de del al en con por para sin sobre entre es son ser estar esta este estos ' +
    'estas ese esa esos esas que se su sus lo le les nos como mas muy ya tu tus mi mis nuestro nuestra nuestros ' +
    'nuestras usted ustedes ellos ellas el ella hay tiene tienen debe deben sera seran desde hasta tambien ' +
    // v2: everyday filler (Spanish)
    'menos bien gran grande nuevo nueva cada todo toda todos todas otro otra otros otras algun alguna mismo misma ' +
    'donde cuando quien cual cuales aqui asi solo siempre mejor parte forma manera'
  ).split(' '),
);

/** Posting boilerplate: never a skill, so never a «missing term». Normalised forms (see `normalise`). */
const POSTING_FILLER = new Set(
  (
    'busca buscamo buscar buscando ofrece ofrecemo ofrecer requisito vacante puesto empresa sueldo salario prestacione ' +
    'ejemplo interesado interesada postulate postula enviar envia cv curriculum ' +
    'seeking looking offer offering requirement position company salary benefit job role apply candidate'
  ).split(' '),
);

/** token → the word as first written in `text` (lower-cased; accents and plural kept). */
export function surfaceForms(text: string): Map<string, string> {
  const forms = new Map<string, string>();
  for (const word of text.match(/[\p{L}\p{N}+#.]+/gu) ?? []) {
    const tokens = normalise(word);
    if (tokens.length !== 1 || forms.has(tokens[0]!)) continue;
    forms.set(tokens[0]!, word.replace(/^[.]+|[.]+$/g, '').toLowerCase());
  }
  return forms;
}

/** v3: one-letter names of programming languages, kept only when written as a capital («C», «R»). */
const KEPT_LETTERS = new Set(['C', 'R']);
/** v3: all-caps acronyms that are also a stopword or too short; kept only exactly as written («IT», not «it»). */
const KEPT_ACRONYMS = new Set(['IT']);

function foldPlural(token: string): string {
  return token.length > 4 && /^[a-z]+$/.test(token) && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
}

export function normalise(text: string): string[] {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const out: string[] = [];
  for (const raw of plain.split(/[^A-Za-z0-9+#.]+/)) {
    const cased = raw.replace(/^[.]+|[.]+$/g, '');
    const token = cased.toLowerCase();
    if (KEPT_LETTERS.has(cased) || KEPT_ACRONYMS.has(cased)) {
      out.push(token);
      continue;
    }
    if (token.length < 2 || STOPWORDS.has(token) || /^[0-9.]+$/.test(token)) continue;
    const folded = foldPlural(token);
    if (STOPWORDS.has(folded)) continue;
    out.push(folded);
  }
  return out;
}

/** Content fields that are not words about the work (v2 adds the place, the enums and the recommender's relation). */
const NOT_WORK_FIELDS = new Set(['url', 'startDate', 'endDate', 'date', 'expiresOn', 'location', 'employmentType', 'level', 'code', 'relationship', 'credentialId']);

function stringsOf(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, acc);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (!NOT_WORK_FIELDS.has(k)) stringsOf(v, acc);
  }
  return acc;
}

export interface MatchItemInput {
  id: string;
  kind: string;
  position: number;
  content: unknown;
  tags: string[];
}

export interface MatchResult {
  algorithm: 'keyword-overlap-v3';
  jobTerms: number;
  coveredTerms: number;
  items: { itemId: string; kind: string; score: number; matchedTags: string[]; matchedTerms: string[] }[];
  missingTerms: string[];
}

export function matchItems(job: { title: string; sourceText: string; company?: string | null; location?: string | null }, items: MatchItemInput[]): MatchResult {
  const jobText = `${job.title}\n${job.sourceText}`;
  const jobTokens = normalise(jobText);
  const shown = surfaceForms(jobText);
  const show = (token: string) => shown.get(token) ?? token;
  const notAboutTheWork = new Set([...POSTING_FILLER, ...normalise(`${job.company ?? ''} ${job.location ?? ''}`)]);
  const freq = new Map<string, number>();
  for (const t of jobTokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const covered = new Set<string>();

  const scored = items.map((item) => {
    if (item.kind === 'recommendation') return { itemId: item.id, kind: item.kind, position: item.position, score: 0, matchedTags: [] as string[], matchedTerms: [] as string[] };
    const matchedTags: string[] = [];
    const tagTokens = new Set<string>();
    for (const tag of item.tags) {
      const tokens = normalise(tag);
      if (tokens.length > 0 && tokens.every((t) => freq.has(t))) {
        matchedTags.push(tag);
        for (const t of tokens) tagTokens.add(t);
      }
    }
    const matchedTerms = [...new Set(normalise(stringsOf(item.content).join(' ')))].filter((t) => freq.has(t) && !tagTokens.has(t)).sort();
    for (const t of [...tagTokens, ...matchedTerms]) covered.add(t);
    return { itemId: item.id, kind: item.kind, position: item.position, score: 3 * matchedTags.length + matchedTerms.length, matchedTags, matchedTerms };
  });

  scored.sort((a, b) => b.score - a.score || a.position - b.position || a.itemId.localeCompare(b.itemId));
  const missingTerms = [...freq.entries()]
    .filter(([t]) => !covered.has(t) && !notAboutTheWork.has(t))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([t]) => show(t));
  return {
    algorithm: 'keyword-overlap-v3',
    jobTerms: freq.size,
    coveredTerms: covered.size,
    items: scored.map(({ position: _position, matchedTerms, ...rest }) => ({ ...rest, matchedTerms: matchedTerms.map(show).sort() })),
    missingTerms,
  };
}
