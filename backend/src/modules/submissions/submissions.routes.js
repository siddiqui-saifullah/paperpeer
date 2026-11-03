import express from 'express';
import { staffOnly, studentOnly } from '../../middleware/guards.js';
import { submissionsService } from './submissions.service.js';

export function submissionRoutes({ db, store }) {
  const router = express.Router();
  const service = submissionsService(db, store);

  router.post('/exams/:id/submission', studentOnly, async (req, res) => {
    const target = await service.examForStudentUpload(req.user, req.params.id);
    res.status(201).json(await service.addAnswers(target, await store.receive(req, res)));
  });
  router.post('/exams/:id/students/:studentId/submission', staffOnly, async (req, res) => {
    const target = await service.examForStaffUpload(req.user, req.params.id, req.params.studentId);
    res.status(201).json(await service.addAnswers(target, await store.receive(req, res)));
  });

  router.get('/submissions/:subId', staffOnly, async (req, res) => res.json(await service.forMarking(req.user, req.params.subId)));
  router.patch('/submissions/:subId', staffOnly, async (req, res) => {
    await service.grade(req.user, req.params.subId, req.body);
    res.json({ ok: true });
  });

  router.get('/exams/:id/peers', studentOnly, async (req, res) => res.json(await service.peers(req.user, req.params.id)));
  router.post('/submissions/:subId/helpful', studentOnly, async (req, res) => {
    res.json({ markedHelpful: await service.toggleHelpful(req.user, req.params.subId) });
  });
  router.put('/exams/:id/note', studentOnly, async (req, res) => {
    await service.saveNote(req.user, req.params.id, req.body);
    res.json({ ok: true });
  });

  return router;
}
