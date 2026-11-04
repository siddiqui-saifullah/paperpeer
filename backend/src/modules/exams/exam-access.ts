import { notFound } from '../../lib/http.js';
import { isStaff } from '../../middleware/guards.js';
import { examsRepo } from './exams.repo.js';
import type { Db, ExamRow, SessionUser } from '../../types.js';

// The single answer to "may this user see this exam?". Every exam lookup goes
// through it. Students get a 404, not a 403, for drafts and other classes' exams.
export function examAccess(db: Db) {
  const repo = examsRepo(db);

  // A student who moved class keeps access to exams they already answered.
  const studentReaches = async (user: SessionUser, exam: ExamRow) =>
    exam.status !== 'draft' && (exam.class_id === user.class_id || (await repo.hasSubmission(exam, user.id)));

  return {
    studentReaches,
    async visibleExam(user: SessionUser, examId: number) {
      const exam = await repo.byId(user.school_id, examId);
      if (!exam) throw notFound();
      if (!isStaff(user) && !(await studentReaches(user, exam))) throw notFound();
      return exam;
    },
  };
}

export const peersOpen = (exam: ExamRow) => exam.status === 'review' && !!exam.peer_sharing;
