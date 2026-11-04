import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { openDb } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { startFakeCloudinary } from './fake-cloudinary.js';

const PDF = Buffer.from('%PDF-1.4\n%test\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let server, base, dataDir, db;
// TEST_STORAGE=db keeps files in Postgres; TEST_STORAGE=cloudinary sends them to
// a local fake of Cloudinary's API.
const storage = process.env.TEST_STORAGE || 'disk';
let cloud;

class Client {
  cookie = '';
  async req(method, url, body, { csrf = true } = {}) {
    const headers = {};
    if (csrf) headers['x-requested-with'] = 'paperpeer';
    if (this.cookie) headers.cookie = this.cookie;
    const init = { method, headers };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + url, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return {
      status: res.status,
      headers: res.headers,
      body: type.includes('json') ? await res.json() : await res.arrayBuffer(),
    };
  }
  get = (url, opts) => this.req('GET', url, undefined, opts);
  post = (url, body, opts) => this.req('POST', url, body ?? {}, opts);
  patch = (url, body) => this.req('PATCH', url, body);
  delete = (url) => this.req('DELETE', url);
  put = (url, body) => this.req('PUT', url, body);
  upload(url, name, content, type = 'application/pdf') {
    const form = new FormData();
    form.append('files', new Blob([content], { type }), name);
    return this.req('POST', url, form);
  }
}

async function login(school, username, password) {
  const client = new Client();
  const res = await client.post('/api/login', { school, username, password });
  assert.equal(res.status, 200, `login ${username}`);
  return client;
}

// Logs in with the temporary password and replaces it, as a new user would.
async function activate(school, account) {
  const client = await login(school, account.username, account.tempPassword);
  const res = await client.post('/api/password', {
    currentPassword: account.tempPassword,
    newPassword: 'new-password-1',
  });
  assert.equal(res.status, 200);
  return client;
}

async function setupSchool(code) {
  const admin = new Client();
  const res = await admin.post('/api/schools', {
    schoolName: `School ${code}`,
    code,
    adminName: 'Admin',
    username: 'admin',
    password: 'admin-password',
  });
  assert.equal(res.status, 201);
  const classA = (await admin.post('/api/classes', { name: '10-A' })).body.id;
  const classB = (await admin.post('/api/classes', { name: '10-B' })).body.id;
  const teacherAccount = (await admin.post('/api/teachers', { name: 'Tara Teacher' })).body.created[0];
  const teacher = await activate(code, teacherAccount);
  const { created } = (
    await teacher.post('/api/students/bulk', {
      classId: classA,
      students: [
        { name: 'Asha Rao', rollNo: '1' },
        { name: 'Bilal Khan', rollNo: '2' },
        { name: 'Chitra Nair', rollNo: '3' },
      ],
    })
  ).body;
  const other = (await teacher.post('/api/students/bulk', { classId: classB, students: [{ name: 'Dev Other', rollNo: '1' }] })).body.created[0];
  return {
    code,
    admin,
    teacher,
    classA,
    classB,
    asha: await activate(code, created[0]),
    bilal: await activate(code, created[1]),
    chitra: await activate(code, created[2]),
    otherClass: await activate(code, other),
  };
}

async function createExam(s, overrides = {}) {
  const res = await s.teacher.post('/api/exams', {
    classId: s.classA,
    title: 'Unit Test 1',
    subject: 'Maths',
    maxMarks: 50,
    examDate: '2026-10-20',
    ...overrides,
  });
  assert.equal(res.status, 201);
  return res.body.id;
}

let one, two;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperpeer-test-'));
  db = await openDb({
    dataDir,
    databaseUrl: process.env.TEST_DATABASE_URL,
    poolMax: Number(process.env.TEST_POOL_MAX || 5),
    // TEST_DB_DRIVER=neon with NEON_FETCH_ENDPOINT / NEON_WS_PROXY runs through Neon's driver.
    driver: process.env.TEST_DB_DRIVER,
    neonLocal: process.env.NEON_FETCH_ENDPOINT ? { fetchEndpoint: process.env.NEON_FETCH_ENDPOINT, wsProxy: process.env.NEON_WS_PROXY } : undefined,
  });
  if (storage === 'cloudinary') cloud = await startFakeCloudinary();
  const app = createApp({ db, dataDir, storage, cloudinary: cloud?.config });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  one = await setupSchool('school-one');
  two = await setupSchool('school-two');
});

