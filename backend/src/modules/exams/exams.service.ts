import { badRequest, bool, id, str } from '../../lib/http.js';
import { isStaff } from '../../middleware/guards.js';
import { filesRepo } from '../files/files.repo.js';
import { questionsService } from '../questions/questions.service.js';
import { examAccess } from './exam-access.js';
import { examsRepo } from './exams.repo.js';
import type { Body, Db, ExamRow, ExamStatus, FileRow, SessionUser } from '../../types.js';
import type { FileStore } from '../../lib/storage.js';

const STATUSES: ExamStatus[] = ['draft', 'collecting', 'review'];
const round = (n: number) => Math.round(n * 100) / 100;

const examView = (e: ExamRow) => ({
  id: e.id,
  title: e.title,
  subject: e.subject,
  classId: e.class_id,
  className: e.class_name,
  examDate: e.exam_date,
  maxMarks: e.max_marks,
  status: e.status,
  peerSharing: !!e.peer_sharing,
  anonymous: !!e.anonymous,
  marksReleased: !!e.marks_released,
});

export const fileView = (f: FileRow) => ({ id: f.id, name: f.original_name, mime: f.mime, size: f.size });
export type FileView = ReturnType<typeof fileView>;

function validFields(body: Body) {
  const title = str(body.title, 'Exam title', { max: 120 });
  const subject = str(body.subject, 'Subject', { max: 60 });
  const maxMarks = Number(body.maxMarks);
  if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 10000) throw badRequest('Enter valid total marks.');
  const examDate = body.examDate || null;
  if (examDate && !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) throw badRequest('Enter a valid exam date.');
  return { title, subject, maxMarks, examDate };
}

export function examsService(db: Db, store: FileStore) {
  const repo = examsRepo(db);
  const files = filesRepo(db);
  const access = examAccess(db);
  const questions = questionsService(db);

  const stats = async (exam: ExamRow) => {
    const row = await repo.stats(exam);
    return { graded: row.graded, average: row.average === null ? null : round(row.average), highest: row.highest };
  };

  const staffDetail = async (exam: ExamRow, paper: FileView[]) => ({
    role: 'staff' as const,
    exam: examView(exam),
    paper,
    solution: (await files.forExam(exam, 'solution')).map(fileView),
    stats: await stats(exam),
    questions: await questions.questions(exam),
    roster: (await repo.roster(exam)).map((r) => ({
      studentId: r.id,
      name: r.name,
      rollNo: r.roll_no,
      submission: r.submission_id
        ? {
            id: r.submission_id,
            marks: r.marks,
            isModel: !!r.is_model,
            hiddenFromPeers: !!r.hidden_from_peers,
            updatedAt: r.updated_at,
            fileCount: r.file_count,
          }
        : null,
    })),
  });

  const studentDetail = async (exam: ExamRow, paper: FileView[], user: SessionUser) => {
    const mine = await repo.submissionOf(exam, user.id);
    const released = !!exam.marks_released;
    return {
      role: 'student' as const,
      exam: examView(exam),
      paper,
      // Solutions stay hidden until uploads close, or the class could copy them.
      solution: exam.status === 'review' ? (await files.forExam(exam, 'solution')).map(fileView) : [],
      canUpload: exam.status === 'collecting',
      questionCount: (await questions.questions(exam)).length,
      submission: mine
        ? {
            id: mine.id,
            files: (await files.forSubmission(exam.school_id, mine.id)).map(fileView),
            isModel: !!mine.is_model,
            marks: released ? mine.marks : null,
            feedback: released ? mine.feedback : '',
            helpful: await repo.helpfulCount(mine.id),
            breakdown: released ? await questions.breakdown(exam, mine.id) : [],
          }
        : null,
      stats: released ? await stats(exam) : null,
      note: await repo.note(exam, user.id),
    };
  };

  return {
    async list(user: SessionUser) {
      if (isStaff(user)) {
        return (await repo.listForStaff(user.school_id)).map((e) => ({
          ...examView(e),
          submitted: e.submitted,
          graded: e.graded,
          classSize: e.class_size,
          averagePct: e.average_ratio === null ? null : Math.round(e.average_ratio * 100),
        }));
      }
      return (await repo.listForStudent(user.school_id, user.id, user.class_id)).map((e) => ({
        ...examView(e),
        submitted: !!e.submission_id,
        marks: e.marks_released ? e.my_marks : null,
        classAverage: e.marks_released && e.class_average !== null ? round(e.class_average) : null,
      }));
    },

    async create(user: SessionUser, body: Body) {
      const classId = id(body.classId);
      if (!(await repo.classExists(user.school_id, classId))) throw badRequest('Choose a class.');
      return repo.insert(user.school_id, classId, user.id, validFields(body));
    },

    async detail(user: SessionUser, examId: unknown) {
      const exam = await access.visibleExam(user, id(examId));
      const paper = (await files.forExam(exam, 'paper')).map(fileView);
      return isStaff(user) ? staffDetail(exam, paper) : studentDetail(exam, paper, user);
    },

    async update(user: SessionUser, examId: unknown, body: Body) {
      const exam = await access.visibleExam(user, id(examId));
      const fields = validFields({
        title: body.title ?? exam.title,
        subject: body.subject ?? exam.subject,
        examDate: body.examDate === undefined ? exam.exam_date : body.examDate,
        maxMarks: body.maxMarks ?? exam.max_marks,
      });
      const status = body.status ?? exam.status;
      if (!STATUSES.includes(status)) throw badRequest('Invalid status.');
      if (status !== 'draft' && !(await files.forExam(exam, 'paper')).length) {
        throw badRequest('Upload the question paper before publishing.');
      }
      const split = await questions.questions(exam);
      if (split.length && fields.maxMarks !== exam.max_marks) {
        throw badRequest('Total marks come from the questions. Change the questions instead.');
      }
      const { highest } = await repo.stats(exam);
      if (highest !== null && fields.maxMarks < highest) {
        throw badRequest(`Total marks cannot be below the highest mark already given (${highest}).`);
      }
      await repo.update(exam, {
        ...fields,
        status,
        peerSharing: body.peerSharing === undefined ? exam.peer_sharing : bool(body.peerSharing),
        anonymous: body.anonymous === undefined ? exam.anonymous : bool(body.anonymous),
        marksReleased: body.marksReleased === undefined ? exam.marks_released : bool(body.marksReleased),
      });
    },

    async remove(user: SessionUser, examId: unknown) {
      const exam = await access.visibleExam(user, id(examId));
      const stored = await files.allForExam(exam);
      await repo.delete(exam);
      await Promise.all(stored.map((f) => store.delete(exam.school_id, f.stored_name)));
    },
  };
}
