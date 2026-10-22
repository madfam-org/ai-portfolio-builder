import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COUNTRY_FIELD, SALARY_FIELDS, STATE_FIELDS, jobFacts, normalizeStateCode, sanitizeTitle, stateFromLocation } from '../src/server/hcm/facts.ts';

test('state codes: ISO, three-letter and INEGI keys normalise to ISO 3166-2:MX', () => {
  assert.equal(normalizeStateCode('MX-CMX'), 'MX-CMX');
  assert.equal(normalizeStateCode('nle'), 'MX-NLE');
  assert.equal(normalizeStateCode('09'), 'MX-CMX');
  assert.equal(normalizeStateCode(9), 'MX-CMX');
  for (const bad of ['MX-XXX', 'CDMX', '33', '', null, undefined, {}]) assert.equal(normalizeStateCode(bad), null, String(bad));
});

test('state from free-text location: one state named, accents and case folded, longest name wins', () => {
  assert.equal(stateFromLocation('Ciudad de México'), 'MX-CMX');
  assert.equal(stateFromLocation('CDMX (híbrido)'), 'MX-CMX');
  assert.equal(stateFromLocation('Monterrey, Nuevo León'), 'MX-NLE');
  assert.equal(stateFromLocation('La Paz, Baja California Sur'), 'MX-BCS');
  assert.equal(stateFromLocation('Tijuana, Baja California'), 'MX-BCN');
  assert.equal(stateFromLocation('Naucalpan, Estado de México'), 'MX-MEX');
  assert.equal(stateFromLocation('México'), null, 'the country is not a state');
  assert.equal(stateFromLocation('Remoto'), null);
  assert.equal(stateFromLocation('Jalisco o Ciudad de México'), null, 'two states: no guess');
});

test('structured state field wins over the location text', () => {
  const facts = jobFacts({ title: 'Dev', location: 'Jalisco', stateCode: 'MX-CMX' });
  assert.equal(facts.state, 'MX-CMX');
  assert.equal(facts.stateSource, 'job_field');
  const fromText = jobFacts({ title: 'Dev', location: 'Guadalajara, Jalisco' });
  assert.deepEqual([fromText.state, fromText.stateSource], ['MX-JAL', 'location_text']);
  assert.deepEqual([jobFacts({ title: 'Dev', location: '' }).state, jobFacts({ title: 'Dev', location: '' }).stateSource], [null, null]);
});

test('salary: monthly MXN is comparable (midpoint of a range); anything else is shown but not compared', () => {
  assert.equal(jobFacts({ title: 'x', salaryMin: 20_000, salaryMax: 30_000, salaryCurrency: 'MXN', salaryPeriod: 'month' }).comparableMonthlyMxn, 25_000);
  assert.equal(jobFacts({ title: 'x', salaryMin: '18000.00', salaryPeriod: 'month' }).comparableMonthlyMxn, 18_000, 'numeric columns may arrive as strings');
  assert.equal(jobFacts({ title: 'x', salaryMin: 22_000, salaryMax: 22_000, salaryCurrency: 'MXN', salaryPeriod: 'month' }).comparableMonthlyMxn, 22_000);
  const hourly = jobFacts({ title: 'x', salaryMin: 120, salaryPeriod: 'hour', salaryCurrency: 'MXN' });
  assert.equal(hourly.comparableMonthlyMxn, null);
  assert.equal(hourly.salary?.min, 120);
  assert.equal(jobFacts({ title: 'x', salaryMin: 3000, salaryPeriod: 'month', salaryCurrency: 'USD' }).comparableMonthlyMxn, null);
  assert.equal(jobFacts({ title: 'x' }).salary, null);
  assert.equal(jobFacts({ title: 'x', salaryMin: -5, salaryPeriod: 'month' }).salary, null);
});

test('a job outside Mexico sends no state (national Mexican figure) and says which country', () => {
  const abroad = jobFacts({ title: 'Dev', location: 'Jalisco', countryCode: 'US', stateCode: 'US-TX' });
  assert.deepEqual([abroad.country, abroad.state, abroad.stateSource], ['US', null, null]);
  const mx = jobFacts({ title: 'Dev', countryCode: 'MX', stateCode: 'MX-JAL' });
  assert.deepEqual([mx.country, mx.state, mx.stateSource], ['MX', 'MX-JAL', 'job_field']);
});

test('the field names read from a job row are W5-J\'s (migration 0002), pinned', () => {
  assert.equal(COUNTRY_FIELD, 'countryCode');
  assert.deepEqual([...STATE_FIELDS], ['stateCode']);
  assert.deepEqual(SALARY_FIELDS, { min: 'salaryMin', max: 'salaryMax', currency: 'salaryCurrency', period: 'salaryPeriod' });
});

test('title sent to HCM: control characters gone, spaces collapsed, at most 120 characters', () => {
  assert.equal(sanitizeTitle('  Desarrollador\u0000\n  backend\t '), 'Desarrollador backend');
  assert.equal(sanitizeTitle('a'.repeat(300)).length, 120);
});
