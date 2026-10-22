/**
 * The profile editor's field descriptors (src/components/profile/fields.ts) against the API's zod schemas
 * (server/api/validation.ts ITEM_CONTENT, profileBody, contactSchema): same fields, same required set, same types,
 * same enum options, same limits; the browser-side check accepts and refuses exactly what zod does on every sample;
 * and form ↔ content mapping round-trips for every kind.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { z } from 'zod';
import { ITEM_CONTENT, contactSchema, itemCreateBody, profileBody } from '../src/server/api/validation.ts';
import { PROFILE_ITEM_KINDS } from '../src/server/db/schema.ts';
import {
  CONTACT_FIELDS,
  HEADER_FIELDS,
  ITEM_FIELDS,
  ITEM_KIND_ORDER,
  TAGS_MAX,
  TAG_MAX,
  URL_MAX,
  checkTags,
  contentToForm,
  formToContent,
  issuesToErrors,
  itemHeading,
  itemPeriod,
  splitTags,
  type FieldSpec,
} from '../src/components/profile/fields.ts';
import { PROFILE_COPY, fieldLabel } from '../src/lib/copy/profile.ts';

// Test-only: zod internals are walked structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const KINDS = [...PROFILE_ITEM_KINDS];

function unwrap(schema: Any): { inner: Any; optional: boolean; nullable: boolean } {
  let inner = schema;
  let optional = false;
  let nullable = false;
  for (;;) {
    const t = inner.def.type;
    if (t === 'optional') optional = true;
    else if (t === 'nullable') nullable = true;
    else if (t !== 'default') break;
    if (t === 'default') optional = true;
    inner = inner.unwrap ? inner.unwrap() : inner.def.innerType;
  }
  return { inner, optional, nullable };
}

/** A valid value of the field's type, as stored. */
function sample(spec: FieldSpec): unknown {
  switch (spec.type) {
    case 'text':
    case 'textarea':
      return `Texto de ${spec.name}`;
    case 'email':
      return 'ana@example.org';
    case 'url':
      return 'https://example.org/trabajo';
    case 'date':
      return '2021-03';
    case 'enum':
      return spec.options[spec.options.length - 1];
    case 'int':
      return spec.max;
    case 'bool':
      return true;
    case 'bullets':
      return ['Primer logro', 'Segundo logro'];
    case 'links':
      return [
        { label: 'Código', url: 'https://example.org/codigo' },
        { label: 'Demo', url: 'http://example.org/demo' },
      ];
  }
}

const full = (specs: readonly FieldSpec[]) => Object.fromEntries(specs.map((f) => [f.name, sample(f)]));
const minimal = (specs: readonly FieldSpec[]) => Object.fromEntries(specs.filter((f) => f.required).map((f) => [f.name, sample(f)]));
const zodOk = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;
/** The browser check on the same content (through the form, as the editor does). */
const formOk = (specs: readonly FieldSpec[], value: Record<string, unknown>) => Object.keys(formToContent(specs, contentToForm(specs, value)).errors).length === 0;

test('every item kind of the API has a descriptor, and nothing else does (11 kinds, read-proof)', () => {
  assert.equal(KINDS.length, 11);
  assert.deepEqual(Object.keys(ITEM_FIELDS).sort(), [...KINDS].sort());
  assert.deepEqual([...ITEM_KIND_ORDER].sort(), [...KINDS].sort());
  assert.deepEqual(Object.keys(ITEM_CONTENT).sort(), [...KINDS].sort());
});

