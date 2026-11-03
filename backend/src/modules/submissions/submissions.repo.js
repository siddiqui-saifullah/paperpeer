import { ROSTER_ORDER } from '../exams/exams.repo.js';

export const submissionsRepo = (db) => ({
  byId: (schoolId, id) => db.prepare('SELECT * FROM submissions WHERE school_id = ? AND id = ?').get(schoolId, id),

  withStudent: (schoolId, id) =>
    db.prepare(
      `SELECT s.*, u.name AS student_name, u.roll_no FROM submissions s
       JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.school_id = ? AND s.id = ?`,
    ).get(schoolId, id),

  findForStudent: (exam, studentId) =>
    db.prepare('SELECT id FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get(exam.school_id, exam.id, studentId),

  // Two uploads at once (a second tab, a retry) must land in the same submission.
  upsert: async (id, exam, studentId) =>
    (await db.prepare(
      `INSERT INTO submissions (id, school_id, exam_id, student_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
    ).get(id, exam.school_id, exam.id, studentId)).id,

  grade: (sub, f) =>
    db.prepare('UPDATE submissions SET marks = ?, feedback = ?, is_model = ?, hidden_from_peers = ? WHERE school_id = ? AND id = ?')
      .run(f.marks, f.feedback, f.isModel, f.hiddenFromPeers, sub.school_id, sub.id),

  markingOrder: (examId) =>
    db.prepare(
      `SELECT s.id, s.marks FROM submissions s JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.exam_id = ? ORDER BY ${ROSTER_ORDER}`,
    ).all(examId),

  uploadableStudent: (exam, studentId) =>
    db.prepare(
      `SELECT u.id FROM users u WHERE u.school_id = ? AND u.id = ? AND u.role = 'student'
         AND (u.class_id = ? OR EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id = ? AND s.student_id = u.id))`,
    ).get(exam.school_id, studentId, exam.class_id, exam.id),

  peers: (exam, viewerId) =>
    db.prepare(
      `SELECT s.id, s.student_id, s.is_model, u.name,
         (SELECT count(*)::int FROM helpful_marks h WHERE h.submission_id = s.id) AS helpful,
         EXISTS (SELECT 1 FROM helpful_marks h WHERE h.submission_id = s.id AND h.student_id = ?) AS mine
       FROM submissions s JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.school_id = ? AND s.exam_id = ? AND s.hidden_from_peers = 0`,
    ).all(viewerId, exam.school_id, exam.id),

  removeHelpful: async (schoolId, submissionId, studentId) =>
    (await db.prepare('DELETE FROM helpful_marks WHERE school_id = ? AND submission_id = ? AND student_id = ?')
      .run(schoolId, submissionId, studentId)).changes,

  addHelpful: (schoolId, submissionId, studentId) =>
    db.prepare('INSERT INTO helpful_marks (school_id, submission_id, student_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(schoolId, submissionId, studentId),

  saveNote: (exam, studentId, body) =>
    db.prepare(
      `INSERT INTO notes (school_id, exam_id, student_id, body) VALUES (?, ?, ?, ?)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET body = excluded.body, updated_at = now()`,
    ).run(exam.school_id, exam.id, studentId, body),
});
