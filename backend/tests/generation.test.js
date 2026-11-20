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
const { storeRecords } = await import('../services/recordImport.service.js');
const Recruiters = await import('../models/recruiter.model.js');
const { DEFAULT_TEMPLATE } = await import('../models/template.model.js');
const { classifyError } = await import('../services/gmail.service.js');
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
