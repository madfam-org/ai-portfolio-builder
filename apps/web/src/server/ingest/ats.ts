/**
 * W5-J: the public, key-free job APIs of applicant-tracking systems, detected by the URL a candidate sees. Each is
 * documented by its provider as public and unauthenticated (docs/PRODUCT.md "Job intake" cites the pages):
 *
 * | Provider        | Careers URL                                   | API (GET, no key)                                              |
 * |-----------------|-----------------------------------------------|----------------------------------------------------------------|
 * | Greenhouse      | boards / job-boards.greenhouse.io/<t>/jobs/<id> | boards-api.greenhouse.io/v1/boards/<t>/jobs/<id>?pay_transparency=true |
 * | Lever           | jobs(.eu).lever.co/<site>/<uuid>               | api(.eu).lever.co/v0/postings/<site>/<uuid>                    |
 * | SmartRecruiters | jobs.smartrecruiters.com/<company>/<id>        | api.smartrecruiters.com/v1/companies/<company>/postings/<id>   |
 * | Ashby           | jobs.ashbyhq.com/<board>/<uuid>                | api.ashbyhq.com/posting-api/job-board/<board>?includeCompensation=true (list, picked by id) |
 * | Workable        | apply.workable.com/<sub>/j/<shortcode>         | www.workable.com/api/accounts/<sub>?details=true (list, picked by shortcode) |
 * | Recruitee       | <co>.recruitee.com/o/<slug>                    | <co>.recruitee.com/api/offers/ (list, picked by slug)          |
 * | Pinpoint        | <co>.pinpointhq.com/postings/<uuid>            | <co>.pinpointhq.com/postings.json (list, picked by id)         |
 *
 * Not here (a key, a customer token or no documented contract): Teamtailor, Comeet, BambooHR, Breezy HR, Homerun,
 * Workday, Rippling, Personio (an XML feed with no single-job contract). Their pages go through the page path (JSON-LD).
 * W7 (B3), the systems the luxury houses use (checked 2026-10-22; docs/PRODUCT.md "Luxury career sites"): Workday (no
 * public posting API; the `/wday/cxs/` JSON is undocumented and never called), SAP SuccessFactors Career Site Builder
 * (its XML job feeds are set up per customer for contracted boards, not a public reader API), Oracle Recruiting Cloud
 * (Oracle's docs reserve the candidate-experience REST resources for Oracle's internal use), Eightfold (a customer API
 * key), Lumesse/Cornerstone TalentLink (no public documentation found). Their job pages go through the page path:
 * Workday's JSON-LD, SuccessFactors' microdata, Oracle's Open Graph, each only when robots.txt allows.
 * Fields map only what the API returns; the company is left empty when the API does not name it.
 */
import { clean, employmentType, isoDate, workMode } from './fields.ts';
import { decodeEntities, htmlToText } from './html.ts';
import { countryCode, mxStateCode } from './mx.ts';
import type { AtsProvider, DraftFields } from './types.ts';
import { CURRENCY_PATTERN, SALARY_MAX_AMOUNT, type SalaryPeriod } from './vocab.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const TOKEN = /^[A-Za-z0-9_.-]{1,100}$/;
const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBDOMAIN = /^[a-z0-9-]{1,63}$/;

export interface AtsMapped {
  fields: DraftFields;
  description: string | null;
  url: string | null;
}

export interface AtsTarget {
  provider: AtsProvider;
  apiUrl: URL;
  /** The one posting from the API's JSON (a single job, or the matching entry of a list), or null. */
  pick: (json: unknown) => Obj | null;
  map: (job: Obj, json: unknown) => AtsMapped;
}

function amount(v: unknown, divisor = 1): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const x = Math.round((n / divisor) * 100) / 100;
  return x <= SALARY_MAX_AMOUNT ? x : null;
}

const PERIOD_WORDS: readonly [RegExp, SalaryPeriod][] = [
  [/hour/i, 'hour'],
  [/day|daily/i, 'day'],
  [/week/i, 'week'],
  [/month/i, 'month'],
  [/year|annual/i, 'year'],
];
function period(v: unknown): SalaryPeriod | null {
  const s = str(v);
  if (!s) return null;
  for (const [re, p] of PERIOD_WORDS) if (re.test(s)) return p;
  return null;
}

