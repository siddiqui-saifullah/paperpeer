export const peopleRepo = (db) => ({
  listClasses: (schoolId) =>
    db.prepare(
      `SELECT c.id, c.name,
         (SELECT count(*)::int FROM users u WHERE u.school_id = c.school_id AND u.class_id = c.id AND u.active = 1) AS students
       FROM classes c WHERE c.school_id = ? ORDER BY c.name`,
    ).all(schoolId),

  classById: (schoolId, id) => db.prepare('SELECT id, name FROM classes WHERE school_id = ? AND id = ?').get(schoolId, id),

  classByName: (schoolId, name) =>
    db.prepare('SELECT id, name FROM classes WHERE school_id = ? AND lower(name) = lower(?)').get(schoolId, name),

  insertClass: async (schoolId, name) =>
    (await db.prepare('INSERT INTO classes (school_id, name) VALUES (?, ?) RETURNING id').get(schoolId, name)).id,

  classInUse: async (schoolId, id) =>
    !!(
      (await db.prepare('SELECT 1 FROM users WHERE school_id = ? AND class_id = ?').get(schoolId, id)) ||
      (await db.prepare('SELECT 1 FROM exams WHERE school_id = ? AND class_id = ?').get(schoolId, id))
    ),

  deleteClass: async (schoolId, id) => (await db.prepare('DELETE FROM classes WHERE school_id = ? AND id = ?').run(schoolId, id)).changes,

  listUsers: (schoolId) =>
    db.prepare(
      `SELECT u.*, c.name AS class_name FROM users u
       LEFT JOIN classes c ON c.school_id = u.school_id AND c.id = u.class_id
       WHERE u.school_id = ? ORDER BY u.active DESC, u.role, c.name, u.name`,
    ).all(schoolId),

  userById: (schoolId, id) => db.prepare('SELECT * FROM users WHERE school_id = ? AND id = ?').get(schoolId, id),

  usernameTaken: async (schoolId, username) =>
    !!(await db.prepare('SELECT 1 FROM users WHERE school_id = ? AND username = ?').get(schoolId, username)),

  insertStudent: (schoolId, s) =>
    db.prepare(
      `INSERT INTO users (school_id, role, name, username, password_hash, must_change_password, class_id, roll_no)
       VALUES (?, 'student', ?, ?, ?, 1, ?, ?)`,
    ).run(schoolId, s.name, s.username, s.hash, s.classId, s.rollNo || null),

  insertTeacher: (schoolId, name, username, hash) =>
    db.prepare(
      `INSERT INTO users (school_id, role, name, username, password_hash, must_change_password)
       VALUES (?, 'teacher', ?, ?, ?, 1)`,
    ).run(schoolId, name, username, hash),

  resetPassword: (schoolId, id, hash) =>
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE school_id = ? AND id = ?')
      .run(hash, schoolId, id),

  setClass: (schoolId, id, classId) =>
    db.prepare('UPDATE users SET class_id = ? WHERE school_id = ? AND id = ?').run(classId, schoolId, id),

  setActive: (schoolId, id, active) =>
    db.prepare('UPDATE users SET active = ? WHERE school_id = ? AND id = ?').run(active, schoolId, id),
});
