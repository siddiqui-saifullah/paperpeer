// Roll numbers are free text, so sort by any leading digits: 2 comes before 10.
const ROSTER_ORDER = `u.roll_no IS NULL, substring(u.roll_no from '^[0-9]+')::numeric NULLS LAST, u.roll_no, u.name`;

export const examsRepo = (db) => ({
  byId: (schoolId, examId) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name FROM exams e
       JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       WHERE e.school_id = ? AND e.id = ?`,
    ).get(schoolId, examId),

  listForStaff: (schoolId) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name,
         (SELECT count(*)::int FROM submissions s WHERE s.exam_id = e.id) AS submitted,
         (SELECT count(*)::int FROM submissions s WHERE s.exam_id = e.id AND s.marks IS NOT NULL) AS graded,
         (SELECT count(*)::int FROM users u WHERE u.school_id = e.school_id AND u.class_id = e.class_id AND u.active = 1) AS class_size,
         (SELECT avg(s.marks) / e.max_marks FROM submissions s WHERE s.exam_id = e.id) AS average_ratio
       FROM exams e JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       WHERE e.school_id = ? ORDER BY coalesce(e.exam_date, e.created_at::date::text) DESC, e.id DESC`,
    ).all(schoolId),

  listForStudent: (schoolId, studentId, classId) =>
    db.prepare(
      `SELECT e.*, c.name AS class_name, s.id AS submission_id, s.marks AS my_marks,
         (SELECT avg(x.marks) FROM submissions x WHERE x.exam_id = e.id) AS class_average
       FROM exams e
       JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       LEFT JOIN submissions s ON s.exam_id = e.id AND s.student_id = ?
       WHERE e.school_id = ? AND (e.class_id = ? OR s.id IS NOT NULL) AND e.status <> 'draft'
       ORDER BY coalesce(e.exam_date, e.created_at::date::text) DESC, e.id DESC`,
    ).all(studentId, schoolId, classId),

  classExists: async (schoolId, classId) => !!(await db.prepare('SELECT 1 FROM classes WHERE school_id = ? AND id = ?').get(schoolId, classId)),

  insert: async (schoolId, classId, userId, f) =>
    (await db.prepare(
      `INSERT INTO exams (school_id, class_id, title, subject, exam_date, max_marks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).get(schoolId, classId, f.title, f.subject, f.examDate, f.maxMarks, userId)).id,

  update: (exam, f) =>
    db.prepare(
      `UPDATE exams SET title = ?, subject = ?, exam_date = ?, max_marks = ?, status = ?,
         peer_sharing = ?, anonymous = ?, marks_released = ?
       WHERE school_id = ? AND id = ?`,
    ).run(f.title, f.subject, f.examDate, f.maxMarks, f.status, f.peerSharing, f.anonymous, f.marksReleased, exam.school_id, exam.id),

  delete: (exam) => db.prepare('DELETE FROM exams WHERE school_id = ? AND id = ?').run(exam.school_id, exam.id),

  stats: (exam) =>
    db.prepare(
      `SELECT count(marks)::int AS graded, avg(marks) AS average, max(marks) AS highest
       FROM submissions WHERE school_id = ? AND exam_id = ?`,
    ).get(exam.school_id, exam.id),

  hasSubmission: async (exam, studentId) =>
    !!(await db.prepare('SELECT 1 FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get(exam.school_id, exam.id, studentId)),

  roster: (exam) =>
    db.prepare(
      `SELECT u.id, u.name, u.roll_no, s.id AS submission_id, s.marks, s.is_model, s.hidden_from_peers, s.updated_at,
         (SELECT count(*)::int FROM files f WHERE f.submission_id = s.id) AS file_count
       FROM users u
       LEFT JOIN submissions s ON s.exam_id = ? AND s.student_id = u.id
       WHERE u.school_id = ? AND u.role = 'student'
         AND ((u.class_id = ? AND u.active = 1) OR s.id IS NOT NULL)
       ORDER BY ${ROSTER_ORDER}`,
    ).all(exam.id, exam.school_id, exam.class_id),

  submissionOf: (exam, studentId) =>
    db.prepare('SELECT * FROM submissions WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get(exam.school_id, exam.id, studentId),

  helpfulCount: async (submissionId) =>
    (await db.prepare('SELECT count(*)::int AS n FROM helpful_marks WHERE submission_id = ?').get(submissionId)).n,

  note: async (exam, studentId) =>
    (await db.prepare('SELECT body FROM notes WHERE school_id = ? AND exam_id = ? AND student_id = ?')
      .get(exam.school_id, exam.id, studentId))?.body || '',
});

export { ROSTER_ORDER };
