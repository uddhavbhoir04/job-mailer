/** Stores the single current resume PDF that is attached to every email. */
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { getSetting, setSetting, deleteSetting } from '../models/settings.model.js';

const RESUME_PATH = path.join(config.uploads.resumeDir, 'resume.pdf');

const safeName = (name) => path.basename(name).replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'Resume.pdf';

export function saveResume(buffer, originalName) {
  if (!buffer?.length) throw new AppError('Empty file', 400);
  if (buffer.length > config.uploads.maxResumeBytes) throw new AppError('Resume is too large', 413);
  // Check real content, not just the extension/mimetype the browser claims.
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new AppError('File is not a valid PDF', 415);

  fs.mkdirSync(config.uploads.resumeDir, { recursive: true });
  const tmp = `${RESUME_PATH}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, RESUME_PATH); // atomic replace of the previous resume
  const meta = { originalName: safeName(originalName), size: buffer.length, uploadedAt: new Date().toISOString() };
  setSetting('resume', meta);
  return meta;
}

export function getResumeInfo() {
  const meta = getSetting('resume');
  if (!meta || !fs.existsSync(RESUME_PATH)) return null;
  return meta;
}

export function deleteResume() {
  if (fs.existsSync(RESUME_PATH)) fs.unlinkSync(RESUME_PATH);
  deleteSetting('resume');
}

/** Nodemailer attachment object; throws if no resume uploaded. */
export function getResumeAttachment() {
  const meta = getResumeInfo();
  if (!meta) throw new AppError('Please upload your resume before sending', 400);
  return { filename: meta.originalName, path: RESUME_PATH, contentType: 'application/pdf' };
}

export const resumePath = () => RESUME_PATH;
