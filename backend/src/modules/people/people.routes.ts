import express from 'express';
import { adminOnly, requireUser, staffOnly, me } from '../../middleware/guards.js';
import { peopleService } from './people.service.js';
import type { Row } from '../../types.js';
import type { Db } from '../../types.js';
import type { SessionStore } from '../auth/session.js';

const userView = (u: Row) => ({
  id: u.id,
  role: u.role,
  name: u.name,
  username: u.username,
  rollNo: u.roll_no,
  classId: u.class_id,
  className: u.class_name,
  active: !!u.active,
});

export function peopleRoutes({ db, session }: { db: Db; session: SessionStore }) {
  const router = express.Router();
  const service = peopleService(db, session);

  router.get('/classes', requireUser, async (req, res) => res.json({ classes: await service.listClasses(me(req)) }));
  router.post('/classes', ...staffOnly, async (req, res) => res.status(201).json(await service.addClass(me(req), req.body)));
  router.delete('/classes/:id', ...staffOnly, async (req, res) => {
    await service.deleteClass(me(req), req.params.id);
    res.json({ ok: true });
  });

  router.get('/users', ...staffOnly, async (req, res) => res.json({ users: (await service.listUsers(me(req))).map(userView) }));
  router.post('/students/bulk', ...staffOnly, async (req, res) => {
    res.status(201).json(await service.addStudents(me(req), req.body));
  });
  router.post('/teachers', ...adminOnly, async (req, res) => {
    res.status(201).json({ created: [await service.addTeacher(me(req), req.body)] });
  });
  router.post('/users/:id/reset-password', ...staffOnly, async (req, res) => {
    res.json({ created: [await service.resetPassword(me(req), req.params.id)] });
  });
  router.post('/users/:id/class', ...staffOnly, async (req, res) => {
    await service.moveToClass(me(req), req.params.id, req.body.classId);
    res.json({ ok: true });
  });
  router.post('/users/:id/active', ...staffOnly, async (req, res) => {
    await service.setActive(me(req), req.params.id, req.body.active);
    res.json({ ok: true });
  });

  return router;
}
