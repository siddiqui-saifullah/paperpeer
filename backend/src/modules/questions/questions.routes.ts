import express from 'express';
import { staffOnly, studentOnly, me } from '../../middleware/guards.js';
import { questionsService } from './questions.service.js';
import type { Db } from '../../types.js';

export function questionRoutes({ db }: { db: Db }) {
  const router = express.Router();
  const service = questionsService(db);

  router.put('/exams/:id/questions', ...staffOnly, async (req, res) => res.json(await service.replace(me(req), req.params.id, req.body)));
  router.get('/exams/:id/insights', ...staffOnly, async (req, res) => res.json(await service.examInsights(me(req), req.params.id)));
  router.get('/insights', ...staffOnly, async (req, res) => res.json(await service.schoolInsights(me(req))));
  router.get('/me/skills', ...studentOnly, async (req, res) => res.json({ skills: await service.skills(me(req)) }));

  return router;
}