function structuralParity(label: string, schema: Any, specs: readonly FieldSpec[]): number {
  const shape = schema.shape as Record<string, Any>;
  assert.deepEqual(Object.keys(shape).sort(), specs.map((f) => f.name).sort(), `${label}: field names`);
  let checked = 0;
  for (const spec of specs) {
    const at = `${label}.${spec.name}`;
    const { inner, optional, nullable } = unwrap(shape[spec.name]);
    assert.equal(!optional, spec.required === true, `${at}: required`);
    assert.equal(nullable, spec.type === 'date' && spec.nullable === true, `${at}: nullable`);
    switch (spec.type) {
      case 'text':
      case 'textarea':
      case 'email':
        assert.equal(inner.def.type, 'string', at);
        assert.equal(inner.maxLength, spec.max, `${at}: max`);
        break;
      case 'url':
        assert.equal(inner.maxLength, URL_MAX, `${at}: max`);
        break;
      case 'date':
        assert.equal(inner.def.type, 'string', at);
        break;
      case 'enum':
        assert.deepEqual(inner.options, [...spec.options], `${at}: options`);
        break;
      case 'int':
        assert.equal(inner.minValue, spec.min, `${at}: min`);
        assert.equal(inner.maxValue, spec.max, `${at}: max`);
        break;
      case 'bool':
        assert.equal(inner.def.type, 'boolean', at);
        break;
      case 'bullets':
        assert.equal(inner.def.type, 'array', at);
        assert.equal(inner.element.maxLength, spec.itemMax, `${at}: line max`);
        assert.equal(zodOk(inner, Array(spec.max).fill('x')), true, `${at}: ${spec.max} lines`);
        assert.equal(zodOk(inner, Array(spec.max + 1).fill('x')), false, `${at}: ${spec.max + 1} lines`);
        break;
      case 'links':
        assert.equal(inner.def.type, 'array', at);
        assert.equal(zodOk(inner, Array(spec.max).fill({ label: 'a', url: 'https://e.test' })), true, `${at}: ${spec.max} links`);
        assert.equal(zodOk(inner, Array(spec.max + 1).fill({ label: 'a', url: 'https://e.test' })), false, `${at}: ${spec.max + 1} links`);
        break;
    }
    checked += 1;
  }
  return checked;
}

test('descriptor ↔ zod, field by field: names, required, nullable, types, enum options and limits', () => {
  let checked = 0;
  for (const kind of KINDS) checked += structuralParity(kind, ITEM_CONTENT[kind], ITEM_FIELDS[kind]);
  checked += structuralParity('profile', profileBody.omit({ locale: true, contact: true }), HEADER_FIELDS.map((f) => ({ ...f, required: false })));
  checked += structuralParity('contact', contactSchema, CONTACT_FIELDS);
  assert.ok(checked >= 60, `checked only ${checked} fields`);
  // The header descriptor covers profileBody except the two fields with their own controls (locale select, contact).
  assert.deepEqual(Object.keys((profileBody as Any).shape).sort(), ['contact', 'displayName', 'headline', 'locale', 'summary']);
});

/** Samples per field type: [value, expected by zod]. The browser check must agree with zod on every one. */
function samplesFor(spec: FieldSpec): [unknown, string][] {
  switch (spec.type) {
    case 'text':
    case 'textarea':
      return [['x'.repeat(spec.max), 'max'], ['x'.repeat(spec.max + 1), 'max+1'], ['  padded  ', 'padded']];
    case 'email':
      return [['ana@example.org', 'ok'], ['ana.maria+cv@sub.example.mx', 'ok2'], ['ana@', 'bad'], ['ana@@example.org', 'bad2'], ['.ana@example.org', 'dot'], ['ana@example', 'tld']];
    case 'url':
      return [['https://example.org/a', 'https'], ['http://example.org', 'http'], ['javascript:alert(1)', 'js'], ['ftp://example.org', 'ftp'], ['example.org', 'bare'], [`https://e.test/${'a'.repeat(URL_MAX)}`, 'long']];
    case 'date':
      return [['2024', 'y'], ['2024-05', 'ym'], ['2024-05-31', 'ymd'], ['2024-13', 'm13'], ['24', 'yy'], ['2024/05', 'slash'], ['2024-02-32', 'd32']];
    case 'enum':
      return [...spec.options.map((o): [unknown, string] => [o, o]), ['bogus', 'bogus']];
    case 'int':
      return [[spec.min, 'min'], [spec.max, 'max'], [spec.max + 1, 'max+1'], [spec.min - 1, 'min-1'], [1.5, 'fraction']];
    case 'bool':
      return [[true, 'true'], [false, 'false']];
    case 'bullets':
      return [[['x'.repeat(spec.itemMax)], 'line max'], [['x'.repeat(spec.itemMax + 1)], 'line max+1'], [Array(spec.max + 1).fill('x'), 'too many']];
    case 'links':
      return [
        [[{ label: 'a', url: 'https://e.test' }], 'ok'],
        [[{ label: 'a', url: 'javascript:alert(1)' }], 'js'],
        [[{ label: 'x'.repeat(121), url: 'https://e.test' }], 'label long'],
        [Array(spec.max + 1).fill({ label: 'a', url: 'https://e.test' }), 'too many'],
      ];
  }
}

