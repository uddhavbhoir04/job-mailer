import { AppError } from '../utils/errors.js';
import { getDefaultTemplate, saveDefaultTemplate, resetDefaultTemplate } from '../models/template.model.js';
import { getRecruiter } from '../models/recruiter.model.js';
import { getSendSettings } from '../models/settings.model.js';
import { renderEmail, PLACEHOLDERS } from '../services/emailGeneration.service.js';
import { getResumeInfo } from '../services/resume.service.js';

/** GET /api/templates/default */
export const getTemplate = (req, res) => res.json({ ...getDefaultTemplate(), placeholders: PLACEHOLDERS });

/** PUT /api/templates/default { subject, body_html, body_text } */
export function saveTemplate(req, res) {
  const { subject, body_html: bodyHtml, body_text: bodyText } = req.body || {};
  if (!subject?.trim()) throw new AppError('Subject is required', 400);
  if (!bodyHtml?.trim()) throw new AppError('Email body is required', 400);
  if (subject.length > 300 || bodyHtml.length > 50000) throw new AppError('Template is too long', 400);
  res.json(saveDefaultTemplate({ subject: subject.trim(), body_html: bodyHtml, body_text: bodyText || '' }));
}

/** POST /api/templates/reset */
export const resetTemplate = (req, res) => res.json(resetDefaultTemplate());

/**
 * POST /api/templates/preview { recruiterId?, template? }
 * Renders the saved (or an unsaved draft) template for a recruiter, or sample data.
 */
export function preview(req, res) {
  const template = req.body?.template?.subject ? req.body.template : getDefaultTemplate();
  const recruiter = req.body?.recruiterId
    ? getRecruiter(Number(req.body.recruiterId))
    : { sno: '1', name: 'Jane Doe', email: 'jane.doe@example.com', title: 'Full Stack Developer', company: 'Example Corp' };
  if (!recruiter) throw new AppError('Record not found', 404);
  const settings = getSendSettings();
  const rendered = renderEmail(template, recruiter, settings);
  res.json({
    ...rendered,
    to: recruiter.email,
    from: settings.senderName ? `${settings.senderName} <${settings.senderEmail || 'not-configured'}>` : settings.senderEmail,
    attachment: getResumeInfo()?.originalName || null,
  });
}
