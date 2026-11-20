import { AppError } from '../utils/errors.js';
import { importUploadedFile, importPendingWithOcr } from '../services/recordImport.service.js';

/** POST /api/upload/records  (multipart field "file") */
export async function uploadRecords(req, res) {
  if (!req.file) throw new AppError('No file uploaded (field name must be "file")', 400);
  const result = await importUploadedFile(req.file);
  res.json({
    ...result,
    message: result.requiresOcr
      ? 'This PDF has no readable text layer (probably scanned). Run OCR to extract it.'
      : `Imported ${result.inserted} new record(s); ${result.duplicates} duplicate(s) skipped; ${result.invalid} with invalid email.`,
  });
}

/** POST /api/upload/records/ocr */
export async function runOcr(req, res) {
  const result = await importPendingWithOcr();
  res.json({ ...result, message: `OCR imported ${result.inserted} record(s); ${result.duplicates} duplicate(s).` });
}