after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  await cloud?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('same username in two schools logs into the right tenant only', async () => {
  const a = await login('school-one', 'admin', 'admin-password');
  const b = await login('school-two', 'admin', 'admin-password');
  assert.equal((await a.get('/api/me')).body.user.school.code, 'school-one');
  assert.equal((await b.get('/api/me')).body.user.school.code, 'school-two');
  const wrong = await new Client().post('/api/login', { school: 'nope', username: 'admin', password: 'admin-password' });
  assert.equal(wrong.status, 401);
});

test('school codes are unique', async () => {
  const res = await new Client().post('/api/schools', {
    schoolName: 'Copy', code: 'school-one', adminName: 'X', username: 'x1', password: 'password-123',
  });
  assert.equal(res.status, 409);
});

test('another school cannot reach exams, files, submissions, classes or users', async () => {
  const examId = await createExam(one);
  await one.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
  await one.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });
  await one.asha.upload(`/api/exams/${examId}/submission`, 'mine.pdf', PDF);
  const detail = (await one.teacher.get(`/api/exams/${examId}`)).body;
  const paperId = detail.paper[0].id;
  const asha = detail.roster.find((r) => r.name === 'Asha Rao');
  const subId = asha.submission.id;

  const t = two.teacher;
  assert.equal((await t.get(`/api/exams/${examId}`)).status, 404);
  assert.equal((await t.patch(`/api/exams/${examId}`, { title: 'Hacked' })).status, 404);
  assert.equal((await t.delete(`/api/exams/${examId}`)).status, 404);
  assert.equal((await t.upload(`/api/exams/${examId}/files?kind=paper`, 'x.pdf', PDF)).status, 404);
  assert.equal((await t.get(`/api/files/${paperId}`)).status, 404);
  assert.equal((await t.delete(`/api/files/${paperId}`)).status, 404);
  assert.equal((await t.get(`/api/submissions/${subId}`)).status, 404);
  assert.equal((await t.patch(`/api/submissions/${subId}`, { marks: 1 })).status, 404);
  assert.equal((await t.upload(`/api/exams/${examId}/students/${asha.studentId}/submission`, 'x.pdf', PDF)).status, 404);
  assert.equal((await t.delete(`/api/classes/${one.classA}`)).status, 404);
  assert.equal((await t.post('/api/exams', { classId: one.classA, title: 'X', subject: 'Y', maxMarks: 10 })).status, 400);
  assert.equal((await t.post('/api/students/bulk', { classId: one.classA, students: [{ name: 'X' }] })).status, 400);
  assert.equal((await t.post(`/api/users/${asha.studentId}/reset-password`)).status, 404);
  assert.equal((await t.post(`/api/users/${asha.studentId}/active`, { active: false })).status, 404);

  assert.equal((await two.asha.get(`/api/exams/${examId}`)).status, 404);
  assert.equal((await two.asha.get(`/api/files/${paperId}`)).status, 404);
  assert.equal((await two.asha.post(`/api/submissions/${subId}/helpful`)).status, 404);

  const lists = [await t.get('/api/exams'), await t.get('/api/users'), await t.get('/api/classes')];
  const text = JSON.stringify(lists.map((l) => l.body));
  assert.ok(!text.includes('Unit Test 1') || !lists[0].body.exams.some((e) => e.id === examId));
  assert.ok(!lists[1].body.users.some((u) => u.id === asha.studentId));
  assert.ok(!lists[2].body.classes.some((c) => c.id === one.classA));
});

