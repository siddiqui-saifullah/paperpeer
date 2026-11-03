import crypto from 'node:crypto';
import { tx } from '../../db/index.js';
import { randomId } from '../../lib/crypto.js';
import { HttpError, badRequest, bool, id, notFound, str } from '../../lib/http.js';
import { examAccess, peersOpen } from '../exams/exam-access.js';
import { examsRepo } from '../exams/exams.repo.js';
import { fileView } from '../exams/exams.service.js';
import { filesRepo } from '../files/files.repo.js';
import { questionsService } from '../questions/questions.service.js';
import { submissionsRepo } from './submissions.repo.js';

const MAX_FILES_PER_SUBMISSION = 40;

const examSummary = (e) => ({ id: e.id, title: e.title, className: e.class_name, maxMarks: e.max_marks });
const peerFileView = (f, i) => ({ id: f.id, name: `Page ${i + 1}`, mime: f.mime });

export function submissionsService(db, store) {
  const repo = submissionsRepo(db);
  const files = filesRepo(db);
  const exams = examsRepo(db);
  const access = examAccess(db);
  const questions = questionsService(db);

  const staffSubmission = async (user, subId) => {
    const sub = await repo.withStudent(user.school_id, subId);
    if (!sub) throw notFound();
    return sub;
  };

  // Peer Bridge: for each question this student lost marks on, the classmates'
  // answers that got that exact question fully right. Only with hidden names and
  // released marks, so it never reveals who scored what.
  async function bridges(exam, user, peers) {
    if (!exam.anonymous || !exam.marks_released) return [];
    const mine = await repo.findForStudent(exam, user.id);
    if (!mine) return [];
    const visible = new Map(peers.map((p) => [p.id, p.label]));
    const full = await questions.fullMarks(exam);
    return (await questions.breakdown(exam, mine.id))
      .filter((q) => q.marks !== null && q.marks < q.maxMarks)
      .map((q) => ({
        questionId: q.id,
        label: q.label,
        topic: q.topic,
        lost: Math.round((q.maxMarks - q.marks) * 100) / 100,
        mistake: q.mistake,
        peers: full
          .filter((f) => f.question_id === q.id && visible.has(f.submission_id))
          .slice(0, 3)
          .map((f) => ({ id: f.submission_id, label: visible.get(f.submission_id) })),
      }))
      .sort((a, b) => b.lost - a.lost);
  }

  return {
    async examForStudentUpload(user, examId) {
      const exam = await access.visibleExam(user, id(examId));
      if (exam.status !== 'collecting') throw new HttpError(409, 'Uploads are closed for this exam.');
      return { exam, studentId: user.id };
    },

    async examForStaffUpload(user, examId, studentId) {
      const exam = await access.visibleExam(user, id(examId));
      const student = await repo.uploadableStudent(exam, id(studentId));
      if (!student) throw notFound();
      return { exam, studentId: student.id };
    },

    async addAnswers({ exam, studentId }, uploads) {
      const existing = await repo.findForStudent(exam, studentId);
      const count = existing ? (await files.forSubmission(exam.school_id, existing.id)).length : 0;
      if (count + uploads.length > MAX_FILES_PER_SUBMISSION) {
        await store.discard(uploads);
        throw badRequest(`An answer can have at most ${MAX_FILES_PER_SUBMISSION} files.`);
      }
      const stored = await store.accept(exam.school_id, uploads);
      const submissionId = await tx(db, async () => {
        const subId = await repo.upsert(randomId(), exam, studentId);
        await files.insertMany(exam.school_id, exam.id, subId, 'answer', stored);
        return subId;
      });
      return { submissionId, files: stored.length };
    },

    async forMarking(user, subId) {
      const sub = await staffSubmission(user, subId);
      const exam = await exams.byId(sub.school_id, sub.exam_id);
      const order = await repo.markingOrder(exam.id);
      // Next unmarked answer after this one, wrapping round to any that were skipped.
      const position = order.findIndex((r) => r.id === sub.id);
      const next = [...order.slice(position + 1), ...order.slice(0, position)].find((r) => r.marks === null);
      return {
        exam: examSummary(exam),
        submission: {
          id: sub.id,
          studentId: sub.student_id,
          studentName: sub.student_name,
          rollNo: sub.roll_no,
          marks: sub.marks,
          feedback: sub.feedback,
          isModel: !!sub.is_model,
          hiddenFromPeers: !!sub.hidden_from_peers,
          files: (await files.forSubmission(sub.school_id, sub.id)).map(fileView),
          breakdown: await questions.breakdown(exam, sub.id),
        },
        mistakes: questions.MISTAKES,
        nextId: next?.id || null,
        total: order.length,
        marked: order.filter((r) => r.marks !== null).length,
      };
    },

    async grade(user, subId, body) {
      const sub = await staffSubmission(user, subId);
      const exam = await exams.byId(sub.school_id, sub.exam_id);
      let marks = sub.marks;
      let scores = null;
      if (body.scores !== undefined) {
        ({ clean: scores, total: marks } = await questions.checkScores(exam, body.scores));
      } else if (body.marks !== undefined) {
        if (body.marks === null || body.marks === '') {
          marks = null;
        } else {
          marks = Number(body.marks);
          if (!Number.isFinite(marks) || marks < 0 || marks > exam.max_marks) {
            throw badRequest(`Marks must be between 0 and ${exam.max_marks}.`);
          }
        }
      }
      const fields = {
        marks,
        feedback: body.feedback === undefined ? sub.feedback : str(body.feedback, 'Feedback', { max: 5000, optional: true }),
        isModel: body.isModel === undefined ? sub.is_model : bool(body.isModel),
        hiddenFromPeers: body.hiddenFromPeers === undefined ? sub.hidden_from_peers : bool(body.hiddenFromPeers),
      };
      await tx(db, async () => {
        await repo.grade(sub, fields);
        // A total typed straight in replaces any per-question breakdown, so the two never disagree.
        if (scores) await questions.saveScores(sub.school_id, sub.id, scores);
        else if (body.marks !== undefined) await questions.clearScores(sub.school_id, sub.id);
      });
    },

    async peers(user, examId) {
      const exam = await access.visibleExam(user, id(examId));
      if (!peersOpen(exam)) return { open: false, peers: [] };

      // Labels follow a hash of the random submission id, not roll or upload order,
      // so "Answer 3" says nothing about who wrote it and stays stable between views.
      const shuffled = (await repo.peers(exam, user.id))
        .map((r) => ({ ...r, sortKey: crypto.createHash('sha256').update(r.id).digest('hex') }))
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      const visible = shuffled
        .map((r, i) => ({ row: r, label: exam.anonymous ? `Answer ${i + 1}` : r.name }))
        .filter(({ row }) => row.student_id !== user.id)
        .sort((a, b) => b.row.is_model - a.row.is_model || b.row.helpful - a.row.helpful);

      const peers = await Promise.all(
        visible.map(async ({ row, label }) => ({
          id: row.id,
          label,
          isModel: !!row.is_model,
          helpful: row.helpful,
          markedHelpful: !!row.mine,
          files: (await files.forSubmission(exam.school_id, row.id)).map(peerFileView),
        })),
      );
      return { open: true, anonymous: !!exam.anonymous, peers, bridges: await bridges(exam, user, peers) };
    },

    async toggleHelpful(user, subId) {
      const sub = await repo.byId(user.school_id, subId);
      if (!sub) throw notFound();
      const exam = await access.visibleExam(user, sub.exam_id);
      if (!peersOpen(exam) || sub.hidden_from_peers || sub.student_id === user.id) throw notFound();
      const removed = await repo.removeHelpful(user.school_id, sub.id, user.id);
      if (!removed) await repo.addHelpful(user.school_id, sub.id, user.id);
      return !removed;
    },

    async saveNote(user, examId, body) {
      const exam = await access.visibleExam(user, id(examId));
      await repo.saveNote(exam, user.id, str(body.body, 'Note', { max: 5000, optional: true }));
    },
  };
}