test('the browser check accepts and refuses exactly what zod does, sample by sample, for every field of every kind', () => {
  let compared = 0;
  const run = (label: string, schema: z.ZodType, specs: readonly FieldSpec[], base: Record<string, unknown>) => {
    for (const spec of specs) {
      for (const [value, name] of samplesFor(spec)) {
        const content = { ...base, [spec.name]: value };
        assert.equal(formOk(specs, content), zodOk(schema, content), `${label}.${spec.name} ${name}`);
        compared += 1;
      }
      if (!spec.required) {
        const without = { ...base };
        delete without[spec.name];
        assert.equal(zodOk(schema, without), true, `${label}.${spec.name} omitted`);
      } else {
        const blank = { ...base, [spec.name]: '   ' };
        assert.equal(zodOk(schema, blank), false, `${label}.${spec.name} blank (zod)`);
        assert.equal(formOk(specs, blank), false, `${label}.${spec.name} blank (form)`);
      }
    }
  };
  for (const kind of KINDS) run(kind, ITEM_CONTENT[kind], ITEM_FIELDS[kind], minimal(ITEM_FIELDS[kind]));
  run('contact', contactSchema, CONTACT_FIELDS, {});
  assert.ok(compared >= 250, `compared only ${compared} samples`);
});

test('form ↔ content round-trips for every kind (full and minimal), and the API accepts the result unchanged', () => {
  for (const kind of KINDS) {
    const specs = ITEM_FIELDS[kind];
    for (const content of [full(specs), minimal(specs)]) {
      const { content: back, errors } = formToContent(specs, contentToForm(specs, content));
      assert.deepEqual(errors, {}, kind);
      assert.deepEqual(back, content, kind);
      const parsed = ITEM_CONTENT[kind].safeParse(back);
      assert.equal(parsed.success, true, kind);
      assert.deepEqual(parsed.data, content, `${kind}: zod changes nothing`);
      assert.equal(itemCreateBody.safeParse({ kind, content: back, tags: ['sql'] }).success, true, kind);
    }
  }
});

test('control ids cannot collide: no field is named like the ids a form adds next to its fields (a collision unlabels an input)', () => {
  // ItemForm: `${formId}-${field}` for fields, `${formId}-heading` and `${formId}-tags`; fields add `-hint` / `-error`.
  const reserved = new Set(['heading', 'tags', 'hint', 'error']);
  for (const kind of KINDS) {
    const names = ITEM_FIELDS[kind].map((f) => f.name);
    assert.deepEqual(names.filter((n) => reserved.has(n)), [], kind);
    assert.equal(new Set(names).size, names.length, `${kind}: duplicate field`);
  }
});

test('form normalisation: empty optionals are left out, strings trimmed, blank lines and blank link rows dropped', () => {
  const specs = ITEM_FIELDS.experience;
  const values = { ...contentToForm(specs, {}), role: '  Analista ', organization: 'Banco', summary: '   ', highlights: 'Uno\n\n  Dos  \n', employmentType: 'contract', current: false };
  assert.deepEqual(formToContent(specs, values), { content: { role: 'Analista', organization: 'Banco', employmentType: 'contract', highlights: ['Uno', 'Dos'] }, errors: {} });
  const project = { ...contentToForm(ITEM_FIELDS.project, {}), name: 'Sitio', links: [{ label: '', url: '' }, { label: 'Repo', url: 'https://e.test/r' }], years: '' };
  assert.deepEqual(formToContent(ITEM_FIELDS.project, project).content, { name: 'Sitio', links: [{ label: 'Repo', url: 'https://e.test/r' }] });
  const half = { ...project, links: [{ label: '', url: 'https://e.test/r' }] };
  assert.deepEqual(formToContent(ITEM_FIELDS.project, half).errors.links, { code: 'required', row: 0, part: 'label' });
  const bad = { ...project, links: [{ label: 'x', url: 'javascript:alert(1)' }] };
  assert.deepEqual(formToContent(ITEM_FIELDS.project, bad).errors.links, { code: 'url', row: 0, part: 'url' });
  assert.deepEqual(formToContent(ITEM_FIELDS.skill, { name: 'SQL', years: '2.5' }).errors.years, { code: 'int', min: 0, max: 80 });
  assert.deepEqual(formToContent(ITEM_FIELDS.skill, { name: 'SQL', years: '7' }).content, { name: 'SQL', years: 7 });
});

