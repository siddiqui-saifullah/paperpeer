import { ROSTER_ORDER } from '../exams/exams.repo.js';
import type { Db, ExamRow, SubmissionRow } from '../../types.js';

export interface PeerRow {
  id: string;
  student_id: number;
  is_model: number;
  name: string;
  helpful: number;
  mine: boolean;
}

export const submissionsRepo = (db: Db) => ({
  byId: (schoolId: number, id: string) => db.prepare('SELECT * FROM submissions WHERE school_id = ? AND id = ?').get<SubmissionRow>(schoolId, id),

  withStudent: (schoolId: number, id: string) =>
    db.prepare(
      `SELECT s.*, u.name AS student_name, u.roll_no FROM submissions s
       JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.school_id = ? AND s.id = ?`,
    ).get<SubmissionRow & { student_name: string; roll_no: string | null }>(schoolId, id),

  findForStudent: (exam: ExamRow, studentId: number) =>
    db.prepare('SELECT id FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get<{ id: string }>(exam.school_id, exam.id, studentId),

  // Two uploads at once (a second tab, a retry) must land in the same submission.
  upsert: async (id: string, exam: ExamRow, studentId: number) =>
    (await db.prepare(
      `INSERT INTO submissions (id, school_id, exam_id, student_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
    ).get<{ id: string }>(id, exam.school_id, exam.id, studentId))!.id,

  grade: (sub: SubmissionRow, f: { marks: number | null; feedback: string; isModel: number; hiddenFromPeers: number }) =>
    db.prepare('UPDATE submissions SET marks = ?, feedback = ?, is_model = ?, hidden_from_peers = ? WHERE school_id = ? AND id = ?')
      .run(f.marks, f.feedback, f.isModel, f.hiddenFromPeers, sub.school_id, sub.id),

  markingOrder: (examId: number) =>
    db.prepare(
      `SELECT s.id, s.marks FROM submissions s JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.exam_id = ? ORDER BY ${ROSTER_ORDER}`,
    ).all<{ id: string; marks: number | null }>(examId),

  uploadableStudent: (exam: ExamRow, studentId: number) =>
    db.prepare(
      `SELECT u.id FROM users u WHERE u.school_id = ? AND u.id = ? AND u.role = 'student'
         AND (u.class_id = ? OR EXISTS (SELECT 1 FROM submissions s WHERE s.exam_id = ? AND s.student_id = u.id))`,
    ).get<{ id: number }>(exam.school_id, studentId, exam.class_id, exam.id),

  peers: (exam: ExamRow, viewerId: number) =>
    db.prepare(
      `SELECT s.id, s.student_id, s.is_model, u.name,
         (SELECT count(*)::int FROM helpful_marks h WHERE h.submission_id = s.id) AS helpful,
         EXISTS (SELECT 1 FROM helpful_marks h WHERE h.submission_id = s.id AND h.student_id = ?) AS mine
       FROM submissions s JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       WHERE s.school_id = ? AND s.exam_id = ? AND s.hidden_from_peers = 0`,
    ).all<PeerRow>(viewerId, exam.school_id, exam.id),

  removeHelpful: async (schoolId: number, submissionId: string, studentId: number) =>
    (await db.prepare('DELETE FROM helpful_marks WHERE school_id = ? AND submission_id = ? AND student_id = ?')
      .run(schoolId, submissionId, studentId)).changes,

  addHelpful: (schoolId: number, submissionId: string, studentId: number) =>
    db.prepare('INSERT INTO helpful_marks (school_id, submission_id, student_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .run(schoolId, submissionId, studentId),

  saveNote: (exam: ExamRow, studentId: number, body: string) =>
    db.prepare(
      `INSERT INTO notes (school_id, exam_id, student_id, body) VALUES (?, ?, ?, ?)
       ON CONFLICT (exam_id, student_id) DO UPDATE SET body = excluded.body, updated_at = now()`,
    ).run(exam.school_id, exam.id, studentId, body),
});
