import { AppError } from '../utils/errors.js';
import { smtpConfigured } from '../config/index.js';
import { verifySmtp } from '../services/gmail.service.js';
import { sendQueue, sendToRecruiter } from '../services/sendQueue.service.js';
import { getDefaultTemplate } from '../models/template.model.js';
import { getSendSettings } from '../models/settings.model.js';
import { getRecruiter } from '../models/recruiter.model.js';
import { getResumeAttachment } from '../services/resume.service.js';

/** Every send endpoint requires an explicit { confirm: true } from the UI dialog. */
const requireConfirm = (body) => {
  if (body?.confirm !== true) throw new AppError('Sending requires explicit confirmation ({ "confirm": true })', 400);
};

/** GET /api/email/verify */
export async function verify(req, res) {
  res.json(await verifySmtp());
}

/** POST /api/email/send-one/:id { confirm, force? } */
export async function sendOne(req, res) {
  requireConfirm(req.body);
  if (sendQueue.isActive()) throw new AppError('A campaign is active; pause or stop it before sending individually', 409);
  const id = Number(req.params.id);
  if (!getRecruiter(id)) throw new AppError('Record not found', 404);

  const settings = getSendSettings();
  if (!settings.dryRun && !smtpConfigured()) throw new AppError('Gmail is not configured (backend/.env)', 400);
  getResumeAttachment();

  const force = req.body.force === true; // deliberate resend of an already-sent application
  const result = await sendToRecruiter(id, { dryRun: settings.dryRun, settings, template: getDefaultTemplate(), force });
  const status = result.status === 'sent' ? 200 : result.status === 'skipped' ? 409 : 502;
  res.status(status).json({ ...result, recruiter: getRecruiter(id) });
}

/** POST /api/email/send { confirm, recruiterIds } – starts a campaign */
export async function sendBulk(req, res) {
  requireConfirm(req.body);
  res.json(await sendQueue.start({ recruiterIds: req.body.recruiterIds }));
}
