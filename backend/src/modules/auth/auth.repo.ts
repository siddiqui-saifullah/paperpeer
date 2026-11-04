import type { Db } from '../../types.js';

export interface LoginRow {
  id: number;
  school_id: number;
  password_hash: string;
}

export const authRepo = (db: Db) => ({
  schoolCodeTaken: async (code: string) => !!(await db.prepare('SELECT 1 FROM schools WHERE code = ?').get(code)),

  insertSchool: async (name: string, code: string) =>
    (await db.prepare('INSERT INTO schools (name, code) VALUES (?, ?) RETURNING id').get<{ id: number }>(name, code))!.id,

  insertAdmin: async (schoolId: number, name: string, username: string, hash: string) =>
    (await db.prepare(`INSERT INTO users (school_id, role, name, username, password_hash) VALUES (?, 'admin', ?, ?, ?) RETURNING id`)
      .get<{ id: number }>(schoolId, name, username, hash))!.id,

  findForLogin: (code: string, username: string) =>
    db.prepare(
      `SELECT u.id, u.school_id, u.password_hash FROM users u
       JOIN schools s ON s.id = u.school_id
       WHERE s.code = ? AND u.username = ? AND u.active = 1`,
    ).get<LoginRow>(code, username),

  passwordHash: async (schoolId: number, userId: number) =>
    (await db.prepare('SELECT password_hash FROM users WHERE school_id = ? AND id = ?').get<{ password_hash: string }>(schoolId, userId))?.password_hash ?? '',

  setPassword: (schoolId: number, userId: number, hash: string) =>
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE school_id = ? AND id = ?')
      .run(hash, schoolId, userId),
});