class Builder {
  readonly fields: DraftFields = {};
  set<K extends keyof DraftFields>(key: K, value: NonNullable<DraftFields[K]>['value'] | null | undefined): void {
    if (value !== null && value !== undefined && value !== '' && !this.fields[key]) this.fields[key] = { value, from: 'ats-api' } as DraftFields[K];
  }
  place(location: string | null, country: string | null): void {
    this.set('location', clean(location));
    const cc = country ? countryCode(country) : null;
    this.set('countryCode', cc);
    const state = location ? mxStateCode(location, cc) : null;
    if (state) {
      this.set('stateCode', state);
      this.set('countryCode', 'MX');
    }
  }
  salary(min: number | null, max: number | null, currency: unknown, per: SalaryPeriod | null): void {
    if (min === null && max === null) return;
    const [lo, hi] = min !== null && max !== null && min > max ? [max, min] : [min, max];
    this.set('salaryMin', lo);
    this.set('salaryMax', hi);
    const c = str(currency)?.toUpperCase() ?? null;
    this.set('salaryCurrency', c && CURRENCY_PATTERN.test(c) ? c : null);
    this.set('salaryPeriod', per);
  }
}

const html = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return htmlToText(/&lt;\/?[a-z]/i.test(s) ? decodeEntities(s) : s) || null;
};
const joinText = (parts: (string | null)[]) => parts.filter(Boolean).join('\n\n') || null;

const ASHBY_TYPES: Record<string, string> = { FullTime: 'full_time', PartTime: 'part_time', Intern: 'intern', Contract: 'contract', Temporary: 'temporary' };

