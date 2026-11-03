import { tx } from '../../db/index.js';
import { HttpError, badRequest, id, str } from '../../lib/http.js';
import { examAccess } from '../exams/exam-access.js';
import { examsRepo } from '../exams/exams.repo.js';
import { MISTAKES, questionsRepo } from './questions.repo.js';

const MAX_QUESTIONS = 60;
const round = (n) => Math.round(n * 100) / 100;
const pct = (got, max) => (max ? Math.round((got / max) * 100) : null);

export const questionView = (q) => ({ id: q.id, label: q.label, topic: q.topic, maxMarks: q.max_marks });

const mistakesOf = (row) => Object.fromEntries(MISTAKES.map((m) => [m, row[m] || 0]));

function validQuestions(list) {
  if (!Array.isArray(list)) throw badRequest('Questions must be a list.');
  if (list.length > MAX_QUESTIONS) throw badRequest(`An exam can have at most ${MAX_QUESTIONS} questions.`);
  return list.map((q, i) => {
    const maxMarks = Number(q?.maxMarks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0 || maxMarks > 1000) throw badRequest(`Enter valid marks for question ${i + 1}.`);
    return {
      label: str(q.label || `Q${i + 1}`, 'Question label', { max: 40 }),
      topic: str(q.topic, 'Topic', { max: 60, optional: true }),
      maxMarks,
    };
  });
}

export function questionsService(db) {
  const repo = questionsRepo(db);
  const exams = examsRepo(db);
  const access = examAccess(db);

  return {
    MISTAKES,

    async replace(user, examId, body) {
      const exam = await access.visibleExam(user, id(examId));
      const list = validQuestions(body.questions);
      if (await repo.hasScores(exam)) throw new HttpError(409, 'Questions cannot change after marking by question has started.');
      const total = round(list.reduce((sum, q) => sum + q.maxMarks, 0));
      const { highest } = await exams.stats(exam);
      if (list.length && highest !== null && total < highest) {
        throw badRequest(`The questions add up to ${total}, below the highest mark already given (${highest}).`);
      }
      await tx(db, async () => {
        await repo.replace(exam, list);
        if (list.length) await repo.setExamTotal(exam, total);
      });
      return { total: list.length ? total : exam.max_marks };
    },

    // Validates a marker's per-question entries against the exam and returns the total.
    async checkScores(exam, scores) {
      const questions = await repo.forExam(exam);
      if (!Array.isArray(scores) || scores.length !== questions.length) throw badRequest('Enter marks for every question.');
      const byId = new Map(questions.map((q) => [q.id, q]));
      const clean = scores.map((s) => {
        const q = byId.get(Number(s?.questionId));
        if (!q) throw badRequest('Unknown question.');
        const marks = Number(s.marks);
        if (s.marks === '' || s.marks === null || !Number.isFinite(marks) || marks < 0 || marks > q.max_marks) {
          throw badRequest(`${q.label}: marks must be between 0 and ${q.max_marks}.`);
        }
        const mistake = s.mistake || null;
        if (mistake && !MISTAKES.includes(mistake)) throw badRequest('Unknown mistake type.');
        return { questionId: q.id, marks, mistake: marks >= q.max_marks ? null : mistake };
      });
      if (new Set(clean.map((s) => s.questionId)).size !== questions.length) throw badRequest('Enter marks for every question.');
      return { clean, total: round(clean.reduce((sum, s) => sum + s.marks, 0)) };
    },

    async saveScores(schoolId, submissionId, clean) {
      await repo.clearScores(schoolId, submissionId);
      for (const s of clean) await repo.addScore(schoolId, submissionId, s);
    },

    clearScores: (schoolId, submissionId) => repo.clearScores(schoolId, submissionId),

    async breakdown(exam, submissionId) {
      const [questions, scores] = await Promise.all([repo.forExam(exam), repo.scoresFor(exam.school_id, submissionId)]);
      const byQuestion = new Map(scores.map((s) => [s.question_id, s]));
      return questions.map((q) => ({
        ...questionView(q),
        marks: byQuestion.get(q.id)?.marks ?? null,
        mistake: byQuestion.get(q.id)?.mistake ?? null,
      }));
    },

    questions: async (exam) => (await repo.forExam(exam)).map(questionView),
    fullMarks: (exam) => repo.fullMarks(exam),

    async examInsights(user, examId) {
      const exam = await access.visibleExam(user, id(examId));
      const rows = await repo.examMap(exam);
      return {
        questions: rows.map((r) => ({
          id: r.id,
          label: r.label,
          topic: r.topic,
          maxMarks: r.max_marks,
          scored: r.scored,
          averagePct: r.scored ? pct(r.average, r.max_marks) : null,
          fullMarks: r.full_marks,
          mistakes: mistakesOf(r),
        })),
      };
    },

    async schoolInsights(user) {
      const [topics, watch] = await Promise.all([repo.schoolTopics(user.school_id), repo.watchlist(user.school_id)]);
      return {
        topics: topics.map((t) => ({
          topic: t.topic,
          subject: t.subject,
          className: t.class_name,
          masteryPct: pct(t.got, t.max),
          answers: t.answers,
          mistakes: mistakesOf(t),
        })),
        watchlist: watch.map((w) => ({ id: w.id, name: w.name, className: w.class_name, averagePct: Math.round(w.ratio * 100), exams: w.exams })),
      };
    },

    async skills(user) {
      return (await repo.studentSkills(user.school_id, user.id)).map((s) => ({
        topic: s.topic,
        subject: s.subject,
        masteryPct: pct(s.got, s.max),
        questions: s.questions,
      }));
    },
  };
}
