import type { Db } from '../../types.js';
export interface ClassRef {
  id: number;
  name: string;
}

export interface NewStudent {
  name: string;
  username: string;
  hash: string;
  classId: number;
  rollNo?: string | null;
}

export const peopleRepo = (db: Db) => ({
  listClasses: (schoolId: number) =>
    db.prepare(
      `SELECT c.id, c.name,
         (SELECT count(*)::int FROM users u WHERE u.school_id = c.school_id AND u.class_id = c.id AND u.active = 1) AS students
       FROM classes c WHERE c.school_id = ? ORDER BY c.name`,
    ).all(schoolId),

  classById: (schoolId: number, id: number) =>
    db.prepare('SELECT id, name FROM classes WHERE school_id = ? AND id = ?').get<ClassRef>(schoolId, id),

  classByName: (schoolId: number, name: string) =>
    db.prepare('SELECT id, name FROM classes WHERE school_id = ? AND lower(name) = lower(?)').get<ClassRef>(schoolId, name),

  insertClass: async (schoolId: number, name: string) =>
    (await db.prepare('INSERT INTO classes (school_id, name) VALUES (?, ?) RETURNING id').get<{ id: number }>(schoolId, name))!.id,

  classInUse: async (schoolId: number, id: number) =>
    !!(
      (await db.prepare('SELECT 1 FROM users WHERE school_id = ? AND class_id = ?').get(schoolId, id)) ||
      (await db.prepare('SELECT 1 FROM exams WHERE school_id = ? AND class_id = ?').get(schoolId, id))
    ),

  deleteClass: async (schoolId: number, id: number) => (await db.prepare('DELETE FROM classes WHERE school_id = ? AND id = ?').run(schoolId, id)).changes,

  listUsers: (schoolId: number) =>
    db.prepare(
      `SELECT u.*, c.name AS class_name FROM users u
       LEFT JOIN classes c ON c.school_id = u.school_id AND c.id = u.class_id
       WHERE u.school_id = ? ORDER BY u.active DESC, u.role, c.name, u.name`,
    ).all(schoolId),

  userById: (schoolId: number, id: number) => db.prepare('SELECT * FROM users WHERE school_id = ? AND id = ?').get(schoolId, id),

  usernameTaken: async (schoolId: number, username: string) =>
    !!(await db.prepare('SELECT 1 FROM users WHERE school_id = ? AND username = ?').get(schoolId, username)),

  insertStudent: (schoolId: number, s: NewStudent) =>
    db.prepare(
      `INSERT INTO users (school_id, role, name, username, password_hash, must_change_password, class_id, roll_no)
       VALUES (?, 'student', ?, ?, ?, 1, ?, ?)`,
    ).run(schoolId, s.name, s.username, s.hash, s.classId, s.rollNo || null),

  insertTeacher: (schoolId: number, name: string, username: string, hash: string) =>
    db.prepare(
      `INSERT INTO users (school_id, role, name, username, password_hash, must_change_password)
       VALUES (?, 'teacher', ?, ?, ?, 1)`,
    ).run(schoolId, name, username, hash),

  resetPassword: (schoolId: number, id: number, hash: string) =>
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE school_id = ? AND id = ?')
      .run(hash, schoolId, id),

  setClass: (schoolId: number, id: number, classId: number) =>
    db.prepare('UPDATE users SET class_id = ? WHERE school_id = ? AND id = ?').run(classId, schoolId, id),

  setActive: (schoolId: number, id: number, active: 0 | 1) =>
    db.prepare('UPDATE users SET active = ? WHERE school_id = ? AND id = ?').run(active, schoolId, id),
});