test('database rejects rows that link across schools', async () => {
  const userInTwo = await db.prepare(`SELECT id, school_id FROM users WHERE username = 'admin' AND school_id <> (SELECT min(id) FROM schools)`).get();
  const classInOne = await db.prepare(`SELECT id FROM classes WHERE school_id = (SELECT min(id) FROM schools) LIMIT 1`).get();
  await assert.rejects(
    db.prepare(`INSERT INTO exams (school_id, class_id, title, subject, max_marks, created_by) VALUES (?, ?, 'X', 'Y', 10, ?)`)
      .run(userInTwo.school_id, classInOne.id, userInTwo.id),
    /foreign key/i,
  );
});

test('uploads and helpful clicks arriving together do not conflict', async () => {
  const examId = await createExam(one, { title: 'Parallel' });
  await one.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
  await one.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });

  const url = `/api/exams/${examId}/submission`;
  const uploads = await Promise.all([1, 2, 3, 4].map((n) => one.asha.upload(url, `page-${n}.pdf`, PDF)));
  assert.deepEqual(uploads.map((r) => r.status), [201, 201, 201, 201]);
  assert.equal(new Set(uploads.map((r) => r.body.submissionId)).size, 1);
  const { submission } = (await one.asha.get(`/api/exams/${examId}`)).body;
  assert.equal(submission.files.length, 4);

  await one.teacher.patch(`/api/exams/${examId}`, { status: 'review' });
  const clicks = await Promise.all([1, 2].map(() => one.bilal.post(`/api/submissions/${submission.id}/helpful`)));
  assert.ok(clicks.every((r) => r.status === 200));
});

