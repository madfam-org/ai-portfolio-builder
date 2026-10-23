/**
 * W7 (B3): a career page that answers 200 for a posting that is no longer open. Seen on 2026-10-22 on the systems the
 * luxury houses use: a Workday job page keeps its URL with `postingAvailable: false` in its bootstrap data and no
 * JobPosting; a SAP SuccessFactors Career Site Builder page keeps an empty JobPosting shell and says «Sorry, this
 * position has been filled». Reading such a page would turn the site's navigation into a «posting», so the intake says
 * honestly that the posting is closed instead (`posting_closed`).
 *
 * Only when the page carries no live posting: a JobPosting (JSON-LD or microdata) with a title always wins.
 */
import { type PageParts } from './html.ts';

/** Workday's bootstrap flag (an inline script, read from the raw HTML; nothing is executed). */
const WORKDAY_CLOSED = /\bpostingAvailable\s*:\s*false\b/;

/** What closed postings say, in English and Spanish (the page's readable text). */
const CLOSED_TEXT = [
  /\b(this|the) (position|job|role|vacancy) has (already )?been filled\b/i,
  /\b(this|the) (position|job|job posting|posting|role|vacancy|offer) (is )?no longer (available|open|active|accepting applications)\b/i,
  /\bthe job you are (looking|searching) for is no longer available\b/i,
  /\besta (vacante|posici[oó]n|oferta|plaza) (ya )?(no est[aá] disponible|fue cubierta|ha sido cubierta|est[aá] cerrada|se cerr[oó])\b/i,
  /\bla (vacante|posici[oó]n|oferta|plaza) ya (no est[aá] disponible|fue cubierta|ha sido cubierta|est[aá] cerrada|se cerr[oó])\b/i,
  /\bla vacante que buscas ya no est[aá] disponible\b/i,
];

export function closedPosting(html: string, parts: PageParts, hasLivePosting: boolean): boolean {
  if (hasLivePosting) return false;
  if (WORKDAY_CLOSED.test(html)) return true;
  const text = parts.text.slice(0, 20_000);
  return CLOSED_TEXT.some((re) => re.test(text));
}
