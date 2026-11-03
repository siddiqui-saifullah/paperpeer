import express from 'express';
import { staffOnly, studentOnly } from '../../middleware/guards.js';
import { questionsService } from './questions.service.js';

export function questionRoutes({ db }) {
  const router = express.Router();
  const service = questionsService(db);

  router.put('/exams/:id/questions', staffOnly, async (req, res) => res.json(await service.replace(req.user, req.params.id, req.body)));
  router.get('/exams/:id/insights', staffOnly, async (req, res) => res.json(await service.examInsights(req.user, req.params.id)));
  router.get('/insights', staffOnly, async (req, res) => res.json(await service.schoolInsights(req.user)));
  router.get('/me/skills', studentOnly, async (req, res) => res.json({ skills: await service.skills(req.user) }));

  return router;
}
