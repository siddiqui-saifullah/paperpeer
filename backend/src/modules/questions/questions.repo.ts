import type { Db, ExamRow } from '../../types.js';
export const MISTAKES: readonly Mistake[] = ['concept', 'calculation', 'misread', 'incomplete', 'unattempted'];

// One count column per mistake kind, e.g. "count(*) FILTER (WHERE qs.mistake = 'concept')::int AS concept".
const mistakeCounts = MISTAKES.map((m) => `count(*) FILTER (WHERE qs.mistake = '${m}')::int AS ${m}`).join(',\n         ');

export type Mistake = 'concept' | 'calculation' | 'misread' | 'incomplete' | 'unattempted';

export interface QuestionInput {
  label: string;
  topic: string;
  maxMarks: number;
}

export interface ScoreInput {
  questionId: number;
  marks: number;
  mistake: Mistake | null;
}

export const questionsRepo = (db: Db) => ({
  forExam: (exam: ExamRow) =>
    db.prepare('SELECT * FROM questions WHERE school_id = ? AND exam_id = ? ORDER BY position')
      .all(exam.school_id, exam.id),

  hasScores: async (exam: ExamRow) =>
    !!(await db.prepare(
      `SELECT 1 FROM question_scores qs JOIN questions q ON q.school_id = qs.school_id AND q.id = qs.question_id
       WHERE q.school_id = ? AND q.exam_id = ? LIMIT 1`,
    ).get(exam.school_id, exam.id)),

  async replace(exam: ExamRow, list: QuestionInput[]) {
    await db.prepare('DELETE FROM questions WHERE school_id = ? AND exam_id = ?').run(exam.school_id, exam.id);
    for (const [i, q] of list.entries()) {
      await db.prepare('INSERT INTO questions (school_id, exam_id, position, label, topic, max_marks) VALUES (?, ?, ?, ?, ?, ?)')
        .run(exam.school_id, exam.id, i + 1, q.label, q.topic, q.maxMarks);
    }
  },

  setExamTotal: (exam: ExamRow, total: number) =>
    db.prepare('UPDATE exams SET max_marks = ? WHERE school_id = ? AND id = ?').run(total, exam.school_id, exam.id),

  scoresFor: (schoolId: number, submissionId: string) =>
    db.prepare('SELECT question_id, marks, mistake FROM question_scores WHERE school_id = ? AND submission_id = ?')
      .all<{ question_id: number; marks: number; mistake: Mistake | null }>(schoolId, submissionId),

  clearScores: (schoolId: number, submissionId: string) =>
    db.prepare('DELETE FROM question_scores WHERE school_id = ? AND submission_id = ?').run(schoolId, submissionId),

  addScore: (schoolId: number, submissionId: string, s: ScoreInput) =>
    db.prepare('INSERT INTO question_scores (school_id, submission_id, question_id, marks, mistake) VALUES (?, ?, ?, ?, ?)')
      .run(schoolId, submissionId, s.questionId, s.marks, s.mistake),

  // Per question: how the class did and which mistakes they made.
  examMap: (exam: ExamRow) =>
    db.prepare(
      `SELECT q.id, q.position, q.label, q.topic, q.max_marks,
         count(qs.marks)::int AS scored, avg(qs.marks) AS average,
         count(*) FILTER (WHERE qs.marks >= q.max_marks)::int AS full_marks,
         ${mistakeCounts}
       FROM questions q
       LEFT JOIN question_scores qs ON qs.school_id = q.school_id AND qs.question_id = q.id
       WHERE q.school_id = ? AND q.exam_id = ?
       GROUP BY q.id ORDER BY q.position`,
    ).all(exam.school_id, exam.id),

  // Submissions classmates can see that earned full marks on each question.
  fullMarks: (exam: ExamRow) =>
    db.prepare(
      `SELECT qs.question_id, qs.submission_id FROM question_scores qs
       JOIN questions q ON q.school_id = qs.school_id AND q.id = qs.question_id
       JOIN submissions s ON s.school_id = qs.school_id AND s.id = qs.submission_id
       WHERE q.school_id = ? AND q.exam_id = ? AND qs.marks >= q.max_marks AND s.hidden_from_peers = 0`,
    ).all<{ question_id: number; submission_id: string }>(exam.school_id, exam.id),

  studentSkills: (schoolId: number, studentId: number) =>
    db.prepare(
      `SELECT q.topic, e.subject, sum(qs.marks) AS got, sum(q.max_marks) AS max, count(*)::int AS questions
       FROM question_scores qs
       JOIN questions q ON q.school_id = qs.school_id AND q.id = qs.question_id
       JOIN submissions s ON s.school_id = qs.school_id AND s.id = qs.submission_id
       JOIN exams e ON e.school_id = q.school_id AND e.id = q.exam_id
       WHERE qs.school_id = ? AND s.student_id = ? AND e.marks_released = 1 AND q.topic <> ''
       GROUP BY q.topic, e.subject ORDER BY sum(qs.marks) / sum(q.max_marks)`,
    ).all(schoolId, studentId),

  schoolTopics: (schoolId: number) =>
    db.prepare(
      `SELECT q.topic, e.subject, c.name AS class_name, sum(qs.marks) AS got, sum(q.max_marks) AS max,
         count(*)::int AS answers, ${mistakeCounts}
       FROM question_scores qs
       JOIN questions q ON q.school_id = qs.school_id AND q.id = qs.question_id
       JOIN exams e ON e.school_id = q.school_id AND e.id = q.exam_id
       JOIN classes c ON c.school_id = e.school_id AND c.id = e.class_id
       WHERE qs.school_id = ? AND q.topic <> ''
       GROUP BY q.topic, e.subject, c.name ORDER BY sum(qs.marks) / sum(q.max_marks)`,
    ).all(schoolId),

  // Students with the lowest average across every marked answer.
  watchlist: (schoolId: number) =>
    db.prepare(
      `SELECT u.id, u.name, c.name AS class_name, avg(s.marks / e.max_marks) AS ratio, count(*)::int AS exams
       FROM submissions s
       JOIN exams e ON e.school_id = s.school_id AND e.id = s.exam_id
       JOIN users u ON u.school_id = s.school_id AND u.id = s.student_id
       LEFT JOIN classes c ON c.school_id = u.school_id AND c.id = u.class_id
       WHERE s.school_id = ? AND s.marks IS NOT NULL AND u.active = 1
       GROUP BY u.id, u.name, c.name
       HAVING avg(s.marks / e.max_marks) < 0.6
       ORDER BY ratio LIMIT 8`,
    ).all(schoolId),
});
