import { api } from '../core/api.js';
import { renderId } from '../core/view.js';
import { studentExam } from './student-exam.js';
import { staffExam } from './teacher-exam.js';

export async function examPage(token, id) {
  const data = await api(`/exams/${id}`);
  const extra = data.role === 'student' ? await api(`/exams/${id}/peers`) : await api(`/exams/${id}/insights`);
  if (token !== renderId) return;
  if (data.role === 'staff') staffExam(data, extra);
  else studentExam(data, extra);
}