test('exam lifecycle controls what students can see', async () => {
  const examId = await createExam(one, { title: 'Lifecycle' });
  assert.equal((await one.asha.get(`/api/exams/${examId}`)).status, 404, 'draft hidden');

  const publishEmpty = await one.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });
  assert.equal(publishEmpty.status, 400, 'needs a question paper');

  await one.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
  await one.teacher.upload(`/api/exams/${examId}/files?kind=solution`, 'solution.pdf', PDF);
  const solutionId = (await one.teacher.get(`/api/exams/${examId}`)).body.solution[0].id;
  await one.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });

  const collecting = (await one.asha.get(`/api/exams/${examId}`)).body;
  assert.equal(collecting.paper.length, 1);
  assert.deepEqual(collecting.solution, [], 'solution hidden while uploads are open');
  assert.equal((await one.asha.get(`/api/files/${solutionId}`)).status, 404);
  assert.equal((await one.otherClass.get(`/api/exams/${examId}`)).status, 404, 'other class blocked');

  const aRes = await one.asha.upload(`/api/exams/${examId}/submission`, 'Asha_Rao_real_name.pdf', PDF);
  assert.equal(aRes.status, 201);
  await one.bilal.upload(`/api/exams/${examId}/submission`, 'Bilal.png', PNG, 'image/png');
  await one.chitra.upload(`/api/exams/${examId}/submission`, 'Chitra.pdf', PDF);

  const peersEarly = (await one.asha.get(`/api/exams/${examId}/peers`)).body;
  assert.equal(peersEarly.open, false, 'no peeking while uploads are open');
  const bilalSubFile = (await one.bilal.get(`/api/exams/${examId}`)).body.submission.files[0].id;
  assert.equal((await one.asha.get(`/api/files/${bilalSubFile}`)).status, 404);

  const roster = (await one.teacher.get(`/api/exams/${examId}`)).body.roster;
  const subId = (name) => roster.find((r) => r.name === name).submission.id;
  assert.equal((await one.teacher.patch(`/api/submissions/${subId('Bilal Khan')}`, { marks: 51 })).status, 400);
  await one.teacher.patch(`/api/submissions/${subId('Bilal Khan')}`, { marks: 45, feedback: 'Great', isModel: true });
  await one.teacher.patch(`/api/submissions/${subId('Chitra Nair')}`, { marks: 20, hiddenFromPeers: true });
  await one.teacher.patch(`/api/exams/${examId}`, { status: 'review' });

  assert.equal((await one.asha.upload(`/api/exams/${examId}/submission`, 'late.pdf', PDF)).status, 409);

  const review = (await one.bilal.get(`/api/exams/${examId}`)).body;
  assert.equal(review.solution.length, 1);
  assert.equal(review.submission.marks, null, 'marks wait for release');
  assert.equal(review.submission.feedback, '');

  const peers = (await one.bilal.get(`/api/exams/${examId}/peers`)).body;
  assert.equal(peers.open, true);
  assert.equal(peers.peers.length, 1, 'excludes self and hidden answers');
  const text = JSON.stringify(peers);
  assert.ok(!text.includes('Asha'), 'no name or original file name leaks');
  assert.ok(!/marks|feedback/i.test(text), 'peer marks and feedback are private');

  const fileRes = await one.bilal.get(`/api/files/${peers.peers[0].files[0].id}`);
  assert.equal(fileRes.status, 200);
  assert.ok(!fileRes.headers.get('content-disposition').includes('Asha'));

  const chitraFile = (await db.prepare('SELECT id FROM files WHERE submission_id = ?').get(subId('Chitra Nair'))).id;
  assert.equal((await one.bilal.get(`/api/files/${chitraFile}`)).status, 404, 'hidden answer blocked');

  const asPeers = (await one.asha.get(`/api/exams/${examId}/peers`)).body.peers;
  assert.equal(asPeers[0].isModel, true, 'model answer comes first');
  assert.equal(asPeers.length, 1);
  const mark = await one.asha.post(`/api/submissions/${asPeers[0].id}/helpful`);
  assert.equal(mark.body.markedHelpful, true);
  assert.equal((await one.bilal.post(`/api/submissions/${asPeers[0].id}/helpful`)).status, 404, 'not own answer');

  await one.teacher.patch(`/api/exams/${examId}`, { marksReleased: true, anonymous: false });
  const released = (await one.bilal.get(`/api/exams/${examId}`)).body;
  assert.equal(released.submission.marks, 45);
  assert.equal(released.submission.feedback, 'Great');
  assert.equal(released.submission.helpful, 1);
  assert.equal(released.stats.highest, 45);
  const named = (await one.bilal.get(`/api/exams/${examId}/peers`)).body;
  assert.equal(named.peers[0].label, 'Asha Rao');

  await one.teacher.patch(`/api/exams/${examId}`, { peerSharing: false });
  assert.equal((await one.bilal.get(`/api/exams/${examId}/peers`)).body.open, false);
  assert.equal((await one.bilal.get(`/api/files/${asPeers.length && fileIdOf(named)}`)).status, 404, 'sharing off blocks files');

  assert.equal((await one.bilal.put(`/api/exams/${examId}/note`, { body: 'Revise chapter 3' })).status, 200);
  assert.equal((await one.bilal.get(`/api/exams/${examId}`)).body.note, 'Revise chapter 3');
});

const fileIdOf = (peersResponse) => peersResponse.peers[0].files[0].id;

test('adding students by class name reuses or creates the class inside the school', async () => {
  const first = await two.teacher.post('/api/students/bulk', { className: 'Nine-C', students: [{ name: 'Nia One', rollNo: '1' }] });
  assert.equal(first.status, 201);
  const again = await two.teacher.post('/api/students/bulk', { className: 'nine-c', students: [{ name: 'Nia Two', rollNo: '2' }] });
  assert.equal(again.body.className, 'Nine-C');
  const classes = (await two.teacher.get('/api/classes')).body.classes.filter((c) => c.name === 'Nine-C');
  assert.equal(classes.length, 1);
  assert.ok(!(await one.teacher.get('/api/classes')).body.classes.some((c) => c.name === 'Nine-C'));
});

