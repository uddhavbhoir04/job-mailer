/**
 * Rebuilds table rows from positioned text fragments.
 * Used for both native PDF text (pdfjs) and OCR words (tesseract), so both
 * produce the same 2-D array that columnMapper understands.
 *
 * Input: pages = [{ items: [{ str, x, y, w, h }] }]   (y grows downward)
 */
import { scoreHeaderRow, EMAIL_REGEX, cleanCell } from './columnMapper.service.js';

const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Groups fragments into visual lines by y-coordinate. */
function groupLines(items) {
  const tol = Math.max(2, median(items.map((i) => i.h || 0)) * 0.5);
  const sorted = items.filter((i) => cleanCell(i.str)).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - it.y) <= tol) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

/** Splits a line into cells wherever the horizontal gap between fragments is large. */
function splitByGaps(line) {
  const charW = median(line.items.map((i) => (i.w && i.str.length ? i.w / i.str.length : 5))) || 5;
  const cells = [];
  let cur = null;
  for (const it of line.items) {
    if (cur && it.x - cur.end <= charW * 1.5) {
      cur.text += (it.x - cur.end > charW * 0.25 ? ' ' : '') + it.str;
      cur.end = it.x + (it.w || it.str.length * charW);
    } else {
      cur = { x: it.x, text: it.str, end: it.x + (it.w || it.str.length * charW) };
      cells.push(cur);
    }
  }
  return cells.map((c) => ({ x: c.x, text: cleanCell(c.text) }));
}

/** Assigns each cell to the column whose start x is the closest to the left of it. */
function assignToColumns(cells, colStarts) {
  const out = new Array(colStarts.length).fill('');
  const slack = 4;
  for (const cell of cells) {
    let idx = 0;
    for (let i = 0; i < colStarts.length; i++) if (cell.x + slack >= colStarts[i]) idx = i;
    out[idx] = out[idx] ? `${out[idx]} ${cell.text}` : cell.text;
  }
  return out;
}

export function reconstructRows(pages) {
  const rows = [];
  let header = null; // { cells: string[], colStarts: number[] }
  let headerEmitted = false;

  for (const page of pages) {
    const lines = groupLines(page.items);
    const lineH = median(lines.slice(1).map((l, i) => l.y - lines[i].y)) || 12;
    let prev = null; // previous data line on this page: { y, row }

    for (const line of lines) {
      const cells = splitByGaps(line);
      const texts = cells.map((c) => c.text);

      // A (repeated) header line defines the column layout for this page.
      if (scoreHeaderRow(texts).score >= 2 && !texts.some((t) => EMAIL_REGEX.test(t))) {
        header = { cells: texts, colStarts: cells.map((c) => c.x) };
        if (!headerEmitted) {
          rows.push(texts);
          headerEmitted = true;
        }
        prev = null;
        continue;
      }

      if (!header) {
        rows.push(texts); // no layout yet: let columnMapper try positional/regex fallback
        continue;
      }

      const row = assignToColumns(cells, header.colStarts);
      const hasEmail = row.some((t) => EMAIL_REGEX.test(t));
      const startsWithSno = /^\d+\.?$/.test(row[0]);
      const isWrapped = prev && !hasEmail && !startsWithSno && line.y - prev.y <= lineH * 1.6;

      if (isWrapped) {
        // Text that wrapped onto a second line inside a cell: merge into previous row.
        row.forEach((t, i) => {
          if (t) prev.row[i] = prev.row[i] ? `${prev.row[i]} ${t}` : t;
        });
        prev.y = line.y;
        continue;
      }
      rows.push(row);
      prev = { y: line.y, row };
    }
  }
  return rows;
}
