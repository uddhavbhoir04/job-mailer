import { AppError } from '../utils/errors.js';
import { getTemplate, saveTemplate as saveTpl, resetTemplate as resetTpl, normalizeKind, templateKindFor } from '../models/template.model.js';
import { getRecruiter } from '../models/recruiter.model.js';
import { getSendSettings } from '../models/settings.model.js';
import { renderEmail, PLACEHOLDERS } from '../services/emailGeneration.service.js';
import { getResumeInfo } from '../services/resume.service.js';

const kindOr404 = (kind) => {
  const k = normalizeKind(kind);
  if (!k) throw new AppError(`Unknown template "${kind}" (use "main" or "generic")`, 404);
  return k;
};

/** GET /api/templates/:kind   (kind = main | generic; "default" = main) */
export const getTemplateCtl = (req, res) => res.json({ ...getTemplate(kindOr404(req.params.kind)), placeholders: PLACEHOLDERS });

/** PUT /api/templates/:kind { subject, body_html, body_text } */
export function saveTemplateCtl(req, res) {
  const kind = kindOr404(req.params.kind);
  const { subject, body_html: bodyHtml, body_text: bodyText } = req.body || {};
  if (!subject?.trim()) throw new AppError('Subject is required', 400);
  if (!bodyHtml?.trim()) throw new AppError('Email body is required', 400);
  if (subject.length > 300 || bodyHtml.length > 50000) throw new AppError('Template is too long', 400);
  res.json(saveTpl(kind, { subject: subject.trim(), body_html: bodyHtml, body_text: bodyText || '' }));
}

/** POST /api/templates/:kind/reset */
export const resetTemplateCtl = (req, res) => res.json(resetTpl(kindOr404(req.params.kind)));

const SAMPLES = {
  main: { sno: '1', name: 'Jane Doe', email: 'jane.doe@example.com', title: 'Full Stack Developer', company: 'Example Corp' },
  generic: { sno: '', name: '', email: 'hr@example.com', title: '', company: '' },
};

/**
 * POST /api/templates/preview { recruiterId?, template?, kind? }
 * - With recruiterId and no draft: uses the template that recruiter will actually get.
 * - With a draft template (editor): renders the draft.
 * - Without recruiterId: renders sample data matching `kind`.
 */
export function preview(req, res) {
  const { recruiterId, template: draft, kind: rawKind } = req.body || {};
  const recruiter = recruiterId ? getRecruiter(Number(recruiterId)) : SAMPLES[normalizeKind(rawKind) || 'main'];
  if (!recruiter) throw new AppError('Record not found', 404);

  const autoKind = templateKindFor(recruiter);
  const template = draft?.subject ? draft : getTemplate(autoKind);
  const settings = getSendSettings();
  const rendered = renderEmail(template, recruiter, settings);
  res.json({
    ...rendered,
    templateKind: draft?.subject ? normalizeKind(rawKind) || autoKind : autoKind,
    autoTemplateKind: autoKind, // the template this recruiter gets when sending
    to: recruiter.email,
    from: settings.senderName ? `${settings.senderName} <${settings.senderEmail || 'not-configured'}>` : settings.senderEmail,
    attachment: getResumeInfo()?.originalName || null,
  });
}
