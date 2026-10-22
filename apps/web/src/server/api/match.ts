/**
 * `GET /api/v1/jobs/:id/match`: a deterministic, AI-free relevance score of each profile item against one job
 * posting. It gives per-job tailoring value before Selva lands (W6) and never calls the network.
 *
 * Heuristic `keyword-overlap-v1` (docs/PRODUCT.md):
 * 1. Normalise (es + en): lowercase, strip diacritics (NFD), keep letters, digits and the tech marks `+ # .`
 *    inside a word (c++, c#, node.js), drop stopwords of both languages, drop tokens shorter than 2 characters,
 *    fold a plural `s` on plain words longer than 4 characters.
 * 2. Job terms: the set of normalised tokens of the job title and the posting text.
 * 3. For each item: a tag scores 3 when every token of the tag appears in the job terms; each other distinct
 *    content token found in the job terms scores 1. Content tokens come from the item's string fields.
 * 4. Items are ranked by score, then by their own position, then by id (stable and reproducible).
 * 5. `missingTerms`: the job's most frequent terms that no item covers (up to 20), as a checklist for the person.
 */
const STOPWORDS = new Set(
  (
    // English
    'a an and are as at be by for from has have in is it its of on or that the to was were will with you your we our ' +
    'this these those they their them he she his her not but if than then so such can may must should would could ' +
    'about into over under more most other some any all each per via etc ' +
    // Spanish (diacritics already stripped)
    'el la los las un una unos unas y o u de del al en con por para sin sobre entre es son ser estar esta este estos ' +
    'estas ese esa esos esas que se su sus lo le les nos como mas muy ya tu tus mi mis nuestro nuestra nuestros ' +
    'nuestras usted ustedes ellos ellas el ella hay tiene tienen debe deben sera seran desde hasta tambien'
  ).split(' '),
);

export function normalise(text: string): string[] {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out: string[] = [];
  for (const raw of plain.split(/[^a-z0-9+#.]+/)) {
    const token = raw.replace(/^[.]+|[.]+$/g, '');
    if (token.length < 2 || STOPWORDS.has(token) || /^[0-9.]+$/.test(token)) continue;
    out.push(token.length > 4 && /^[a-z]+$/.test(token) && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token);
  }
  return out;
}

function stringsOf(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, acc);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== 'url' && k !== 'startDate' && k !== 'endDate' && k !== 'date') stringsOf(v, acc);
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
  algorithm: 'keyword-overlap-v1';
  jobTerms: number;
  coveredTerms: number;
  items: { itemId: string; kind: string; score: number; matchedTags: string[]; matchedTerms: string[] }[];
  missingTerms: string[];
}

export function matchItems(job: { title: string; sourceText: string }, items: MatchItemInput[]): MatchResult {
  const jobTokens = normalise(`${job.title}\n${job.sourceText}`);
  const freq = new Map<string, number>();
  for (const t of jobTokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const covered = new Set<string>();

  const scored = items.map((item) => {
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
    .filter(([t]) => !covered.has(t))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([t]) => t);
  return {
    algorithm: 'keyword-overlap-v1',
    jobTerms: freq.size,
    coveredTerms: covered.size,
    items: scored.map(({ position: _position, ...rest }) => rest),
    missingTerms,
  };
}
