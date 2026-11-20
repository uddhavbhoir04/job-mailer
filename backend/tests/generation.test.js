/**
 * Email generation, validation, import/dedupe and the never-resend guarantee.
 * Uses an in-memory SQLite DB (DB_FILE=:memory:) so it never touches real data.
 */
process.env.DB_FILE = ':memory:';
process.env.DRY_RUN = 'true';

const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const path = (await import('node:path')).default;
const { fileURLToPath } = await import('node:url');
const { renderEmail, htmlToText } = await import('../services/emailGeneration.service.js');
const { validateEmail } = await import('../services/emailValidation.service.js');
const { extractFromExcel } = await import('../services/excelExtraction.service.js');
const { storeRecords, parseManualText, importManual } = await import('../services/recordImport.service.js');
const Recruiters = await import('../models/recruiter.model.js');
const { DEFAULT_TEMPLATE, DEFAULT_GENERIC_TEMPLATE, templateKindFor, templateFor, getTemplate, saveTemplate } = await import('../models/template.model.js');
const { classifyError } = await import('../services/gmail.service.js');
const { getSendSettings, setSetting } = await import('../models/settings.model.js');
const configMod = (await import('../config/index.js')).default;
const { EXPECTED } = await import('../sample-data/generate-samples.js');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-data');
const sender = { senderName: 'Test User', senderPhone: '+91 90000 00000', senderEmail: 'me@example.com' };

test('renders placeholders case-insensitively and escapes HTML', () => {
  const r = renderEmail(
    { subject: 'Application for {{title}} Position at {{Company}}', body_html: '<p>Hi {{ Name }}, {{Company}} {{SenderName}}</p>' },
    { name: 'Sam <b>', title: 'Dev', company: 'A&B', email: 'x@example.com' },
    sender,
  );
  assert.equal(r.subject, 'Application for Dev Position at A&B'); // subject is plain text, not escaped
  assert.equal(r.html, '<p>Hi Sam &lt;b&gt;, A&amp;B Test User</p>');
  assert.equal(r.text, 'Hi Sam <b>, A&B Test User');
});

test('missing fields use fallbacks and produce warnings; unknown placeholders are removed', () => {
  const r = renderEmail({ subject: '{{Title}} at {{Company}}', body_html: 'Hi {{Name}} {{Foo}}' }, { email: 'x@example.com' }, sender);
  assert.equal(r.subject, 'open at your company');
  assert.equal(r.html, 'Hi Hiring Manager ');
  assert.ok(r.warnings.some((w) => w.includes('{{Foo}}')));
  assert.ok(r.warnings.some((w) => w.includes('Missing name')));
});

test('default template renders a full email with signature', () => {
  const r = renderEmail(DEFAULT_TEMPLATE, { name: 'Priya', title: 'Node.js Developer', company: 'BrightPath Tech' }, sender);
  assert.equal(r.subject, 'Application for Node.js Developer Position at BrightPath Tech');
  assert.match(r.text, /^Hi Priya,/);
  assert.match(r.text, /Best Regards,\nTest User\n\+91 90000 00000\nme@example.com/);
});

test('htmlToText keeps paragraph breaks', () => {
  assert.equal(htmlToText('<p>a</p><p>b<br>c</p>'), 'a\n\nb\nc');
});

test('email validation', async () => {
  assert.deepEqual(await validateEmail(' MailTo:John.Doe@Example.com '), { email: 'john.doe@example.com', valid: true, error: null });
  assert.equal((await validateEmail('ananya.gupta@example')).valid, false);
  assert.equal((await validateEmail('rahul.verma.example.com')).valid, false);
  assert.equal((await validateEmail('')).error, 'Missing email');
});

test('import: duplicates (in file and across uploads) and invalid emails are counted', async () => {
  const { records } = extractFromExcel(path.join(dir, 'recruiters.xlsx'));
  const first = await storeRecords(records, 'recruiters.xlsx');
  assert.equal(first.extracted, EXPECTED.extracted);
  assert.equal(first.inserted, EXPECTED.inserted);
  assert.equal(first.duplicates, EXPECTED.duplicates);
  assert.equal(first.invalid, EXPECTED.invalid);

  const second = await storeRecords(records, 'recruiters.xlsx again');
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, EXPECTED.extracted);
});

test('a sent application can never be claimed again (unless forced)', () => {
  const r = Recruiters.listRecruiters({ valid: 'true' })[0];
  assert.equal(Recruiters.claimForSending(r.id), true);
  Recruiters.markSent(r.id, '<id@test>');
  assert.equal(Recruiters.claimForSending(r.id), false);
  assert.equal(Recruiters.claimForSending(r.id, { force: true }), true);
});

test('invalid-email records cannot be claimed', () => {
  const bad = Recruiters.listRecruiters({ valid: 'false' })[0];
  assert.equal(Recruiters.claimForSending(bad.id), false);
});