test('marking moves to the next unmarked answer', async () => {
  const examId = await createExam(two, { title: 'Marking order' });
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'p.pdf', PDF);
  await two.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });
  for (const s of [two.asha, two.bilal, two.chitra]) await s.upload(`/api/exams/${examId}/submission`, 'a.pdf', PDF);
  const roster = (await two.teacher.get(`/api/exams/${examId}`)).body.roster;
  const [a, b, c] = ['Asha Rao', 'Bilal Khan', 'Chitra Nair'].map((n) => roster.find((r) => r.name === n).submission.id);
  await two.teacher.patch(`/api/submissions/${b}`, { marks: 10 });
  assert.equal((await two.teacher.get(`/api/submissions/${a}`)).body.nextId, c, 'skips marked answers');
  const last = (await two.teacher.get(`/api/submissions/${c}`)).body;
  assert.equal(last.nextId, a, 'wraps to skipped answers');
  assert.equal(last.marked, 1);
  await two.teacher.patch(`/api/submissions/${a}`, { marks: 10 });
  await two.teacher.patch(`/api/submissions/${c}`, { marks: 10 });
  assert.equal((await two.teacher.get(`/api/submissions/${c}`)).body.nextId, null);
});

test('a student who changes class keeps past answers but not the old class exams', async () => {
  const answered = await createExam(one, { title: 'Answered before move' });
  const missed = await createExam(one, { title: 'Missed before move' });
  for (const examId of [answered, missed]) {
    await one.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
    await one.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });
  }
  const { created } = (await one.teacher.post('/api/students/bulk', { classId: one.classA, students: [{ name: 'Moved Student', rollNo: '20' }] })).body;
  const moved = await activate('school-one', created[0]);
  await moved.upload(`/api/exams/${answered}/submission`, 'a.pdf', PDF);

  const userId = (await moved.get('/api/me')).body.user.id;
  assert.equal((await two.teacher.post(`/api/users/${userId}/class`, { classId: two.classB })).status, 404);
  assert.equal((await one.teacher.post(`/api/users/${userId}/class`, { classId: two.classB })).status, 400);
  assert.equal((await one.teacher.post(`/api/users/${userId}/class`, { classId: one.classB })).status, 200);

  assert.equal((await moved.get(`/api/exams/${answered}`)).status, 200);
  assert.equal((await moved.get(`/api/exams/${missed}`)).status, 404);
  const roster = (await one.teacher.get(`/api/exams/${answered}`)).body.roster;
  assert.ok(roster.some((r) => r.name === 'Moved Student'), 'stays on the old roster');
});

test('uploads are validated by content, not by name or claimed type', async () => {
  const examId = await createExam(one, { title: 'Upload checks' });
  const url = `/api/exams/${examId}/files?kind=paper`;
  const html = Buffer.from('<script>alert(1)</script>');
  assert.equal((await one.teacher.upload(url, 'evil.pdf', html, 'application/pdf')).status, 400);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
  assert.equal((await one.teacher.upload(url, 'evil.png', svg, 'image/png')).status, 400);
  assert.equal((await one.teacher.upload(url, 'ok.pdf', PDF)).status, 201);

  const tmp = path.join(dataDir, 'uploads', 'tmp');
  assert.equal(fs.readdirSync(tmp).length, 0, 'rejected uploads leave nothing behind');
});

test('roles are enforced', async () => {
  const noCsrf = await one.teacher.post('/api/classes', { name: 'X' }, { csrf: false });
  assert.equal(noCsrf.status, 403);
  assert.equal((await one.teacher.post('/api/teachers', { name: 'New' })).status, 403);
  assert.equal((await one.asha.post('/api/classes', { name: 'X' })).status, 403);
  assert.equal((await one.asha.post('/api/exams', {})).status, 403);
  assert.equal((await one.asha.get('/api/users')).status, 403);
  assert.equal((await new Client().get('/api/exams')).status, 401);

  const me = (await one.admin.get('/api/me')).body.user;
  assert.equal((await one.admin.post(`/api/users/${me.id}/active`, { active: false })).status, 400);

  const users = (await one.teacher.get('/api/users')).body.users;
  const adminId = users.find((u) => u.role === 'admin').id;
  assert.equal((await one.teacher.post(`/api/users/${adminId}/reset-password`)).status, 403);
});

