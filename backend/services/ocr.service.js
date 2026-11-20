/**
 * OCR fallback for scanned PDFs.
 * 1. pdf-to-img renders each page to PNG (pure JS, no poppler needed).
 * 2. tesseract.js recognizes words + bounding boxes (downloads 'eng' traineddata
 *    on first use, cached afterwards).
 * 3. Words are fed through the same table reconstruction as native PDFs.
 * Slow (several seconds per page) so it's only run when the user asks for it.
 */
import { pdf } from 'pdf-to-img';
import { createWorker } from 'tesseract.js';
import { reconstructRows } from './tableReconstruction.js';
import { mapRows } from './columnMapper.service.js';
import logger from '../utils/logger.js';

const MAX_OCR_PAGES = 30;

export async function extractWithOcr(filePath) {
  const worker = await createWorker('eng');
  const pages = [];
  try {
    const document = await pdf(filePath, { scale: 2.5 });
    let n = 0;
    for await (const image of document) {
      if (++n > MAX_OCR_PAGES) break;
      logger.info(`OCR page ${n}/${document.length}`);
      const { data } = await worker.recognize(image, {}, { blocks: true });
      const items = [];
      for (const block of data.blocks || [])
        for (const para of block.paragraphs || [])
          for (const line of para.lines || [])
            for (const word of line.words || []) {
              const { x0, y0, x1, y1 } = word.bbox;
              items.push({ str: word.text, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
            }
      pages.push({ items });
    }
  } finally {
    await worker.terminate();
  }
  const { records, strategy, columns } = mapRows(reconstructRows(pages));
  return { records, pages: pages.length, strategy: `ocr-${strategy}`, columns, requiresOcr: false };
}
