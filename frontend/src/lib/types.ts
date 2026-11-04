// Shapes of what the API returns. Kept in step with the backend's view functions.

export type Role = 'admin' | 'teacher' | 'student';
export type ExamStatus = 'draft' | 'collecting' | 'review';
export type Mistake = 'concept' | 'calculation' | 'misread' | 'incomplete' | 'unattempted';
export type MistakeCounts = Record<Mistake, number>;

export interface Me {
  id: number;
  role: Role;
  name: string;
  username: string;
  classId: number | null;
  rollNo: string | null;
  mustChangePassword: boolean;
  school: { name: string; code: string };
}

export interface FileInfo {
  id: string;
  name: string;
  mime: string;
  size?: number;
}

export interface Exam {
  id: number;
  title: string;
  subject: string;
  classId: number;
  className: string;
  examDate: string | null;
  maxMarks: number;
  status: ExamStatus;
  peerSharing: boolean;
  anonymous: boolean;
  marksReleased: boolean;
}

/** GET /exams as staff. */
export interface StaffExam extends Exam {
  submitted: number;
  graded: number;
  classSize: number;
  averagePct: number | null;
}

/** GET /exams as a student. */
export interface StudentExam extends Exam {
  submitted: boolean;
  marks: number | null;
  classAverage: number | null;
}

export interface Question {
  id: number;
  label: string;
  topic: string;
  maxMarks: number;
}

export interface ScoredQuestion extends Question {
  marks: number | null;
  mistake: Mistake | null;
}

export interface ExamStats {
  graded: number;
  average: number | null;
  highest: number | null;
}

export interface RosterEntry {
  studentId: number;
  name: string;
  rollNo: string | null;
  submission: {
    id: string;
    marks: number | null;
    isModel: boolean;
    hiddenFromPeers: boolean;
    updatedAt: string;
    fileCount: number;
  } | null;
}

export interface StaffExamDetail {
  role: 'staff';
  exam: Exam;
  paper: FileInfo[];
  solution: FileInfo[];
  stats: ExamStats;
  questions: Question[];
  roster: RosterEntry[];
}

export interface StudentExamDetail {
  role: 'student';
  exam: Exam;
  paper: FileInfo[];
  solution: FileInfo[];
  canUpload: boolean;
  questionCount: number;
  submission: {
    id: string;
    files: FileInfo[];
    isModel: boolean;
    marks: number | null;
    feedback: string;
    helpful: number;
    breakdown: ScoredQuestion[];
  } | null;
  stats: ExamStats | null;
  note: string;
}

export type ExamDetail = StaffExamDetail | StudentExamDetail;

export interface QuestionInsight extends Question {
  scored: number;
  averagePct: number | null;
  fullMarks: number;
  mistakes: MistakeCounts;
}

export interface TopicInsight {
  topic: string;
  subject: string;
  className: string;
  masteryPct: number;
  answers: number;
  mistakes: MistakeCounts;
}

export interface WatchEntry {
  id: number;
  name: string;
  className: string | null;
  averagePct: number;
  exams: number;
}

export interface SchoolInsights {
  topics: TopicInsight[];
  watchlist: WatchEntry[];
}

export interface Skill {
  topic: string;
  subject: string;
  masteryPct: number;
  questions: number;
}

export interface MarkingView {
  exam: { id: number; title: string; className: string; maxMarks: number };
  submission: {
    id: string;
    studentId: number;
    studentName: string;
    rollNo: string | null;
    marks: number | null;
    feedback: string;
    isModel: boolean;
    hiddenFromPeers: boolean;
    files: FileInfo[];
    breakdown: ScoredQuestion[];
  };
  mistakes: Mistake[];
  nextId: string | null;
  total: number;
  marked: number;
}

export interface Peer {
  id: string;
  label: string;
  isModel: boolean;
  helpful: number;
  markedHelpful: boolean;
  files: FileInfo[];
}

export interface Bridge {
  questionId: number;
  label: string;
  topic: string;
  lost: number;
  mistake: Mistake | null;
  peers: { id: string; label: string }[];
}

export type PeersView = { open: false; peers: [] } | { open: true; anonymous: boolean; peers: Peer[]; bridges: Bridge[] };

export interface SchoolClass {
  id: number;
  name: string;
  students?: number;
}

export interface Person {
  id: number;
  role: Role;
  name: string;
  username: string;
  rollNo: string | null;
  classId: number | null;
  className: string | null;
  active: boolean;
}

export interface Credentials {
  name: string;
  rollNo?: string;
  username: string;
  tempPassword: string;
}
