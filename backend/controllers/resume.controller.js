import { AppError } from '../utils/errors.js';
import { saveResume, getResumeInfo, deleteResume, resumePath } from '../services/resume.service.js';

/** POST /api/resume (multipart field "resume") – uploads or replaces */
export function upload(req, res) {
  if (!req.file) throw new AppError('No file uploaded (field name must be "resume")', 400);
  res.json(saveResume(req.file.buffer, req.file.originalname));
}

/** GET /api/resume */
export const info = (req, res) => res.json(getResumeInfo());

/** GET /api/resume/file – lets the user open the stored PDF to double-check it */
export function file(req, res) {
  const meta = getResumeInfo();
  if (!meta) throw new AppError('No resume uploaded', 404);
  res.type('application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${meta.originalName}"`);
  res.sendFile(resumePath());
}

/** DELETE /api/resume */
export function remove(req, res) {
  deleteResume();
  res.json({ deleted: true });
}
