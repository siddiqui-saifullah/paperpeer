import type { Tone } from '../components/kit';
import type { StudentExam } from './types';

/** Where an exam is for a student: what they see as its status. */
export function studentStatus(e: Pick<StudentExam, 'status' | 'submitted' | 'marks' | 'marksReleased'>): { label: string; tone: Tone } {
  if (e.status === 'collecting' && !e.submitted) return { label: 'To do', tone: 'bad' };
  if (e.status === 'collecting') return { label: 'Submitted', tone: 'info' };
  if (e.marks !== null) return { label: 'Results out', tone: 'good' };
  if (e.marksReleased && !e.submitted) return { label: 'Missed', tone: '' };
  return { label: 'Being marked', tone: 'warn' };
}
