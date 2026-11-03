import express from 'express';
import { HttpError } from '../../lib/http.js';
import { rateLimiter } from '../../lib/rate-limit.js';
import { requireLogin } from '../../middleware/guards.js';
import { authService } from './auth.service.js';

const publicUser = (u) => ({
  id: u.id,
  role: u.role,
  name: u.name,
  username: u.username,
  classId: u.class_id,
  rollNo: u.roll_no,
  mustChangePassword: !!u.must_change_password,
  school: { name: u.school_name, code: u.school_code },
});

export function authRoutes({ db, session }) {
  const router = express.Router();
  const service = authService(db);
  const loginLimit = rateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  const signupLimit = rateLimiter({ limit: 20, windowMs: 60 * 60_000 });

  router.post('/schools', async (req, res) => {
    if (signupLimit.blocked(req.ip)) throw new HttpError(429, 'Too many attempts. Try again later.');
    signupLimit.hit(req.ip);
    await session.start(res, await service.registerSchool(req.body));
    res.status(201).json({ ok: true });
  });

  router.post('/login', async (req, res) => {
    const code = String(req.body.school || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '').slice(0, 128);
    const key = `${req.ip}|${code}|${username}`;
    if (loginLimit.blocked(key)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.');

    const user = await service.verifyLogin(code, username, password);
    if (!user) {
      loginLimit.hit(key);
      throw new HttpError(401, 'School code, username or password is incorrect.');
    }
    loginLimit.clear(key);
    await session.start(res, user);
    res.json({ ok: true });
  });

  router.post('/logout', async (req, res) => {
    await session.end(req, res);
    res.json({ ok: true });
  });

  router.get('/me', requireLogin, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  // requireLogin, not requireUser: this is the one action open to someone who
  // still has to replace a first password.
  router.post('/password', requireLogin, async (req, res) => {
    await service.changePassword(req.user, req.body);
    await session.revokeOthers(req, req.user);
    res.json({ ok: true });
  });

  return router;
}
