import type { Db, ExamRow, ExamStatus, SubmissionRow } from '../../types.js';
// Roll numbers are free text, so sort by any leading digits: 2 comes before 10.
/** listForStaff: an exam with hand-in and marking counts. */
export interface StaffExamRow extends ExamRow {
  submitted: number;
  graded: number;
  class_size: number;
  average_ratio: number | null;
}

/** listForStudent: an exam with this student's own submission. */
export interface StudentExamRow extends ExamRow {
  submission_id: string | null;
  my_marks: number | null;
  class_average: number | null;
}

export interface RosterRow {
  id: number;
  name: string;
  roll_no: string | null;
  submission_id: string | null;
  marks: number | null;
  is_model: number | null;
  hidden_from_peers: number | null;
  updated_at: Date | string | null;
  file_count: number;
}

export interface ExamFields {
  title: string;
  subject: string;
  maxMarks: number;
  examDate: string | null;
}

const ROSTER_ORDER = `u.roll_no IS NULL, substring(u.roll_no from '^[0-9]+')::numeric NULLS LAST, u.roll_no, u.name`;

export const examsRepo = (db: Db) => ({
  byId: (schoolId: number, examId: number) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name FROM exams e
       JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       WHERE e.school_id = ? AND e.id = ?`,
    ).get<ExamRow>(schoolId, examId),

  listForStaff: (schoolId: number) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name,
         (SELECT count(*)::int FROM submissions s WHERE s.exam_id = e.id) AS submitted,
         (SELECT count(*)::int FROM submissions s WHERE s.exam_id = e.id AND s.marks IS NOT NULL) AS graded,
         (SELECT count(*)::int FROM users u WHERE u.school_id = e.school_id AND u.class_id = e.class_id AND u.active = 1) AS class_size,
         (SELECT avg(s.marks) / e.max_marks FROM submissions s WHERE s.exam_id = e.id) AS average_ratio
       FROM exams e JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       WHERE e.school_id = ? ORDER BY coalesce(e.exam_date, e.created_at::date::text) DESC, e.id DESC`,
    ).all<StaffExamRow>(schoolId),

  listForStudent: (schoolId: number, studentId: number, classId: number | null) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name, s.id AS submission_id, s.marks AS my_marks,
         (SELECT avg(x.marks) FROM submissions x WHERE x.exam_id = e.id) AS class_average
       FROM exams e
       JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.school_id = ? AND (e.class_id = ? OR s.id IS NOT NULL) AND e.status <> 'draft'
       ORDER BY coalesce(e.exam_date, e.created_at::date::text) DESC, e.id DESC`,
    ).all<StudentExamRow>(studentId, schoolId, classId),

  classExists: async (schoolId: number, classId: number) => !!(await db.prepare('SELECT 1 FROM classes WHERE school_id = ? AND id = ?').get(schoolId, classId)),

  insert: async (schoolId: number, classId: number, userId: number, f: ExamFields) =>
    (await db.prepare(
      `INSERT INTO exams (school_id, class_id, title, subject, exam_date, max_marks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).get<{ id: number }>(schoolId, classId, f.title, f.subject, f.examDate, f.maxMarks, userId))!.id,

  update: (exam: ExamRow, f: ExamFields & { status: ExamStatus; peerSharing: number; anonymous: number; marksReleased: number }) =>
    db.prepare(
      `UPDATE exams SET title = ?, subject = ?, exam_date = ?, max_marks = ?, status = ?,
         peer_sharing = ?, anonymous = ?, marks_released = ?
       WHERE school_id = ? AND id = ?`,
    ).run(f.title, f.subject, f.examDate, f.maxMarks, f.status, f.peerSharing, f.anonymous, f.marksReleased, exam.school_id, exam.id),

  delete: (exam: ExamRow) => db.prepare('DELETE FROM exams WHERE school_id = ? AND id = ?').run(exam.school_id, exam.id),

  // An aggregate always returns exactly one row.
  stats: async (exam: ExamRow) =>
    (await db.prepare(
      `SELECT count(marks)::int AS graded, avg(marks) AS average, max(marks) AS highest
       FROM submissions WHERE school_id = ? AND exam_id = ?`,
    ).get<{ graded: number; average: number | null; highest: number | null }>(exam.school_id, exam.id))!,

  hasSubmission: async (exam: ExamRow, studentId: number) =>
    !!(await db.prepare('SELECT 1 FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get(exam.school_id, exam.id, studentId)),

  roster: (exam: ExamRow) =>
    db.prepare(
      `SELECT u.id, u.name, u.roll_no, s.id AS submission_id, s.marks, s.is_model, s.hidden_from_peers, s.updated_at,
         (SELECT count(*)::int FROM files f WHERE f.submission_id = s.id) AS file_count
       FROM users u
       LEFT JOIN submissions s ON s.exam_id = ? AND s.student_id = u.id
       WHERE u.school_id = ? AND u.role = 'student'
         AND ((u.class_id = ? AND u.active = 1) OR s.id IS NOT NULL)
       ORDER BY ${ROSTER_ORDER}`,
    ).all<RosterRow>(exam.id, exam.school_id, exam.class_id),

  submissionOf: (exam: ExamRow, studentId: number) =>
    db.prepare('SELECT * FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get<SubmissionRow>(exam.school_id, exam.id, studentId),

  helpfulCount: async (submissionId: string) =>
    (await db.prepare('SELECT count(*)::int AS n FROM helpful_marks WHERE submission_id = ?').get<{ n: number }>(submissionId))?.n ?? 0,

  note: async (exam: ExamRow, studentId: number) =>
    (await db.prepare('SELECT body FROM notes WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get<{ body: string }>(exam.school_id, exam.id, studentId))?.body || '',
});

export { ROSTER_ORDER };
