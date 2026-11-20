import { sendQueue } from '../services/sendQueue.service.js';

/** GET /api/campaigns/current – polled by the dashboard for progress */
export const current = (req, res) => res.json(sendQueue.snapshot());

/** POST /api/campaigns/pause */
export const pause = (req, res) => res.json(sendQueue.pause());

/** POST /api/campaigns/resume { campaignId? } */
export const resume = (req, res) => res.json(sendQueue.resume(req.body?.campaignId ? Number(req.body.campaignId) : undefined));

/** POST /api/campaigns/stop */
export const stop = (req, res) => res.json(sendQueue.stop());
