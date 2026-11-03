export const authRepo = (db) => ({
  schoolCodeTaken: async (code) => !!(await db.prepare('SELECT 1 FROM schools WHERE code = ?').get(code)),

  insertSchool: async (name, code) =>
    (await db.prepare('INSERT INTO schools (name, code) VALUES (?, ?) RETURNING id').get(name, code)).id,

  insertAdmin: async (schoolId, name, username, hash) =>
    (await db.prepare(`INSERT INTO users (school_id, role, name, username, password_hash) VALUES (?, 'admin', ?, ?, ?) RETURNING id`)
      .get(schoolId, name, username, hash)).id,

  findForLogin: (code, username) =>
    db.prepare(
      `SELECT u.id, u.school_id, u.password_hash FROM users u
       JOIN schools s ON s.id = u.school_id
       WHERE s.code = ? AND u.username = ? AND u.active = 1`,
    ).get(code, username),

  passwordHash: async (schoolId, userId) =>
    (await db.prepare('SELECT password_hash FROM users WHERE school_id = ? AND id = ?').get(schoolId, userId)).password_hash,

  setPassword: (schoolId, userId, hash) =>
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE school_id = ? AND id = ?')
      .run(hash, schoolId, userId),
});
