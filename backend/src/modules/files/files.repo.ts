import type { Db, ExamRow, FileKind, FileRow } from '../../types.js';
import type { StoredFile } from '../../lib/storage.js';
export const filesRepo = (db: Db) => ({
  byId: (schoolId: number, fileId: string) => db.prepare('SELECT * FROM files WHERE school_id = ? AND id = ?').get<FileRow>(schoolId, fileId),

  forExam: (exam: ExamRow, kind: FileKind) =>
    db.prepare('SELECT * FROM files WHERE school_id = ? AND exam_id = ? AND kind = ? ORDER BY created_at, id')
      .all<FileRow>(exam.school_id, exam.id, kind),

  allForExam: (exam: ExamRow) =>
    db.prepare('SELECT stored_name FROM files WHERE school_id = ? AND exam_id = ?').all<{ stored_name: string }>(exam.school_id, exam.id),

  forSubmission: (schoolId: number, submissionId: string) =>
    db.prepare('SELECT * FROM files WHERE school_id = ? AND submission_id = ? ORDER BY created_at, id')
      .all<FileRow>(schoolId, submissionId),

  async insertMany(schoolId: number, examId: number, submissionId: string | null, kind: FileKind, stored: StoredFile[]) {
    const insert = db.prepare(
      `INSERT INTO files (id, school_id, exam_id, submission_id, kind, stored_name, original_name, mime, size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const f of stored) {
      await insert.run(f.id, schoolId, examId, submissionId, kind, f.storedName, f.originalName, f.mime, f.size);
    }
  },

  delete: (schoolId: number, fileId: string) => db.prepare('DELETE FROM files WHERE school_id = ? AND id = ?').run(schoolId, fileId),

  submissionOwner: (schoolId: number, submissionId: string | null) =>
    db.prepare('SELECT student_id, hidden_from_peers FROM submissions WHERE school_id = ? AND id = ?')
      .get<{ student_id: number; hidden_from_peers: number }>(schoolId, submissionId),

  deleteSubmission: (schoolId: number, submissionId: string) =>
    db.prepare('DELETE FROM submissions WHERE school_id = ? AND id = ?').run(schoolId, submissionId),
});
