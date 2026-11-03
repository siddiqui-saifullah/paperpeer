import express from 'express';
import { adminOnly, requireUser, staffOnly } from '../../middleware/guards.js';
import { peopleService } from './people.service.js';

const userView = (u) => ({
  id: u.id,
  role: u.role,
  name: u.name,
  username: u.username,
  rollNo: u.roll_no,
  classId: u.class_id,
  className: u.class_name,
  active: !!u.active,
});

export function peopleRoutes({ db, session }) {
  const router = express.Router();
  const service = peopleService(db, session);

  router.get('/classes', requireUser, async (req, res) => res.json({ classes: await service.listClasses(req.user) }));
  router.post('/classes', staffOnly, async (req, res) => res.status(201).json(await service.addClass(req.user, req.body)));
  router.delete('/classes/:id', staffOnly, async (req, res) => {
    await service.deleteClass(req.user, req.params.id);
    res.json({ ok: true });
  });

  router.get('/users', staffOnly, async (req, res) => res.json({ users: (await service.listUsers(req.user)).map(userView) }));
  router.post('/students/bulk', staffOnly, async (req, res) => {
    res.status(201).json(await service.addStudents(req.user, req.body));
  });
  router.post('/teachers', adminOnly, async (req, res) => {
    res.status(201).json({ created: [await service.addTeacher(req.user, req.body)] });
  });
  router.post('/users/:id/reset-password', staffOnly, async (req, res) => {
    res.json({ created: [await service.resetPassword(req.user, req.params.id)] });
  });
  router.post('/users/:id/class', staffOnly, async (req, res) => {
    await service.moveToClass(req.user, req.params.id, req.body.classId);
    res.json({ ok: true });
  });
  router.post('/users/:id/active', staffOnly, async (req, res) => {
    await service.setActive(req.user, req.params.id, req.body.active);
    res.json({ ok: true });
  });

  return router;
}
