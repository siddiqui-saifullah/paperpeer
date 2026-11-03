import { api } from '../core/api.js';
import { isStaff } from '../core/session.js';
import { renderId } from '../core/view.js';
import { staffDashboard } from './teacher-home.js';
import { studentDashboard } from './student-home.js';

export async function dashboard(token) {
  if (isStaff()) {
    const [{ exams }, { classes }, insights] = await Promise.all([api('/exams'), api('/classes'), api('/insights')]);
    if (token !== renderId) return;
    return staffDashboard(exams, classes, insights);
  }
  const [{ exams }, { skills }] = await Promise.all([api('/exams'), api('/me/skills')]);
  if (token !== renderId) return;
  studentDashboard(exams, skills);
}
