/**
 * PDF extraction using pdfjs-dist (pure JS, works for multi-page text PDFs).
 * Scanned PDFs have no text layer -> we report `requiresOcr: true` so the UI can
 * offer OCR (see ocr.service.js).
 */
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { reconstructRows } from './tableReconstruction.js';
import { mapRows } from './columnMapper.service.js';

const MIN_CHARS_PER_PAGE = 20;

/** Reads all pages and returns positioned text fragments (y measured from top). */
export async function readPdfItems(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const loadingTask = getDocument({ data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 });
  const doc = await loadingTask.promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((it) => typeof it.str === 'string' && it.str.trim())
        .map((it) => ({
          str: it.str,
          x: it.transform[4],
          y: viewport.height - it.transform[5], // flip to top-down
          w: it.width,
          h: it.height || Math.abs(it.transform[3]) || 10,
        }));
      pages.push({ items });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy(); // releases the document and its worker
  }
  return pages;
}

export async function extractFromPdf(filePath) {
  const pages = await readPdfItems(filePath);
  const totalChars = pages.reduce((n, p) => n + p.items.reduce((m, i) => m + i.str.trim().length, 0), 0);

  if (!pages.length || totalChars < MIN_CHARS_PER_PAGE * pages.length) {
    return { records: [], requiresOcr: true, pages: pages.length, strategy: 'none' };
  }

  const rows = reconstructRows(pages);
  const { records, strategy, columns } = mapRows(rows);
  return { records, requiresOcr: records.length === 0, pages: pages.length, strategy, columns };
}