test('tags: split on commas, semicolons and lines; de-duplicated; the same limits as the API', () => {
  assert.deepEqual(splitTags('SQL, Python;sql\n  dbt  ,,'), ['SQL', 'Python', 'dbt']);
  assert.equal(checkTags(Array.from({ length: TAGS_MAX }, (_, i) => `t${i}`)), null);
  assert.deepEqual(checkTags(Array.from({ length: TAGS_MAX + 1 }, (_, i) => `t${i}`)), { code: 'tooMany', max: TAGS_MAX });
  assert.deepEqual(checkTags(['x'.repeat(TAG_MAX + 1)]), { code: 'tooLong', max: TAG_MAX });
  const body = (tags: string[]) => itemCreateBody.safeParse({ kind: 'skill', content: {}, tags }).success;
  assert.equal(body(Array(TAGS_MAX).fill('x')), true);
  assert.equal(body(Array(TAGS_MAX + 1).fill('x')), false);
  assert.equal(body(['x'.repeat(TAG_MAX + 1)]), false);
});

test('API issues land on their field (content and contact paths), unknown paths on the form', () => {
  const errors = issuesToErrors(
    [
      { path: 'url', message: 'must be an http(s) URL' },
      { path: 'links.1.url', message: 'bad' },
      { path: 'contact.email', message: 'Invalid email' },
      { path: 'tags.3', message: 'Too big' },
      { path: 'whatever', message: 'x' },
    ],
    ['url', 'links', 'email'],
  );
  assert.deepEqual(Object.keys(errors).sort(), ['_form', 'email', 'links', 'tags', 'url']);
  assert.equal(errors.url?.code, 'server');
});

test('list rows: heading and period per kind', () => {
  assert.deepEqual(itemHeading('experience', { role: 'Analista', organization: 'Banco' }), { title: 'Analista', detail: 'Banco' });
  assert.deepEqual(itemHeading('education', { institution: 'UNAM' }), { title: 'UNAM', detail: '' });
  assert.equal(itemPeriod({ startDate: '2019-03', current: true }, 'actual'), '2019-03 – actual');
  assert.equal(itemPeriod({ date: '2020' }, 'actual'), '2020');
  assert.equal(itemPeriod({}, 'actual'), '');
});

test('copy: every field and option of every kind is labelled in es and en; both languages have the same keys', () => {
  const keys = (o: unknown): string[] =>
    o && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => [k, ...keys(v).map((x) => `${k}.${x}`)]) : [];
  assert.deepEqual(keys(PROFILE_COPY.en).sort(), keys(PROFILE_COPY.es).sort());
  let labelled = 0;
  for (const locale of ['es', 'en'] as const) {
    const c = PROFILE_COPY[locale];
    for (const kind of KINDS) {
      assert.ok(c.kinds[kind].add && c.kinds[kind].empty && c.kinds[kind].hint, `${locale} ${kind}`);
      for (const spec of ITEM_FIELDS[kind]) {
        assert.notEqual(fieldLabel(c, kind, spec.name), spec.name, `${locale} ${kind}.${spec.name} has no label`);
        labelled += 1;
        if (spec.type === 'enum') {
          const labels = spec.name === 'employmentType' ? c.options.employmentType : kind === 'language' ? c.options.languageLevel : c.options.skillLevel;
          for (const o of spec.options) assert.ok(labels[o], `${locale} ${kind}.${spec.name}=${o}`);
        }
      }
    }
  }
  // Read-proof: 54 item fields in 11 kinds, in two languages.
  assert.equal(labelled, 2 * KINDS.reduce((sum, k) => sum + ITEM_FIELDS[k].length, 0));
  assert.ok(labelled >= 100, `labelled ${labelled}`);
});
