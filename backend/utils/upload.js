/** Multer configurations: allow-listed types, size limits, random file names. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import config from '../config/index.js';
import { AppError } from './errors.js';

fs.mkdirSync(config.uploads.dataDir, { recursive: true });
fs.mkdirSync(config.uploads.resumeDir, { recursive: true });

const DATA_EXT = new Set(['.pdf', '.xlsx', '.xls', '.csv']);

const storage = multer.diskStorage({
  destination: config.uploads.dataDir,
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
});

export const dataUpload = multer({
  storage,
  limits: { fileSize: config.uploads.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!DATA_EXT.has(ext)) return cb(new AppError('Only PDF, XLSX, XLS or CSV files are allowed', 415));
    cb(null, true);
  },
});

/** Resume is kept in memory first so we can verify the PDF magic bytes before saving. */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxResumeBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf' || !/pdf/i.test(file.mimetype)) return cb(new AppError('Resume must be a PDF file', 415));
    cb(null, true);
  },
});
