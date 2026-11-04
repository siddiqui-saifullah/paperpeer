// Creates two demo schools so the app, and the separation between schools, can be
// tried right away. Never run this on a production database.
import { config } from '../src/config.js';
import { openDb, tx } from '../src/db/index.js';
import { hashPassword, randomId } from '../src/lib/crypto.js';
import { fileStore } from '../src/lib/storage.js';
import type { Mistake } from '../src/modules/questions/questions.repo.js';
import type { ExamStatus, FileKind, Role } from '../src/types.js';

const db = await openDb(config);
const store = fileStore({ dataDir: config.dataDir, mode: config.storage, db, cloudinary: config.cloudinary });
const PASSWORD = 'demo1234';

type Id = { id: number };

function pdf(lines: string[]) {
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 20 : 13} Tf 60 ${760 - i * 26} Td (${line.replace(/([()\\])/g, '\\$1')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function addFile(schoolId: number, examId: number, submissionId: string | null, kind: FileKind, name: string, lines: string[]) {
  const f = await store.saveBuffer(schoolId, pdf(lines), name);
  await db.prepare(
    `INSERT INTO files (id, school_id, exam_id, submission_id, kind, stored_name, original_name, mime, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(f.id, schoolId, examId, submissionId, kind, f.storedName, f.originalName, f.mime, f.size);
}

const insertUser = async (
  schoolId: number,
  role: Role,
  name: string,
  username: string,
  hash: string,
  classId: number | null = null,
  rollNo: string | null = null,
) =>
  (await db.prepare(
    'INSERT INTO users (school_id, role, name, username, password_hash, class_id, roll_no) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
  ).get<Id>(schoolId, role, name, username, hash, classId, rollNo))!.id;

async function school(name: string, code: string, students: string[], hash: string) {
  const schoolId = (await db.prepare('INSERT INTO schools (name, code) VALUES (?, ?) RETURNING id').get<Id>(name, code))!.id;
  await insertUser(schoolId, 'admin', 'Principal Office', 'admin', hash);
  const teacher = await insertUser(schoolId, 'teacher', 'Meera Iyer', 'meera', hash);
  const classId = (await db.prepare(`INSERT INTO classes (school_id, name) VALUES (?, '10-A') RETURNING id`).get<Id>(schoolId))!.id;
  const ids: number[] = [];
  for (const [i, student] of students.entries()) {
    ids.push(await insertUser(schoolId, 'student', student, `10-a-${i + 1}`, hash, classId, String(i + 1)));
  }

  const exam = async (title: string, subject: string, date: string | null, status: ExamStatus, released: number) =>
    (await db.prepare(
      `INSERT INTO exams (school_id, class_id, title, subject, exam_date, max_marks, status, marks_released, created_by)
       VALUES (?, ?, ?, ?, ?, 50, ?, ?, ?) RETURNING id`,
    ).get<Id>(schoolId, classId, title, subject, date, status, released, teacher))!.id;

  const review = await exam('Unit Test 1', 'Mathematics', '2026-10-05', 'review', 1);
  await addFile(schoolId, review, null, 'paper', 'Maths-UT1-paper.pdf', ['Unit Test 1: Mathematics', 'Q1. Solve x^2 - 5x + 6 = 0  (10)', 'Q2. Prove that root 2 is irrational  (20)', 'Q3. Find the area of a circle of radius 7 cm  (20)']);
  await addFile(schoolId, review, null, 'solution', 'Maths-UT1-solution.pdf', ['Solution: Unit Test 1', 'Q1. (x - 2)(x - 3) = 0, so x = 2 or 3', 'Q2. Assume root 2 = p/q in lowest terms, then derive a contradiction', 'Q3. pi r^2 = 22/7 x 49 = 154 sq cm']);
  const marks = [46, 38, 41, 29];
  for (const [i, studentId] of ids.entries()) {
    const submissionId = randomId();
    await db.prepare(
      'INSERT INTO submissions (id, school_id, exam_id, student_id, marks, feedback, is_model) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(submissionId, schoolId, review, studentId, marks[i % marks.length], i === 0 ? 'Very clear working. Keep it up.' : 'Show each step in Q2.', i === 0 ? 1 : 0);
    await addFile(schoolId, review, submissionId, 'answer', `answer-${i + 1}.pdf`, [`Answer sheet ${i + 1}`, 'Q1. x^2 - 5x + 6 = (x - 2)(x - 3)', i === 0 ? 'Q2. Full proof by contradiction, all steps shown' : 'Q2. Partial attempt', 'Q3. 154 sq cm']);
  }

  const history: [string, string, string, number[]][] = [
    ['Class Test 1', 'Mathematics', '2026-08-10', [31, 27, 35, 24]],
    ['Class Test 2', 'Mathematics', '2026-09-08', [39, 32, 37, 26]],
  ];
  for (const [title, subject, date, scores] of history) {
    const pastExam = await exam(title, subject, date, 'review', 1);
    await addFile(schoolId, pastExam, null, 'paper', `${title}-paper.pdf`, [title, 'Q1. Sample question  (50)']);
    for (const [i, studentId] of ids.entries()) {
      const submissionId = randomId();
      await db.prepare('INSERT INTO submissions (id, school_id, exam_id, student_id, marks) VALUES (?, ?, ?, ?, ?)')
        .run(submissionId, schoolId, pastExam, studentId, scores[i % scores.length]);
      await addFile(schoolId, pastExam, submissionId, 'answer', `answer-${i + 1}.pdf`, [`${title}: answer sheet ${i + 1}`]);
    }
  }

  const collecting = await exam('Unit Test 2', 'Science', '2026-10-28', 'collecting', 0);
  await addFile(schoolId, collecting, null, 'paper', 'Science-UT2-paper.pdf', ['Unit Test 2: Science', 'Q1. State Ohm\'s law  (10)', 'Q2. Draw a labelled diagram of the human heart  (40)']);
  await addFile(schoolId, collecting, null, 'solution', 'Science-UT2-solution.pdf', ['Solution: Unit Test 2', 'Q1. V = IR at constant temperature']);

  await exam('Half Yearly', 'English', '2026-11-12', 'draft', 0);
}

// Splits the demo exams into questions and spreads each student's total across
// them, tagging a mistake wherever marks were lost. Safe to run again: exams that
// already have questions are skipped, so it also upgrades an older demo database.
// [label, topic, max marks, ease: share of marks a typical student gets]
type DemoQuestion = [string, string, number, number];
const DEMO_QUESTIONS: Record<string, DemoQuestion[]> = {
  'Unit Test 1': [['Q1', 'Quadratic equations', 10, 1], ['Q2', 'Proof by contradiction', 20, 0.62], ['Q3', 'Area of circles', 20, 0.9]],
  'Class Test 1': [['Q1', 'Linear equations', 20, 0.85], ['Q2', 'Area of circles', 15, 0.55], ['Q3', 'Statistics', 15, 0.7]],
  'Class Test 2': [['Q1', 'Quadratic equations', 20, 0.9], ['Q2', 'Proof by contradiction', 15, 0.6], ['Q3', 'Statistics', 15, 0.8]],
};
const MISTAKE_CYCLE: Mistake[] = ['concept', 'calculation', 'incomplete', 'misread', 'calculation', 'concept'];

async function addDemoQuestions(schoolId: number) {
  for (const [title, questions] of Object.entries(DEMO_QUESTIONS)) {
    const exam = await db.prepare('SELECT id FROM exams WHERE school_id = ? AND title = ?').get<Id>(schoolId, title);
    if (!exam || (await db.prepare('SELECT 1 FROM questions WHERE exam_id = ?').get(exam.id))) continue;
    const ids: number[] = [];
    for (const [i, [label, topic, max]] of questions.entries()) {
      ids.push((await db.prepare('INSERT INTO questions (school_id, exam_id, position, label, topic, max_marks) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
        .get<Id>(schoolId, exam.id, i + 1, label, topic, max))!.id);
    }
    const subs = await db
      .prepare('SELECT id, marks FROM submissions WHERE exam_id = ? AND marks IS NOT NULL ORDER BY id')
      .all<{ id: string; marks: number }>(exam.id);
    for (const [n, sub] of subs.entries()) {
      // Each question gets a share of the total weighted by how hard it was.
      const weight = questions.reduce((sum, [, , max, ease]) => sum + max * ease, 0);
      const marks = questions.map(([, , max, ease]) => Math.min(max, Math.round((sub.marks * max * ease) / weight)));
      let left = sub.marks - marks.reduce((a, b) => a + b, 0);
      for (let i = 0; left !== 0 && i < marks.length * 4; i++) {
        const q = i % marks.length;
        const max = questions[q]![2];
        const step = left > 0 ? Math.min(left, max - marks[q]!) : Math.max(left, -marks[q]!);
        marks[q]! += step;
        left -= step;
      }
      for (const [q, got] of marks.entries()) {
        const mistake = got < questions[q]![2] ? MISTAKE_CYCLE[(n + q * 2) % MISTAKE_CYCLE.length] : null;
        await db.prepare('INSERT INTO question_scores (school_id, submission_id, question_id, marks, mistake) VALUES (?, ?, ?, ?, ?)')
          .run(schoolId, sub.id, ids[q], got, mistake);
      }
    }
  }
}

if (await db.prepare(`SELECT 1 FROM schools WHERE code = 'greenfield'`).get()) {
  await tx(db, async () => {
    for (const { id } of await db.prepare(`SELECT id FROM schools WHERE code IN ('greenfield', 'riverside')`).all<Id>()) await addDemoQuestions(id);
  });
  console.log('Demo schools already exist. Demo questions are in place.');
} else {
  const hash = await hashPassword(PASSWORD);
  await tx(db, async () => {
    await school('Greenfield Public School', 'greenfield', ['Riya Sharma', 'Arjun Mehta', 'Sana Sheikh', 'Kabir Das'], hash);
    await school('Riverside Academy', 'riverside', ['Neha Gupta', 'Rohan Pillai'], hash);
    for (const { id } of await db.prepare(`SELECT id FROM schools WHERE code IN ('greenfield', 'riverside')`).all<Id>()) await addDemoQuestions(id);
  });
  console.log(`Demo data ready. All demo accounts use the password: ${PASSWORD}`);
  console.log('School codes: greenfield, riverside. Usernames: admin, meera, 10-a-1, 10-a-2');
}
await db.close();
