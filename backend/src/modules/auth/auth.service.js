import { tx } from '../../db/index.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/crypto.js';
import { HttpError, badRequest, str } from '../../lib/http.js';
import { authRepo } from './auth.repo.js';

const CODE_RE = /^[a-z0-9][a-z0-9-]{2,30}$/;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;

export function authService(db) {
  const repo = authRepo(db);

  return {
    async registerSchool(body) {
      const name = str(body.schoolName, 'School name', { max: 120 });
      const code = str(body.code, 'School code', { max: 31 }).toLowerCase();
      const adminName = str(body.adminName, 'Your name', { max: 100 });
      const username = str(body.username, 'Username', { max: 40 }).toLowerCase();
      const password = str(body.password, 'Password', { min: 8, max: 128 });
      if (!CODE_RE.test(code)) {
        throw badRequest('School code can only use lowercase letters, numbers and hyphens (3 to 31 characters).');
      }
      if (!USERNAME_RE.test(username)) throw badRequest('Username can only use letters, numbers, dots, dashes and underscores.');

      const hash = await hashPassword(password);
      return tx(db, async () => {
        if (await repo.schoolCodeTaken(code)) throw new HttpError(409, 'That school code is already taken.');
        const schoolId = await repo.insertSchool(name, code);
        return { id: await repo.insertAdmin(schoolId, adminName, username, hash), school_id: schoolId };
      });
    },

    // Returns the user, or null when the login is wrong.
    async verifyLogin(code, username, password) {
      const user = await repo.findForLogin(code, username);
      const valid = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
      return user && valid ? user : null;
    },

    async changePassword(user, body) {
      const next = str(body.newPassword, 'New password', { min: 8, max: 128 });
      const current = String(body.currentPassword || '').slice(0, 128);
      if (!(await verifyPassword(current, await repo.passwordHash(user.school_id, user.id)))) {
        throw badRequest('Current password is incorrect.');
      }
      if (next === body.currentPassword) throw badRequest('Choose a password different from the current one.');
      await repo.setPassword(user.school_id, user.id, await hashPassword(next));
    },
  };
}
