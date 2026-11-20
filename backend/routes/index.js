/** All API routes. One router per resource, mounted under /api. */
import { Router } from 'express';
import { asyncHandler as h } from '../utils/errors.js';
import { dataUpload, resumeUpload } from '../utils/upload.js';
import * as upload from '../controllers/upload.controller.js';
import * as recruiters from '../controllers/recruiter.controller.js';
import * as templates from '../controllers/template.controller.js';
import * as resume from '../controllers/resume.controller.js';
import * as email from '../controllers/email.controller.js';
import * as campaigns from '../controllers/campaign.controller.js';
import * as stats from '../controllers/stats.controller.js';

const uploadRouter = Router()
  .post('/records', dataUpload.single('file'), h(upload.uploadRecords))
  .post('/records/ocr', h(upload.runOcr));

const recruiterRouter = Router()
  .get('/', h(recruiters.list))
  .post('/', h(recruiters.create))
  .post('/bulk-delete', h(recruiters.bulkRemove))
  .patch('/:id', h(recruiters.update))
  .delete('/:id', h(recruiters.remove))
  .post('/:id/unsubscribe', h(recruiters.unsubscribe));

const suppressionRouter = Router()
  .get('/', h(recruiters.suppressions))
  .post('/', h(recruiters.addSuppressionCtl))
  .delete('/:email', h(recruiters.removeSuppressionCtl));

const templateRouter = Router()
  .post('/preview', h(templates.preview))
  .post('/reset', h((req, res) => templates.resetTemplateCtl({ ...req, params: { kind: 'main' } }, res))) // legacy
  .get('/:kind', h(templates.getTemplateCtl)) // kind = main | generic | default
  .put('/:kind', h(templates.saveTemplateCtl))
  .post('/:kind/reset', h(templates.resetTemplateCtl));

const resumeRouter = Router()
  .get('/', h(resume.info))
  .get('/file', h(resume.file))
  .post('/', resumeUpload.single('resume'), h(resume.upload))
  .delete('/', h(resume.remove));

const emailRouter = Router()
  .get('/verify', h(email.verify))
  .post('/send-one/:id', h(email.sendOne))
  .post('/send', h(email.sendBulk));

const campaignRouter = Router()
  .get('/current', h(campaigns.current))
  .post('/pause', h(campaigns.pause))
  .post('/resume', h(campaigns.resume))
  .post('/stop', h(campaigns.stop));

const api = Router();
api.use('/upload', uploadRouter);
api.use('/recruiters', recruiterRouter);
api.use('/suppressions', suppressionRouter);
api.use('/templates', templateRouter);
api.use('/resume', resumeRouter);
api.use('/email', emailRouter);
api.use('/campaigns', campaignRouter);
api.get('/stats', h(stats.stats));
api.get('/history', h(stats.history));
api.get('/settings', h(stats.getSettings));
api.put('/settings', h(stats.updateSettings));
api.get('/health', (req, res) => res.json({ ok: true }));

export default api;
