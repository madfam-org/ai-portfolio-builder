/**
 * W5-J job intake: the closed vocabularies of the structured job fields (docs/PRODUCT.md "Job intake"). Dependency-free
 * and type-only safe, so the schema (CHECK constraints), the zod bodies, the extractors and the browser share ONE list.
 *
 * Append-only: a stored value is never renamed or removed (old rows keep their meaning). W5-H (HCM benchmarking)
 * reads `stateCode`, `countryCode` and the salary fields; their meaning is fixed here.
 */

/** How a job reached cv: typed/pasted text, a fetched link, an ATS public API, the person's own browser capture, a file. */
export const SOURCE_KINDS = ['paste', 'url', 'ats', 'capture', 'pdf', 'docx', 'file'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** schema.org `employmentType` (FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, PER_DIEM, OTHER), lower-cased. */
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary', 'internship', 'volunteer', 'per_diem', 'other'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Where the work happens. schema.org only states remote (`jobLocationType: TELECOMMUTE`); the others come from text. */
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** The period a stated salary refers to (schema.org QuantitativeValue `unitText`: HOUR, DAY, WEEK, MONTH, YEAR). */
export const SALARY_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/**
 * ISO 3166-2:MX subdivision codes (the 32 federal entities), stored with the country prefix (`MX-JAL`). The column
 * accepts any `CC-XXX` shape so other countries can follow; the intake only ever sets Mexican codes.
 */
export const MX_STATE_CODES = [
  'MX-AGU', 'MX-BCN', 'MX-BCS', 'MX-CAM', 'MX-CHP', 'MX-CHH', 'MX-CMX', 'MX-COA', 'MX-COL', 'MX-DUR', 'MX-GUA',
  'MX-GRO', 'MX-HID', 'MX-JAL', 'MX-MEX', 'MX-MIC', 'MX-MOR', 'MX-NAY', 'MX-NLE', 'MX-OAX', 'MX-PUE', 'MX-QUE',
  'MX-ROO', 'MX-SLP', 'MX-SIN', 'MX-SON', 'MX-TAB', 'MX-TAM', 'MX-TLA', 'MX-VER', 'MX-YUC', 'MX-ZAC',
] as const;
export type MxStateCode = (typeof MX_STATE_CODES)[number];

/** Shapes the database enforces (CHECK) and the API validates. */
export const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
export const STATE_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
/** The largest salary amount accepted (numeric(14,2)). */
export const SALARY_MAX_AMOUNT = 999_999_999_999;

/** Where each previewed field came from (shown next to it: «de JSON-LD», «del texto» …). */
export const PROVENANCES = ['json-ld', 'microdata', 'open-graph', 'ats-api', 'page-title', 'labeled-text', 'first-line', 'text'] as const;
export type Provenance = (typeof PROVENANCES)[number];
