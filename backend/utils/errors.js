/** Application error type + Express error middleware. */
import multer from 'multer';
import logger from './logger.js';

export class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const notFound = (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    return res.status(413).json({ error: msg });
  }
  const status = err.status || 500;
  if (status >= 500) logger.error(err.stack || err.message);
  else logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message, details: err.details });
}
