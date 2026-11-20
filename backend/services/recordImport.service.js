/**
 * Upload pipeline: extract (PDF / Excel / OCR) -> normalize -> validate -> dedupe -> store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractFromPdf } from './pdfExtraction.service.js';
import { extractFromExcel } from './excelExtraction.service.js';
import { extractWithOcr } from './ocr.service.js';
import { validateEmail } from './emailValidation.service.js';
import { isSuppressed } from './tracking.service.js';
import { insertRecruiters } from '../models/recruiter.model.js';
import { incrementSetting, setSetting, getSetting } from '../models/settings.model.js';
import { dedupeKey } from '../utils/hash.js';
import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function extractFile(filePath, { ocr = false } = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return ocr ? extractWithOcr(filePath) : extractFromPdf(filePath);
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return extractFromExcel(filePath);
  throw new AppError(`Unsupported file type: ${ext}`, 415);
}

/** Validates + dedupes extracted records and inserts them. */
export async function storeRecords(records, sourceFile) {
  const seen = new Set();
  const rows = [];
  const skipped = []; // rows with no email at all
  let duplicatesInFile = 0;
  let invalid = 0;

  for (const rec of records) {
    const { email, valid, error } = await validateEmail(rec.email);
    if (!email) {
      skipped.push({ ...rec, reason: 'Missing email' });
      continue;
    }
    const row = {
      sno: rec.sno || null,
      name: rec.name || '',
      email,
      title: rec.title || '',
      company: rec.company || '',
      is_valid_email: valid ? 1 : 0,
      validation_error: error,
      status: isSuppressed(email) ? 'unsubscribed' : 'pending',
      source_file: sourceFile,
    };
    row.dedupe_key = dedupeKey(row);
    if (seen.has(row.dedupe_key)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(row.dedupe_key);
    if (!valid) invalid++;
    rows.push(row);
  }

  const { inserted, duplicates: duplicatesInDb } = insertRecruiters(rows);
  const duplicates = duplicatesInFile + duplicatesInDb;
  if (duplicates) incrementSetting('duplicatesTotal', duplicates);
  return { extracted: records.length, inserted, duplicates, invalid, skipped };
}

/** Full flow for an uploaded file (multer file object). */
export async function importUploadedFile(file) {
  const started = Date.now();
  try {
    const result = await extractFile(file.path);
    if (result.requiresOcr && path.extname(file.path).toLowerCase() === '.pdf') {
      // Keep the file so the user can trigger OCR without re-uploading.
      const prev = getSetting('pendingOcrFile');
      if (prev?.path && prev.path !== file.path && fs.existsSync(prev.path)) fs.unlinkSync(prev.path);
      setSetting('pendingOcrFile', { path: file.path, originalName: file.originalname });
      return { requiresOcr: true, pages: result.pages, extracted: 0, inserted: 0, duplicates: 0, invalid: 0, skipped: [] };
    }
    const stored = await storeRecords(result.records, file.originalname);
    logger.info(`Imported ${file.originalname}: ${JSON.stringify({ ...stored, skipped: stored.skipped.length })} in ${Date.now() - started}ms`);
    fs.unlink(file.path, () => {});
    return { ...stored, requiresOcr: false, strategy: result.strategy, pages: result.pages, sheet: result.sheet };
  } catch (err) {
    fs.unlink(file.path, () => {});
    if (err instanceof AppError) throw err;
    logger.error(`Extraction failed for ${file.originalname}: ${err.stack}`);
    throw new AppError(`Could not read the file: ${err.message}`, 422);
  }
}

/** Runs OCR on the last PDF that had no text layer. */
export async function importPendingWithOcr() {
  const pending = getSetting('pendingOcrFile');
  if (!pending?.path || !fs.existsSync(pending.path)) throw new AppError('No scanned PDF waiting for OCR. Upload it again.', 404);
  try {
    const result = await extractFile(pending.path, { ocr: true });
    const stored = await storeRecords(result.records, pending.originalName);
    return { ...stored, requiresOcr: false, strategy: result.strategy, pages: result.pages };
  } finally {
    fs.unlink(pending.path, () => {});
    setSetting('pendingOcrFile', null);
  }
}
