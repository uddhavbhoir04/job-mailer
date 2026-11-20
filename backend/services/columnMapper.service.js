/**
 * Column mapping shared by the PDF, OCR and Excel extractors.
 * Input: a 2-D array of cell strings (rows x columns).
 * Output: normalized records { sno, name, email, title, company }.
 */

export const FIELDS = ['sno', 'name', 'email', 'title', 'company'];

// Synonyms are compared after normalization (lowercase, alphanumerics only).
const SYNONYMS = {
  sno: ['sno', 'sn', 'srno', 'sr', 'serial', 'serialno', 'serialnumber', 'no', 'num', 'number', 'slno', 'id', 'index', ''],
  name: ['name', 'recruiter', 'recruitername', 'hrname', 'hr', 'contact', 'contactname', 'contactperson', 'fullname', 'person', 'recruitersname'],
  email: ['email', 'emailid', 'emailaddress', 'mail', 'mailid', 'emails', 'contactemail', 'recruiteremail', 'hremail', 'emailaddresses'],
  title: ['title', 'jobtitle', 'position', 'role', 'designation', 'jobrole', 'opening', 'job', 'jobposition', 'post', 'vacancy'],
  company: ['company', 'companyname', 'organization', 'organisation', 'org', 'employer', 'firm', 'client', 'compnay'],
};

export const EMAIL_REGEX = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const cleanCell = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Returns the field a header cell refers to, or null. '#' normalizes to '' => sno. */
export function matchHeader(cell) {
  const raw = cleanCell(cell);
  if (!raw) return null;
  const h = normHeader(raw);
  if (raw === '#' || h === '') return raw === '#' ? 'sno' : null;
  for (const field of FIELDS) if (SYNONYMS[field].includes(h)) return field;
  // Loose contains-match for headers like "Recruiter Email ID" or "Job Title (Role)"
  if (h.includes('email') || h.includes('mail')) return 'email';
  if (h.includes('company') || h.includes('organi')) return 'company';
  if (h.includes('title') || h.includes('position') || h.includes('designation') || h.includes('role')) return 'title';
  if (h.includes('name') || h.includes('recruiter')) return 'name';
  if (/^(s|sr|sl)?no$/.test(h)) return 'sno';
  return null;
}

/**
 * Scores a row as a header: number of distinct fields matched.
 * Returns { score, mapping } where mapping = { field: columnIndex }.
 */
export function scoreHeaderRow(row) {
  const mapping = {};
  // A row containing an email address is data, never a header.
  if (row.some((cell) => EMAIL_REGEX.test(String(cell ?? '')))) return { score: 0, mapping };
  row.forEach((cell, idx) => {
    const field = matchHeader(cell);
    if (field && mapping[field] === undefined) mapping[field] = idx;
  });
  return { score: Object.keys(mapping).length, mapping };
}

/** Finds the most likely header row within the first `scan` rows. */
export function detectHeaderRow(rows, scan = 10) {
  let best = { index: -1, score: 0, mapping: {} };
  rows.slice(0, scan).forEach((row, index) => {
    const { score, mapping } = scoreHeaderRow(row);
    if (score > best.score) best = { index, score, mapping };
  });
  // Require at least 2 recognized columns, one of which should be email.
  if (best.score >= 2 && (best.mapping.email !== undefined || best.score >= 3)) return best;
  return null;
}

const isBlankRow = (row) => row.every((c) => !cleanCell(c));

/**
 * Converts raw rows to records.
 * Strategy: header detection -> positional fallback (SNo,Name,Email,Title,Company) -> regex email.
 */
export function mapRows(rows) {
  const cleaned = rows.map((r) => (Array.isArray(r) ? r.map(cleanCell) : [])).filter((r) => !isBlankRow(r));
  const header = detectHeaderRow(cleaned);
  const records = [];
  let strategy;

  if (header) {
    strategy = 'header';
    const { mapping } = header;
    for (const row of cleaned.slice(header.index + 1)) {
      if (scoreHeaderRow(row).score >= 2) continue; // repeated header (e.g. every PDF page)
      const hasEmail = row.some((c) => EMAIL_REGEX.test(c));
      // Footers / page numbers / stray notes: no email and at most one filled cell.
      if (!hasEmail && row.filter(Boolean).length <= 1) continue;
      const rec = {};
      for (const f of FIELDS) rec[f] = mapping[f] !== undefined ? cleanCell(row[mapping[f]]) : '';
      // If the email column is empty, look for an email anywhere in the row (misaligned cells).
      if (!rec.email) rec.email = (row.join(' ').match(EMAIL_REGEX) || [''])[0];
      records.push(rec);
    }
  } else {
    strategy = 'positional';
    for (const row of cleaned) {
      const emailIdx = row.findIndex((c) => EMAIL_REGEX.test(c));
      if (emailIdx === -1) continue; // titles, footers, page numbers
      if (row.length >= 5 && emailIdx === 2) {
        records.push({ sno: row[0], name: row[1], email: row[2], title: row[3], company: row[4] });
      } else {
        // Regex fallback: email anchors the row, surrounding cells are best-effort.
        strategy = 'regex';
        const rest = row.filter((_, i) => i !== emailIdx);
        const hasSno = /^\d+\.?$/.test(rest[0] || '');
        const [sno, name, title, company] = hasSno ? rest : ['', ...rest];
        records.push({ sno: sno || '', name: name || '', email: row[emailIdx].match(EMAIL_REGEX)[0], title: title || '', company: company || '' });
      }
    }
  }

  // Drop rows that are completely empty after mapping.
  const nonEmpty = records.filter((r) => FIELDS.some((f) => r[f]));
  return { records: nonEmpty, strategy, headerRowIndex: header?.index ?? -1, columns: header?.mapping ?? null };
}
