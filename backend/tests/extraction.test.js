/** Extraction tests: PDF and Excel work independently and agree with each other. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromPdf } from '../services/pdfExtraction.service.js';
import { extractFromExcel } from '../services/excelExtraction.service.js';
import { mapRows, matchHeader } from '../services/columnMapper.service.js';
import { ROWS } from '../sample-data/generate-samples.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-data');
const asArrays = (records) => records.map((r) => [r.sno, r.name, r.email, r.title, r.company]);

test('header synonyms are recognized', () => {
  assert.equal(matchHeader('S.No'), 'sno');
  assert.equal(matchHeader('#'), 'sno');
  assert.equal(matchHeader('E-mail Address'), 'email');
  assert.equal(matchHeader('Recruiter Name'), 'name');
  assert.equal(matchHeader('Job Title'), 'title');
  assert.equal(matchHeader('Designation'), 'title');
  assert.equal(matchHeader('Organisation'), 'company');
  assert.equal(matchHeader('Nimbus Labs'), null);
});

test('mapRows detects header row below a title and handles reordered columns', () => {
  const { records, strategy } = mapRows([
    ['Recruiter list Q3'],
    [],
    ['Company', 'Mail ID', 'HR Name', 'Position'],
    ['Acme', 'hr@acme.example.com', 'Sam', 'Dev'],
  ]);
  assert.equal(strategy, 'header');
  assert.deepEqual(records[0], { sno: '', name: 'Sam', email: 'hr@acme.example.com', title: 'Dev', company: 'Acme' });
});

test('mapRows falls back to positional order when there is no header', () => {
  const { records, strategy } = mapRows([['1', 'Sam', 'sam@example.com', 'Dev', 'Acme']]);
  assert.equal(strategy, 'positional');
  assert.equal(records[0].company, 'Acme');
});

test('Excel (.xlsx) extraction returns every row exactly', () => {
  const { records, strategy } = extractFromExcel(path.join(dir, 'recruiters.xlsx'));
  assert.equal(strategy, 'header');
  assert.deepEqual(asArrays(records), ROWS);
});

test('Excel (.xls) extraction returns every row exactly', () => {
  const { records } = extractFromExcel(path.join(dir, 'recruiters.xls'));
  assert.deepEqual(asArrays(records), ROWS);
});

test('PDF extraction: multi-page, repeated header, wrapped cell, footer ignored', async () => {
  const result = await extractFromPdf(path.join(dir, 'recruiters.pdf'));
  assert.equal(result.requiresOcr, false);
  assert.equal(result.pages, 2);
  assert.deepEqual(asArrays(result.records), ROWS);
});

test('scanned PDF is flagged as requiring OCR', async () => {
  const result = await extractFromPdf(path.join(dir, 'recruiters-scanned.pdf'));
  assert.equal(result.requiresOcr, true);
  assert.equal(result.records.length, 0);
});
