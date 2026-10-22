/** CSV (src/components/import/csv.ts) and export dates (dates.ts): BOM, quotes, commas, line breaks, en/es dates. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headerKey, parseCsv, pick, readTable } from '../src/components/import/csv.ts';
import { toPartialDate } from '../src/components/import/dates.ts';

test('parseCsv: BOM, quoted commas, doubled quotes, line breaks inside quotes, CRLF/LF/CR, blank lines', () => {
  const input = '﻿a,b,c\r\n"x, y","di ""hola""","uno\r\ndos"\n\n1,,3\r4,5,6';
  assert.deepEqual(parseCsv(input), [
    ['a', 'b', 'c'],
    ['x, y', 'di "hola"', 'uno\r\ndos'],
    ['1', '', '3'],
    ['4', '5', '6'],
  ]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('solo'), [['solo']]);
  assert.deepEqual(parseCsv('a,"sin cierre\n'), [['a', 'sin cierre\n']], 'an unclosed quote keeps the rest as the field');
});

test('headerKey folds case, accents and punctuation', () => {
  assert.equal(headerKey('Started On'), 'startedon');
  assert.equal(headerKey(' Fecha de finalización '), 'fechadefinalizacion');
  assert.equal(headerKey('Company_Name'), 'companyname');
});

test('readTable finds the header after a preamble (Connections.csv «Notes:») and drops empty rows', () => {
  const t = readTable('Notes:\n"Some text, here"\n\nFirst Name,Last Name\nAna,Ejemplo\n,\n', ['firstname']);
  assert.deepEqual(t?.keys, ['firstname', 'lastname']);
  assert.deepEqual(t?.rows, [{ firstname: 'Ana', lastname: 'Ejemplo' }]);
  assert.equal(readTable('x,y\n1,2\n', ['firstname']), null, 'no known header: null, never a guess');
  assert.equal(pick({ a: '', b: 'B' }, ['a', 'b']), 'B');
  assert.equal(pick({}, ['a']), '');
});

test('toPartialDate: what LinkedIn and JSON Resume write, in English and Spanish', () => {
  const cases: [string, string | undefined][] = [
    ['2020', '2020'],
    ['Jan 2020', '2020-01'],
    ['January 2020', '2020-01'],
    ['ene. 2020', '2020-01'],
    ['Ene 2020', '2020-01'],
    ['enero de 2020', '2020-01'],
    ['sept. 2021', '2021-09'],
    ['set 2021', '2021-09'],
    ['dic. 2020', '2020-12'],
    ['2020-01', '2020-01'],
    ['2020-1-5', '2020-01-05'],
    ['2020-01-15T00:00:00Z', '2020-01-15'],
    ['01/2020', '2020-01'],
    ['Jan 15, 2020', '2020-01-15'],
    ['15 ene 2020', '2020-01-15'],
    ['15 de enero de 2020', '2020-01-15'],
    ['15/01/2020', '2020-01-15'],
    ['01/15/2020', '2020-01-15'],
    ['05/06/2020', '2020'],
    ['2021-02-30', '2021-02'],
    ['13/2016', undefined],
    ['Present', undefined],
    ['', undefined],
    ['1850', undefined],
    ['Foo 2020', undefined],
  ];
  for (const [input, want] of cases) assert.equal(toPartialDate(input), want, input);
  assert.equal(toPartialDate(2020), undefined);
});
