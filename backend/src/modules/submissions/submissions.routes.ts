import express from 'express';
import { staffOnly, studentOnly, me } from '../../middleware/guards.js';
import { submissionsService } from './submissions.service.js';
import type { Db } from '../../types.js';
import type { FileStore } from '../../lib/storage.js';

export function submissionRoutes({ db, store }: { db: Db; store: FileStore }) {
  const router = express.Router();
  const service = submissionsService(db, store);

  router.post('/exams/:id/submission', ...studentOnly, async (req, res) => {
    const target = await service.examForStudentUpload(me(req), req.params.id);
    res.status(201).json(await service.addAnswers(target, await store.receive(req, res)));
  });
  router.post('/exams/:id/students/:studentId/submission', ...staffOnly, async (req, res) => {
    const target = await service.examForStaffUpload(me(req), req.params.id, req.params.studentId);
    res.status(201).json(await service.addAnswers(target, await store.receive(req, res)));
  });

  router.get('/submissions/:subId', ...staffOnly, async (req, res) => res.json(await service.forMarking(me(req), req.params.subId)));
  router.patch('/submissions/:subId', ...staffOnly, async (req, res) => {
    await service.grade(me(req), req.params.subId, req.body);
    res.json({ ok: true });
  });

  router.get('/exams/:id/peers', ...studentOnly, async (req, res) => res.json(await service.peers(me(req), req.params.id)));
  router.post('/submissions/:subId/helpful', ...studentOnly, async (req, res) => {
    res.json({ markedHelpful: await service.toggleHelpful(me(req), req.params.subId) });
  });
  router.put('/exams/:id/note', ...studentOnly, async (req, res) => {
    await service.saveNote(me(req), req.params.id, req.body);
    res.json({ ok: true });
  });

  return router;
}