test('temporary passwords must be replaced and old sessions die on reset', async () => {
  const { created } = (await one.teacher.post('/api/students/bulk', { classId: one.classB, students: [{ name: 'Eve New', rollNo: '9' }] })).body;
  const eve = await login('school-one', created[0].username, created[0].tempPassword);
  assert.equal((await eve.get('/api/me')).body.user.mustChangePassword, true);
  assert.equal((await eve.get('/api/exams')).status, 403);

  await eve.post('/api/password', { currentPassword: created[0].tempPassword, newPassword: 'another-pass-1' });
  assert.equal((await eve.get('/api/exams')).status, 200);

  const id = (await eve.get('/api/me')).body.user.id;
  await one.teacher.post(`/api/users/${id}/active`, { active: false });
  assert.equal((await eve.get('/api/exams')).status, 401);
  assert.equal((await new Client().post('/api/login', { school: 'school-one', username: created[0].username, password: 'another-pass-1' })).status, 401);
});

test('repeated failed logins are blocked', async () => {
  const client = new Client();
  const attempt = () => client.post('/api/login', { school: 'school-two', username: 'admin', password: 'wrong-password' });
  for (let i = 0; i < 10; i++) assert.equal((await attempt()).status, 401);
  assert.equal((await attempt()).status, 429);
});

// Whether a file's bytes are still in storage, whichever storage the suite uses.
async function isStored(row) {
  if (storage === 'cloudinary') return cloud.files.has(`paperpeer/${row.school_id}/${row.stored_name}`);
  if (storage === 'db') return Boolean(await db.prepare('SELECT 1 FROM file_blobs WHERE stored_name = ?').get(row.stored_name));
  return fs.existsSync(path.join(dataDir, 'uploads', String(row.school_id), row.stored_name));
}
const fileRows = (examId) => db.prepare('SELECT id, stored_name, school_id FROM files WHERE exam_id = ? ORDER BY original_name').all(examId);

test('deleting an exam removes its stored files', async () => {
  const examId = await createExam(two, { title: 'To delete' });
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
  const [row] = await fileRows(examId);
  assert.ok(await isStored(row));
  const served = await two.teacher.get(`/api/files/${row.id}`);
  assert.equal(served.status, 200, 'the stored file is served back');
  assert.equal((await two.teacher.delete(`/api/exams/${examId}`)).status, 200);
  assert.ok(!(await isStored(row)));
});

test('deleting one file removes its bytes from storage', async () => {
  const examId = await createExam(two, { title: 'Delete one' });
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'a.pdf', PDF);
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'b.pdf', PDF);
  const [a, b] = await fileRows(examId);
  assert.equal((await two.teacher.delete(`/api/files/${a.id}`)).status, 200);
  assert.ok(!(await isStored(a)), 'deleted file is gone from storage');
  assert.ok(await isStored(b), 'the other file is untouched');
  assert.equal((await two.teacher.get(`/api/files/${a.id}`)).status, 404);
});

test('a delete that storage refuses is retried until it succeeds', { skip: storage !== 'cloudinary' && 'needs TEST_STORAGE=cloudinary' }, async () => {
  const examId = await createExam(two, { title: 'Outage' });
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'a.pdf', PDF);
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'b.pdf', PDF);
  const [a, b] = await fileRows(examId);
  const pending = async () => Number((await db.prepare('SELECT count(*) AS n FROM pending_file_deletions').get()).n);

  cloud.state.failDestroy = true;
  assert.equal((await two.teacher.delete(`/api/files/${a.id}`)).status, 200, 'the user still sees the file deleted');
  assert.equal((await two.teacher.get(`/api/files/${a.id}`)).status, 404);
  assert.ok(await isStored(a), 'Cloudinary was down, so the bytes are still there');
  assert.equal(await pending(), 1, 'and the deletion is queued');

  cloud.state.failDestroy = false;
  assert.equal((await two.teacher.delete(`/api/files/${b.id}`)).status, 200);
  assert.ok(!(await isStored(b)));
  assert.ok(!(await isStored(a)), 'the queued deletion was retried');
  assert.equal(await pending(), 0);
});

