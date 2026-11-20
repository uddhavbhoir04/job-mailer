/**
 * Excel extraction (.xlsx, .xls, .csv) with SheetJS. Independent of PDF parsing.
 * Picks the first sheet that yields records; header row is auto-detected.
 */
import XLSX from 'xlsx';
import { mapRows } from './columnMapper.service.js';

export function extractFromExcel(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false, blankrows: false });
    if (rows.length < 1) continue;
    const result = mapRows(rows);
    if (result.records.length) return { ...result, sheet: sheetName, requiresOcr: false };
  }
  return { records: [], strategy: 'none', sheet: null, requiresOcr: false };
}
