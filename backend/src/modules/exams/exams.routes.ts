import express from 'express';
import { requireUser, staffOnly, me } from '../../middleware/guards.js';
import { examsService } from './exams.service.js';
import type { Db } from '../../types.js';
import type { FileStore } from '../../lib/storage.js';

export function examRoutes({ db, store }: { db: Db; store: FileStore }) {
  const router = express.Router();
  const service = examsService(db, store);

  router.get('/exams', requireUser, async (req, res) => res.json({ exams: await service.list(me(req)) }));
  router.post('/exams', ...staffOnly, async (req, res) => res.status(201).json({ id: await service.create(me(req), req.body) }));
  router.get('/exams/:id', requireUser, async (req, res) => res.json(await service.detail(me(req), req.params.id)));
  router.patch('/exams/:id', ...staffOnly, async (req, res) => {
    await service.update(me(req), req.params.id, req.body);
    res.json({ ok: true });
  });
  router.delete('/exams/:id', ...staffOnly, async (req, res) => {
    await service.remove(me(req), req.params.id);
    res.json({ ok: true });
  });

  return router;
}
