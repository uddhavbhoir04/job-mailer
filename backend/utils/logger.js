/** Winston logger: console + rotating-size files in logs/. */
import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import config from '../config/index.js';

fs.mkdirSync(config.logDir, { recursive: true });

const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports: [
    new winston.transports.File({ filename: path.join(config.logDir, 'error.log'), level: 'error', maxsize: 5e6, maxFiles: 3 }),
    new winston.transports.File({ filename: path.join(config.logDir, 'app.log'), maxsize: 5e6, maxFiles: 3 }),
  ],
});

if (process.env.NODE_ENV !== 'test') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  );
}

export default logger;