test('question scoring feeds the mistake map, skills and peer bridge without leaking names', async () => {
  const examId = await createExam(two, { title: 'By question', maxMarks: 1 });
  const put = await two.teacher.put(`/api/exams/${examId}/questions`, {
    questions: [{ label: 'Q1', topic: 'Algebra', maxMarks: 10 }, { label: 'Q2', topic: 'Geometry', maxMarks: 20 }],
  });
  assert.equal(put.body.total, 30, 'exam total follows the questions');
  assert.equal((await one.teacher.put(`/api/exams/${examId}/questions`, { questions: [] })).status, 404, 'other school');
  await two.teacher.upload(`/api/exams/${examId}/files?kind=paper`, 'paper.pdf', PDF);
  await two.teacher.patch(`/api/exams/${examId}`, { status: 'collecting' });
  for (const s of [two.asha, two.bilal]) await s.upload(`/api/exams/${examId}/submission`, 'a.pdf', PDF);

  const { roster, questions } = (await two.teacher.get(`/api/exams/${examId}`)).body;
  const subOf = (name) => roster.find((r) => r.name === name).submission.id;
  const [q1, q2] = questions;
  const bad = await two.teacher.patch(`/api/submissions/${subOf('Asha Rao')}`, { scores: [{ questionId: q1.id, marks: 11 }, { questionId: q2.id, marks: 1 }] });
  assert.equal(bad.status, 400, 'per-question limit');
  await two.teacher.patch(`/api/submissions/${subOf('Asha Rao')}`, {
    scores: [{ questionId: q1.id, marks: 10 }, { questionId: q2.id, marks: 5, mistake: 'concept' }],
  });
  await two.teacher.patch(`/api/submissions/${subOf('Bilal Khan')}`, {
    scores: [{ questionId: q1.id, marks: 4, mistake: 'calculation' }, { questionId: q2.id, marks: 20 }],
  });
  assert.equal((await two.teacher.get(`/api/submissions/${subOf('Asha Rao')}`)).body.submission.marks, 15, 'total is the sum');
  assert.equal((await two.teacher.put(`/api/exams/${examId}/questions`, { questions: [] })).status, 409, 'locked once scored');

  const map = (await two.teacher.get(`/api/exams/${examId}/insights`)).body.questions;
  assert.equal(map[0].mistakes.calculation, 1);
  assert.equal(map[1].mistakes.concept, 1);
  assert.equal(map[0].averagePct, 70);

  await two.teacher.patch(`/api/exams/${examId}`, { status: 'review' });
  assert.deepEqual((await two.asha.get(`/api/exams/${examId}/peers`)).body.bridges, [], 'no bridge before release');
  await two.teacher.patch(`/api/exams/${examId}`, { marksReleased: true });
  const { bridges } = (await two.asha.get(`/api/exams/${examId}/peers`)).body;
  assert.equal(bridges.length, 1);
  assert.equal(bridges[0].label, 'Q2');
  assert.equal(bridges[0].peers.length, 1, 'points at the answer that got Q2 right');
  assert.ok(!JSON.stringify(bridges).includes('Bilal'), 'anonymous');

  const skills = (await two.asha.get('/api/me/skills')).body.skills;
  assert.deepEqual(skills.map((s) => [s.topic, s.masteryPct]), [['Geometry', 25], ['Algebra', 100]]);

  await two.teacher.patch(`/api/exams/${examId}`, { anonymous: false });
  assert.deepEqual((await two.asha.get(`/api/exams/${examId}/peers`)).body.bridges, [], 'no bridge when names are shown');
  assert.equal((await two.asha.get('/api/insights')).status, 403);
});
