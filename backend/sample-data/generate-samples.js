/**
 * Generates test files in sample-data/:
 *   recruiters.xlsx          – Excel version
 *   recruiters.xls           – legacy Excel version
 *   recruiters.pdf           – 2-page text PDF table (header repeated, one wrapped cell)
 *   recruiters-scanned.pdf   – image-only PDF (no text layer) to exercise OCR
 *
 * Data deliberately contains: duplicates, invalid emails, missing names/titles.
 * All addresses use example.com / example.org (reserved, undeliverable domains).
 *
 * Run: npm run samples
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { pdf as pdfToImg } from 'pdf-to-img';

const dir = path.dirname(fileURLToPath(import.meta.url));

export const HEADERS = ['SNo', 'Name', 'Email', 'Title', 'Company'];
const people = [
  ['Aarav Sharma', 'aarav.sharma@example.com', 'Full Stack Developer', 'Nimbus Labs'],
  ['Priya Patel', 'priya.patel@example.com', 'Node.js Developer', 'BrightPath Tech'],
  ['Rohan Mehta', 'rohan.mehta@example.org', 'React Developer', 'CloudNine Systems'],
  ['Sneha Iyer', 'sneha.iyer@example.com', 'Software Engineer', 'Quantum Leap Software'],
  ['', 'talent@example.com', 'Backend Engineer', 'Orbit Digital'], // missing name
  ['Vikram Rao', 'vikram.rao@example.com', 'MERN Stack Developer', 'Pixel Forge'],
  ['Ananya Gupta', 'ananya.gupta@example', 'Frontend Developer', 'Skyline Apps'], // invalid (no TLD)
  ['Karan Singh', 'karan.singh@example.com', 'Next.js Developer', 'Vertex Solutions'],
  ['Meera Nair', 'meera.nair@example.com', 'Full Stack Engineer', 'International Business Software Consulting Services Private Limited'], // wraps in PDF
  ['Arjun Das', 'arjun.das@example.com', '', 'Lumen Analytics'], // missing title
  ['Priya Patel', 'PRIYA.PATEL@example.com', 'Node.js Developer', 'BrightPath Tech'], // duplicate (case-insensitive)
  ['Divya Menon', 'divya.menon@example.com', 'JavaScript Developer', 'Coral Reef IT'],
  ['Rahul Verma', 'rahul.verma.example.com', 'Software Developer', 'Northstar Labs'], // invalid (no @)
  ['Isha Kapoor', 'isha.kapoor@example.com', 'API Developer', 'Helix Data'],
  ['Nikhil Joshi', 'nikhil.joshi@example.org', 'Full Stack Developer', 'Ember Works'],
  ['Pooja Reddy', 'pooja.reddy@example.com', 'Node.js Engineer', 'Granite Cloud'],
  ['Siddharth Jain', 'siddharth.jain@example.com', 'React Native Developer', 'Mosaic Mobile'],
  ['Aarav Sharma', 'aarav.sharma@example.com', 'Full Stack Developer', 'Nimbus Labs'], // exact duplicate
  ['Kavya Pillai', 'kavya.pillai@example.com', 'Software Engineer II', 'Tidal Systems'],
  ['Aditya Kulkarni', 'aditya.kulkarni@example.com', 'Senior Developer', 'Polar Bear Tech'],
  ['Neha Bhat', 'neha.bhat@example.com', 'Full Stack Developer', 'Saffron Soft'],
  ['Manish Thakur', 'manish.thakur@example.org', 'Backend Developer', 'Ironclad Security'],
  ['Ritika Sen', 'ritika.sen@example.com', 'Web Developer', 'Blue Lotus Media'],
  ['Aarav Sharma', 'aarav.sharma@example.com', 'Senior Full Stack Developer', 'Nimbus Labs'], // same person, different role => NOT a duplicate
  ['Tanvi Desai', 'tanvi.desai@example.com', 'Node.js Developer', 'Willow Health'],
];
export const ROWS = people.map((p, i) => [String(i + 1), ...p]);

// Expected outcome when importing either file into an empty database:
export const EXPECTED = { extracted: 25, duplicates: 2, invalid: 2, inserted: 23 };

function writeExcel() {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...ROWS]);
  ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 30 }, { wch: 26 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recruiters');
  XLSX.writeFile(wb, path.join(dir, 'recruiters.xlsx'));
  XLSX.writeFile(wb, path.join(dir, 'recruiters.xls'), { bookType: 'biff8' });
}

function writePdf(file) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const out = fs.createWriteStream(file);
    doc.pipe(out);
    const cols = [{ x: 36, w: 40 }, { x: 80, w: 120 }, { x: 205, w: 190 }, { x: 400, w: 160 }, { x: 565, w: 230 }];
    const bottom = doc.page.height - 50;
    let y;

    const header = (first) => {
      if (first) doc.font('Helvetica-Bold').fontSize(14).text('Recruiter Contact List', 36, 36);
      y = first ? 70 : 40;
      doc.font('Helvetica-Bold').fontSize(10);
      HEADERS.forEach((h, i) => doc.text(h, cols[i].x, y, { width: cols[i].w }));
      y += 18;
      doc.moveTo(36, y - 4).lineTo(795, y - 4).stroke();
      doc.font('Helvetica').fontSize(10);
    };

    header(true);
    ROWS.forEach((row, idx) => {
      // Force a page break after 14 rows so the sample is multi-page.
      if (idx === 14 || y > bottom) {
        doc.page.margins.bottom = 0; // allow the footer below the bottom margin without auto page-break
        doc.text(`Page ${doc.bufferedPageRange().count}`, 36, doc.page.height - 30, { lineBreak: false });
        doc.addPage();
        header(false);
      }
      const h = Math.max(...row.map((c, i) => doc.heightOfString(c || ' ', { width: cols[i].w })));
      row.forEach((c, i) => c && doc.text(c, cols[i].x, y, { width: cols[i].w }));
      y += h + 6;
    });
    doc.end();
    out.on('finish', resolve);
  });
}

/** Renders the text PDF to images and wraps them into an image-only PDF. */
async function writeScannedPdf(source, file) {
  const images = [];
  for await (const img of await pdfToImg(source, { scale: 2 })) images.push(img);
  await new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: false });
    const out = fs.createWriteStream(file);
    doc.pipe(out);
    for (const img of images) {
      doc.addPage();
      doc.image(img, 0, 0, { width: doc.page.width, height: doc.page.height });
    }
    doc.end();
    out.on('finish', resolve);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeExcel();
  const pdfFile = path.join(dir, 'recruiters.pdf');
  await writePdf(pdfFile);
  await writeScannedPdf(pdfFile, path.join(dir, 'recruiters-scanned.pdf'));
  console.log('Sample files written to', dir);
}
