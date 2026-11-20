import { AppError } from '../utils/errors.js';
import * as Recruiters from '../models/recruiter.model.js';
import { validateEmail } from '../services/emailValidation.service.js';
import { addSuppression, removeSuppression, listSuppressions, isSuppressed } from '../services/tracking.service.js';
import { dedupeKey } from '../utils/hash.js';

const getOr404 = (id) => {
  const r = Recruiters.getRecruiter(Number(id));
  if (!r) throw new AppError('Record not found', 404);
  return r;
};

/** GET /api/recruiters?search=&status=&valid=&sort=&dir= */
export function list(req, res) {
  res.json(Recruiters.listRecruiters(req.query));
}

/** PATCH /api/recruiters/:id  – edit name/email/title/company/sno */
export async function update(req, res) {
  const current = getOr404(req.params.id);
  if (['sending', 'queued'].includes(current.status)) throw new AppError('Record is being sent; pause the campaign first', 409);
  if (current.status === 'sent') throw new AppError('This application was already sent and can no longer be edited', 409);

  const next = { ...current };
  for (const f of ['sno', 'name', 'title', 'company', 'email']) {
    if (req.body[f] !== undefined) next[f] = String(req.body[f]).trim().slice(0, 300);
  }
  const { email, valid, error } = await validateEmail(next.email);
  if (!email) throw new AppError('Email is required', 400);
  next.email = email;
  next.is_valid_email = valid ? 1 : 0;
  next.validation_error = error;
  next.dedupe_key = dedupeKey(next);

  const clash = Recruiters.findByDedupeKey(next.dedupe_key);
  if (clash && clash.id !== current.id) throw new AppError('Another record already has the same email, company and title', 409);
  if (isSuppressed(email)) next.status = 'unsubscribed';
  else if (current.status === 'unsubscribed') next.status = 'pending';

  res.json(Recruiters.updateRecruiter(current.id, next));
}

/** DELETE /api/recruiters/:id */
export function remove(req, res) {
  const r = getOr404(req.params.id);
  if (!Recruiters.deleteRecruiters([r.id])) throw new AppError('Record is being sent and cannot be deleted right now', 409);
  res.json({ deleted: 1 });
}

/** POST /api/recruiters/bulk-delete { ids: [] } */
export function bulkRemove(req, res) {
  const ids = (req.body.ids || []).map(Number).filter(Number.isInteger);
  if (!ids.length) throw new AppError('No ids provided', 400);
  res.json({ deleted: Recruiters.deleteRecruiters(ids) });
}

/** POST /api/recruiters/:id/unsubscribe – recipient asked not to be contacted */
export function unsubscribe(req, res) {
  const r = getOr404(req.params.id);
  addSuppression(r.email, req.body?.reason || 'unsubscribe');
  res.json(Recruiters.getRecruiter(r.id));
}

/** GET /api/suppressions */
export const suppressions = (req, res) => res.json(listSuppressions());

/** POST /api/suppressions { email, reason } */
export function addSuppressionCtl(req, res) {
  if (!req.body?.email) throw new AppError('email is required', 400);
  addSuppression(req.body.email, req.body.reason || 'manual');
  res.json(listSuppressions());
}

/** DELETE /api/suppressions/:email */
export function removeSuppressionCtl(req, res) {
  removeSuppression(req.params.email);
  res.json(listSuppressions());
}
