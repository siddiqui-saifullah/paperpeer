export const filesRepo = (db) => ({
  byId: (schoolId, fileId) => db.prepare('SELECT * FROM files WHERE school_id = ? AND id = ?').get(schoolId, fileId),

  forExam: (exam, kind) =>
    db.prepare('SELECT * FROM files WHERE school_id = ? AND exam_id = ? AND kind = ? ORDER BY created_at, id')
      .all(exam.school_id, exam.id, kind),

  allForExam: (exam) =>
    db.prepare('SELECT stored_name FROM files WHERE school_id = ? AND exam_id = ?').all(exam.school_id, exam.id),

  forSubmission: (schoolId, submissionId) =>
    db.prepare('SELECT * FROM files WHERE school_id = ? AND submission_id = ? ORDER BY created_at, id')
      .all(schoolId, submissionId),

  async insertMany(schoolId, examId, submissionId, kind, stored) {
    const insert = db.prepare(
      `INSERT INTO files (id, school_id, exam_id, submission_id, kind, stored_name, original_name, mime, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const f of stored) {
      await insert.run(f.id, schoolId, examId, submissionId, kind, f.storedName, f.originalName, f.mime, f.size);
    }
  },

  delete: (schoolId, fileId) => db.prepare('DELETE FROM files WHERE school_id = ? AND id = ?').run(schoolId, fileId),

  submissionOwner: (schoolId, submissionId) =>
    db.prepare('SELECT student_id, hidden_from_peers FROM submissions WHERE school_id = ? AND id = ?').get(schoolId, submissionId),

  deleteSubmission: (schoolId, submissionId) =>
    db.prepare('DELETE FROM submissions WHERE school_id = ? AND id = ?').run(schoolId, submissionId),
});
