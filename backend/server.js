/**
 * Job Application Email Automation – API server.
 * Binds to 127.0.0.1 by default: this is a personal tool, not a public service.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import config, { ROOT_DIR, publicConfig } from './config/index.js';
import { getDb, closeDb } from './config/db.js';
import api from './routes/index.js';
import { errorHandler, notFound } from './utils/errors.js';
import logger from './utils/logger.js';
import { releaseAllQueued } from './models/recruiter.model.js';
import { pauseOrphanedCampaigns } from './models/campaign.model.js';
import { getDefaultTemplate } from './models/template.model.js';
import { closeTransport } from './services/gmail.service.js';

// ---- Boot: DB + crash recovery ----
getDb();
getDefaultTemplate(); // seeds the default template on first run
const released = releaseAllQueued();
const paused = pauseOrphanedCampaigns();
if (released || paused) logger.warn(`Recovered from unclean shutdown: ${released} record(s) back to pending, ${paused} campaign(s) paused`);

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: '200kb' }));

app.use('/api', api);

// Serve the built frontend if present (npm run build in frontend/), so one process is enough.
const dist = path.resolve(ROOT_DIR, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, config.host, () => {
  const pc = publicConfig();
  logger.info(`API listening on http://${config.host}:${config.port}`);
  logger.info(`DRY_RUN=${pc.dryRun}  Gmail configured=${pc.smtpConfigured}${pc.gmailUser ? ` (${pc.gmailUser})` : ''}`);
});

function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    closeTransport();
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.stack || err}`));
