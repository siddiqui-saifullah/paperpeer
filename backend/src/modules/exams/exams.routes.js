import express from 'express';
import { requireUser, staffOnly } from '../../middleware/guards.js';
import { examsService } from './exams.service.js';

export function examRoutes({ db, store }) {
  const router = express.Router();
  const service = examsService(db, store);

  router.get('/exams', requireUser, async (req, res) => res.json({ exams: await service.list(req.user) }));
  router.post('/exams', staffOnly, async (req, res) => res.status(201).json({ id: await service.create(req.user, req.body) }));
  router.get('/exams/:id', requireUser, async (req, res) => res.json(await service.detail(req.user, req.params.id)));
  router.patch('/exams/:id', staffOnly, async (req, res) => {
    await service.update(req.user, req.params.id, req.body);
    res.json({ ok: true });
  });
  router.delete('/exams/:id', staffOnly, async (req, res) => {
    await service.remove(req.user, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