test('dry-run success leaves the record pending for a later real send', () => {
  const r = Recruiters.listRecruiters({ status: 'pending', valid: 'true' })[0];
  assert.equal(Recruiters.claimForSending(r.id), true);
  Recruiters.markDryRun(r.id);
  const after = Recruiters.getRecruiter(r.id);
  assert.equal(after.status, 'pending');
  assert.equal(after.dry_run_sent, 1);
});

test('SMTP error classification', () => {
  assert.equal(classifyError({ responseCode: 535 }).type, 'auth');
  assert.equal(classifyError({ responseCode: 550, response: '550 5.4.5 Daily user sending limit exceeded' }).type, 'quota');
  assert.equal(classifyError({ responseCode: 451 }).type, 'temporary');
  assert.equal(classifyError({ code: 'ETIMEDOUT' }).type, 'temporary');
  assert.equal(classifyError({ responseCode: 550, response: '550 5.1.1 user unknown' }).type, 'permanent');
});

test('manual text: bare emails, short and full formats, blank lines', () => {
  const recs = parseManualText(`a@example.com

Bob Lee, bob@example.com
Cara Diaz, cara@example.com, React Developer, Acme
7, Dev Rao, dev@example.com, Node.js Developer, Beta Labs`);
  assert.equal(recs.length, 4);
  assert.deepEqual(recs[0], { sno: '', name: '', email: 'a@example.com', title: '', company: '' });
  assert.equal(recs[1].name, 'Bob Lee');
  assert.deepEqual(recs[2], { sno: '', name: 'Cara Diaz', email: 'cara@example.com', title: 'React Developer', company: 'Acme' });
  assert.deepEqual(recs[3], { sno: '7', name: 'Dev Rao', email: 'dev@example.com', title: 'Node.js Developer', company: 'Beta Labs' });
});

test('manual text: tab-separated spreadsheet copy with header (company may contain commas)', () => {
  const recs = parseManualText('Company\tEmail\tName\tPosition\nAcme, Inc.\thr@acme.example.com\tSam\tDev');
  assert.deepEqual(recs, [{ sno: '', name: 'Sam', email: 'hr@acme.example.com', title: 'Dev', company: 'Acme, Inc.' }]);
});

test('manual import: duplicates detected, empty input rejected', async () => {
  const entry = { records: [{ name: 'Manual Person', email: 'Manual.Person@Example.com', title: 'Dev', company: 'Solo' }] };
  const first = await importManual(entry);
  assert.equal(first.inserted, 1);
  const again = await importManual({ text: 'Manual Person, manual.person@example.com, Dev, Solo' });
  assert.equal(again.inserted, 0);
  assert.equal(again.duplicates, 1);
  await assert.rejects(() => importManual({ text: 'no emails here' }), /No email addresses/);
  const typo = await importManual({ text: 'Typo Person, typo@company' });
  assert.equal(typo.inserted, 1);
  assert.equal(typo.invalid, 1); // kept and flagged, not silently dropped
});

test('email-only rows get the generic template; rows with title or company get the main one', () => {
  assert.equal(templateKindFor({ email: 'a@example.com' }), 'generic');
  assert.equal(templateKindFor({ email: 'a@example.com', name: 'Asha' }), 'generic'); // name alone is not enough
  assert.equal(templateKindFor({ email: 'a@example.com', company: 'Acme' }), 'main');
  assert.equal(templateKindFor({ email: 'a@example.com', title: 'Dev' }), 'main');
  assert.equal(templateFor({ email: 'a@example.com' }).kind, 'generic');
  assert.equal(templateFor({ email: 'a@example.com', company: 'Acme' }).kind, 'main');
});

test('generic default template renders cleanly with no data (no title/company warnings)', () => {
  const r = renderEmail(DEFAULT_GENERIC_TEMPLATE, { email: 'hr@example.com' }, sender);
  assert.match(r.text, /Best Regards,\nTest User\nFull-Stack Developer\n\+91 90000 00000/);
  assert.match(r.text, /^Dear Hiring Manager,/);
  assert.doesNotMatch(r.text, /your company|the open/);
  assert.deepEqual(r.warnings, ['Missing name; using "Hiring Manager"']);
});

test('main and generic templates are saved independently', () => {
  saveTemplate('generic', { subject: 'Generic S', body_html: '<p>G</p>' });
  assert.equal(getTemplate('generic').subject, 'Generic S');
  assert.notEqual(getTemplate('main').subject, 'Generic S');
});

test('dry-run: DRY_RUN is the default, the dashboard checkbox overrides it, DRY_RUN_LOCKED forces it', () => {
  assert.equal(getSendSettings().dryRun, true); // DRY_RUN=true in this test env
  setSetting('dryRun', false);
  assert.equal(getSendSettings().dryRun, false); // checkbox turned it off
  configMod.sending.dryRunLocked = true;
  assert.equal(getSendSettings().dryRun, true); // lock wins
  assert.equal(getSendSettings().dryRunLockedByEnv, true);
  configMod.sending.dryRunLocked = false;
  setSetting('dryRun', true);
  assert.equal(getSendSettings().dryRun, true);
});