function greenhouse(token: string, id: string): AtsTarget {
  return {
    provider: 'greenhouse',
    apiUrl: new URL(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${id}?pay_transparency=true`),
    pick: (json) => (isObj(json) && (typeof json.id === 'number' || typeof json.id === 'string') ? json : null),
    map: (job) => {
      const b = new Builder();
      b.set('title', clean(job.title));
      b.set('company', clean(job.company_name));
      b.place(isObj(job.location) ? str(job.location.name) : null, null);
      b.set('datePosted', isoDate(job.first_published));
      const pay = arr(job.pay_input_ranges).find(isObj);
      if (pay) b.salary(amount(pay.min_cents, 100), amount(pay.max_cents, 100), pay.currency_type, null);
      return { fields: b.fields, description: html(job.content), url: str(job.absolute_url) };
    },
  };
}

function lever(site: string, id: string, eu: boolean): AtsTarget {
  return {
    provider: 'lever',
    apiUrl: new URL(`https://api${eu ? '.eu' : ''}.lever.co/v0/postings/${encodeURIComponent(site)}/${id}`),
    pick: (json) => (isObj(json) && typeof json.id === 'string' ? json : null),
    map: (job) => {
      const b = new Builder();
      const cat = isObj(job.categories) ? job.categories : {};
      b.set('title', clean(job.text));
      b.place(str(cat.location) ?? (arr(cat.allLocations).map(str).filter(Boolean).join(' · ') || null), str(job.country));
      b.set('employmentType', employmentType(cat.commitment));
      b.set('workMode', str(job.workplaceType) && job.workplaceType !== 'unspecified' ? workMode(String(job.workplaceType)) : null);
      if (isObj(job.salaryRange)) b.salary(amount(job.salaryRange.min), amount(job.salaryRange.max), job.salaryRange.currency, period(job.salaryRange.interval));
      const lists = arr(job.lists)
        .filter(isObj)
        .map((l) => joinText([str(l.text), html(l.content)]));
      return { fields: b.fields, description: joinText([str(job.descriptionPlain) ?? html(job.description), ...lists, str(job.additionalPlain) ?? html(job.additional)]), url: str(job.hostedUrl) };
    },
  };
}

function smartrecruiters(company: string, id: string): AtsTarget {
  return {
    provider: 'smartrecruiters',
    apiUrl: new URL(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${id}`),
    pick: (json) => (isObj(json) && json.id !== undefined ? json : null),
    map: (job) => {
      const b = new Builder();
      const loc = isObj(job.location) ? job.location : {};
      b.set('title', clean(job.name));
      b.set('company', clean(isObj(job.company) ? job.company.name : null));
      b.place([str(loc.city), str(loc.region)].filter(Boolean).join(', ') || null, str(loc.country));
      b.set('workMode', loc.remote === true ? 'remote' : loc.hybrid === true ? 'hybrid' : null);
      b.set('employmentType', employmentType(isObj(job.typeOfEmployment) ? job.typeOfEmployment.label : null));
      if (isObj(job.compensation)) b.salary(amount(job.compensation.min), amount(job.compensation.max), job.compensation.currency, period(job.compensation.period));
      b.set('datePosted', isoDate(job.releasedDate));
      const sections = isObj(job.jobAd) && isObj(job.jobAd.sections) ? job.jobAd.sections : {};
      const parts = ['jobDescription', 'qualifications', 'additionalInformation', 'companyDescription'].map((k) => {
        const s = sections[k];
        return isObj(s) ? joinText([str(s.title), html(s.text)]) : null;
      });
      return { fields: b.fields, description: joinText(parts), url: str(job.postingUrl) };
    },
  };
}

function ashby(board: string, id: string): AtsTarget {
  return {
    provider: 'ashby',
    apiUrl: new URL(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`),
    pick: (json) => (isObj(json) ? ((arr(json.jobs).find((j) => isObj(j) && String(j.id).toLowerCase() === id.toLowerCase()) as Obj | undefined) ?? null) : null),
    map: (job) => {
      const b = new Builder();
      b.set('title', clean(job.title));
      const address = isObj(job.address) && isObj(job.address.postalAddress) ? job.address.postalAddress : {};
      b.place(str(job.location), str(address.addressCountry));
      const type = str(job.employmentType);
      b.set('employmentType', type ? employmentType(ASHBY_TYPES[type] ?? type) : null);
      b.set('workMode', str(job.workplaceType) ? workMode(String(job.workplaceType).replace(/OnSite/i, 'on-site')) : job.isRemote === true ? 'remote' : null);
      const comp = isObj(job.compensation) ? arr(job.compensation.summaryComponents).find((c) => isObj(c) && c.compensationType === 'Salary') : undefined;
      if (isObj(comp)) b.salary(amount(comp.minValue), amount(comp.maxValue), comp.currencyCode, period(comp.interval));
      b.set('datePosted', isoDate(job.publishedAt));
      return { fields: b.fields, description: str(job.descriptionPlain) ?? html(job.descriptionHtml), url: str(job.jobUrl) };
    },
  };
}

function workable(sub: string, shortcode: string): AtsTarget {
  return {
    provider: 'workable',
    apiUrl: new URL(`https://www.workable.com/api/accounts/${encodeURIComponent(sub)}?details=true`),
    pick: (json) => (isObj(json) ? ((arr(json.jobs).find((j) => isObj(j) && String(j.shortcode).toLowerCase() === shortcode.toLowerCase()) as Obj | undefined) ?? null) : null),
    map: (job, json) => {
      const b = new Builder();
      b.set('title', clean(job.title));
      b.set('company', clean(isObj(json) ? json.name : null));
      const loc = arr(job.locations).find((l) => isObj(l) && l.hidden !== true);
      const l = isObj(loc) ? loc : {};
      b.place([str(job.city) ?? str(l.city), str(job.state) ?? str(l.region)].filter(Boolean).join(', ') || null, str(l.countryCode) ?? str(job.country));
      b.set('employmentType', employmentType(job.employment_type));
      b.set('workMode', str(job.workplace_type) ? workMode(String(job.workplace_type).replace(/_/g, '-')) : job.telecommuting === true ? 'remote' : null);
      b.set('datePosted', isoDate(job.published_on));
      return { fields: b.fields, description: html(job.description), url: str(job.url) ?? str(job.shortlink) };
    },
  };
}

function recruitee(company: string, slug: string): AtsTarget {
  return {
    provider: 'recruitee',
    apiUrl: new URL(`https://${company}.recruitee.com/api/offers/`),
    pick: (json) => (isObj(json) ? ((arr(json.offers).find((o) => isObj(o) && (o.slug === slug || String(o.id) === slug)) as Obj | undefined) ?? null) : null),
    map: (job) => {
      const b = new Builder();
      b.set('title', clean(job.title));
      b.set('company', clean(job.company_name));
      const loc = arr(job.locations).find(isObj);
      b.place(str(job.location) ?? (isObj(loc) ? [str(loc.city), str(loc.state)].filter(Boolean).join(', ') : null), str(job.country_code) ?? (isObj(loc) ? str(loc.country_code) : null));
      b.set('workMode', job.hybrid === true ? 'hybrid' : job.remote === true ? 'remote' : job.on_site === true ? 'onsite' : null);
      b.set('employmentType', employmentType(job.employment_type_code));
      if (isObj(job.salary)) b.salary(amount(job.salary.min), amount(job.salary.max), job.salary.currency, period(job.salary.period));
      b.set('datePosted', isoDate(job.published_at));
      return { fields: b.fields, description: joinText([html(job.description), html(job.requirements)]), url: str(job.careers_url) };
    },
  };
}

function pinpoint(company: string, id: string): AtsTarget {
  return {
    provider: 'pinpoint',
    apiUrl: new URL(`https://${company}.pinpointhq.com/postings.json`),
    pick: (json) => (isObj(json) ? ((arr(json.data).find((p) => isObj(p) && (String(p.id) === id || (typeof p.url === 'string' && p.url.endsWith(`/${id}`)))) as Obj | undefined) ?? null) : null),
    map: (job) => {
      const b = new Builder();
      b.set('title', clean(job.title));
      b.place(isObj(job.location) ? str(job.location.name) : null, null);
      b.set('employmentType', employmentType(job.employment_type ?? job.employment_type_text));
      b.set('workMode', str(job.workplace_type) ? workMode(String(job.workplace_type).replace(/_/g, '-')) : null);
      if (job.compensation_visible !== false) b.salary(amount(job.compensation_minimum), amount(job.compensation_maximum), job.compensation_currency, period(job.compensation_frequency));
      return {
        fields: b.fields,
        description: joinText([html(job.description), html(job.key_responsibilities), html(job.skills_knowledge_expertise), html(job.benefits)]),
        url: str(job.url),
      };
    },
  };
}

/** The ATS API for a careers URL, or null (then the page path reads the page's JSON-LD). */
export function detectAts(url: URL): AtsTarget | null {
  const host = url.hostname.toLowerCase();
  const seg = url.pathname.split('/').filter(Boolean);
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    if (seg[0] === 'embed' && seg[1] === 'job_app') {
      const token = url.searchParams.get('for');
      const id = url.searchParams.get('token');
      return token && id && TOKEN.test(token) && /^\d{1,20}$/.test(id) ? greenhouse(token, id) : null;
    }
    if (seg.length >= 3 && seg[1] === 'jobs' && TOKEN.test(seg[0]!) && /^\d{1,20}$/.test(seg[2]!)) return greenhouse(seg[0]!, seg[2]!);
    return null;
  }
  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && seg.length >= 2 && TOKEN.test(seg[0]!) && UUID_ANY.test(seg[1]!)) return lever(seg[0]!, seg[1]!, host === 'jobs.eu.lever.co');
  if (host === 'jobs.smartrecruiters.com' && seg.length >= 2 && TOKEN.test(seg[0]!)) {
    const id = /^(\d{6,20})(-|$)/.exec(seg[1]!)?.[1];
    return id ? smartrecruiters(seg[0]!, id) : null;
  }
  if (host === 'jobs.ashbyhq.com' && seg.length >= 2 && TOKEN.test(seg[0]!) && UUID_ANY.test(seg[1]!)) return ashby(seg[0]!, seg[1]!);
  if (host === 'apply.workable.com' && seg.length >= 3 && seg[1] === 'j' && SUBDOMAIN.test(seg[0]!) && /^[A-Za-z0-9]{4,20}$/.test(seg[2]!)) return workable(seg[0]!, seg[2]!);
  const sub = /^([a-z0-9-]{1,63})\.(recruitee\.com|pinpointhq\.com)$/.exec(host);
  if (sub && sub[2] === 'recruitee.com' && seg[0] === 'o' && seg[1] && /^[A-Za-z0-9-]{1,200}$/.test(seg[1])) return recruitee(sub[1]!, seg[1]);
  if (sub && sub[2] === 'pinpointhq.com') {
    const at = seg.indexOf('postings');
    const id = at >= 0 ? seg[at + 1] : undefined;
    if (id && /^[A-Za-z0-9-]{1,64}$/.test(id)) return pinpoint(sub[1]!, id);
  }
  return null;
}
