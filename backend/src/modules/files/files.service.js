import { tx } from '../../db/index.js';
import { badRequest, forbidden, id, notFound } from '../../lib/http.js';
import { isStaff } from '../../middleware/guards.js';
import { examAccess } from '../exams/exam-access.js';
import { examsRepo } from '../exams/exams.repo.js';
import { filesRepo } from './files.repo.js';

export function filesService(db, store) {
  const repo = filesRepo(db);
  const exams = examsRepo(db);
  const access = examAccess(db);

  const canRead = async (user, file, exam) => {
    if (isStaff(user)) return true;
    if (!(await access.studentReaches(user, exam))) return false;
    if (file.kind === 'paper') return true;
    if (file.kind === 'solution') return exam.status === 'review';
    const owner = await repo.submissionOwner(file.school_id, file.submission_id);
    if (owner.student_id === user.id) return true;
    return exam.status === 'review' && !!exam.peer_sharing && !owner.hidden_from_peers;
  };

  const findFile = async (user, fileId) => {
    const file = await repo.byId(user.school_id, fileId);
    if (!file) throw notFound();
    return { file, exam: await exams.byId(user.school_id, file.exam_id) };
  };

  return {
    // Checks the exam before anything is read from the request, so a rejected
    // caller's upload never reaches the disk.
    async examForUpload(user, examId, kind) {
      if (kind !== 'paper' && kind !== 'solution') throw badRequest('Invalid file type.');
      return access.visibleExam(user, id(examId));
    },

    async addExamFiles(exam, kind, uploads) {
      const stored = await store.accept(exam.school_id, uploads);
      await repo.insertMany(exam.school_id, exam.id, null, kind, stored);
      return stored.length;
    },

    async readable(user, fileId) {
      const { file, exam } = await findFile(user, fileId);
      if (!(await canRead(user, file, exam))) throw notFound();
      // Peers never get the original name: "Riya_Sharma_maths.pdf" would undo anonymity.
      let filename = file.original_name;
      if (file.kind === 'answer' && !isStaff(user)) {
        const owner = await repo.submissionOwner(file.school_id, file.submission_id);
        if (owner.student_id !== user.id) filename = `answer${file.stored_name.slice(file.stored_name.lastIndexOf('.'))}`;
      }
      return { file, filename };
    },

    async remove(user, fileId) {
      const { file, exam } = await findFile(user, fileId);
      if (!isStaff(user)) {
        if (file.kind !== 'answer' || !(await canRead(user, file, exam))) throw notFound();
        const owner = await repo.submissionOwner(file.school_id, file.submission_id);
        if (owner.student_id !== user.id) throw notFound();
        if (exam.status !== 'collecting') throw forbidden('Uploads are closed for this exam.');
      }
      await tx(db, async () => {
        await repo.delete(file.school_id, file.id);
        // An answer with no pages left is no answer.
        if (file.submission_id && !(await repo.forSubmission(file.school_id, file.submission_id)).length) {
          await repo.deleteSubmission(file.school_id, file.submission_id);
        }
      });
      await store.delete(file.school_id, file.stored_name);
    },
  };
}
