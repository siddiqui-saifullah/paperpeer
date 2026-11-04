import { tx } from '../../db/index.js';
import { hashPassword, tempPassword } from '../../lib/crypto.js';
import { HttpError, badRequest, forbidden, id, notFound, str } from '../../lib/http.js';
import { peopleRepo } from './people.repo.js';
import type { Body, Db, SessionUser } from '../../types.js';
import type { SessionStore } from '../../modules/auth/session.js';

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function peopleService(db: Db, session: SessionStore) {
  const repo = peopleRepo(db);

  const nextUsername = async (schoolId: number, base: string) => {
    let candidate = base;
    for (let n = 2; await repo.usernameTaken(schoolId, candidate); n++) candidate = `${base}-${n}`;
    return candidate;
  };

  // The account a staff member wants to change, checked against their rights.
  const manageable = async (actor: SessionUser, targetId: unknown) => {
    const user = await repo.userById(actor.school_id, id(targetId));
    if (!user) throw notFound();
    if (user.id === actor.id) throw badRequest('You cannot do this to your own account.');
    if (actor.role !== 'admin' && user.role !== 'student') throw forbidden();
    return user;
  };

  return {
    listClasses: (user: SessionUser) => repo.listClasses(user.school_id),
    listUsers: (user: SessionUser) => repo.listUsers(user.school_id),

    async addClass(user: SessionUser, body: Body) {
      const name = str(body.name, 'Class name', { max: 40 });
      if (await repo.classByName(user.school_id, name)) throw new HttpError(409, 'That class already exists.');
      return { id: await repo.insertClass(user.school_id, name), name };
    },

    async deleteClass(user: SessionUser, classId: unknown) {
      const target = id(classId);
      if (await repo.classInUse(user.school_id, target)) {
        throw new HttpError(409, 'This class has students or exams, so it cannot be deleted.');
      }
      if (!(await repo.deleteClass(user.school_id, target))) throw notFound();
    },

    async addStudents(user: SessionUser, body: Body) {
      const schoolId = user.school_id;
      // A class named here is created on the spot, so setup has no separate step.
      const className = body.className === undefined ? null : str(body.className, 'Class', { max: 40 });
      if (className === null && !(await repo.classById(schoolId, id(body.classId)))) throw badRequest('Choose a class.');

      const rows = Array.isArray(body.students) ? body.students : [];
      if (!rows.length) throw badRequest('Add at least one student.');
      if (rows.length > 300) throw badRequest('Add at most 300 students at a time.');
      const students = rows.map((row: Body) => ({
        name: str(row.name, 'Student name', { max: 100 }),
        rollNo: str(row.rollNo, 'Roll number', { max: 20, optional: true }),
        password: tempPassword(),
      }));
      const hashes = await Promise.all(students.map((s) => hashPassword(s.password)));

      return tx(db, async () => {
        let classRow = className === null ? await repo.classById(schoolId, id(body.classId)) : await repo.classByName(schoolId, className);
        if (!classRow) {
          // The chosen class was deleted since the check above.
          if (className === null) throw badRequest('Choose a class.');
          classRow = { id: await repo.insertClass(schoolId, className), name: className };
        }
        const created: { name: string; rollNo: string; username: string; tempPassword: string }[] = [];
        for (const [i, student] of students.entries()) {
          const suffix = slug(student.rollNo) || slug(student.name) || 'student';
          const username = await nextUsername(schoolId, `${slug(classRow.name) || 'class'}-${suffix}`);
          await repo.insertStudent(schoolId, { ...student, username, hash: hashes[i], classId: classRow.id });
          created.push({ name: student.name, rollNo: student.rollNo, username, tempPassword: student.password });
        }
        return { created, className: classRow.name };
      });
    },

    async addTeacher(user: SessionUser, body: Body) {
      const name = str(body.name, 'Name', { max: 100 });
      const password = tempPassword();
      const hash = await hashPassword(password);
      const username = await tx(db, async () => {
        const chosen = await nextUsername(user.school_id, slug(name) || 'teacher');
        await repo.insertTeacher(user.school_id, name, chosen, hash);
        return chosen;
      });
      return { name, username, tempPassword: password };
    },

    async resetPassword(actor: SessionUser, targetId: unknown) {
      const user = await manageable(actor, targetId);
      const password = tempPassword();
      await repo.resetPassword(user.school_id, user.id, await hashPassword(password));
      await session.revokeAll(user.school_id, user.id);
      return { name: user.name, username: user.username, tempPassword: password };
    },

    async moveToClass(actor: SessionUser, targetId: unknown, classId: unknown) {
      const user = await manageable(actor, targetId);
      if (user.role !== 'student') throw badRequest('Only students belong to a class.');
      const target = id(classId);
      if (!(await repo.classById(user.school_id, target))) throw badRequest('Choose a class.');
      await repo.setClass(user.school_id, user.id, target);
    },

    async setActive(actor: SessionUser, targetId: unknown, active: unknown) {
      const user = await manageable(actor, targetId);
      await repo.setActive(user.school_id, user.id, active ? 1 : 0);
      if (!active) await session.revokeAll(user.school_id, user.id);
    },
  };
}
