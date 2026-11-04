// Types shared across the backend.

/** A database row. Repos narrow this with their own row types. */
export type Row = Record<string, any>;

export interface Statement {
  get<T = Row>(...params: unknown[]): Promise<T | undefined>;
  all<T = Row>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type Role = 'admin' | 'teacher' | 'student';

/** The logged-in user, as loaded for every request from the session cookie. */
export interface SessionUser {
  id: number;
  school_id: number;
  role: Role;
  name: string;
  username: string;
  class_id: number | null;
  roll_no: string | null;
  must_change_password: number;
  school_name: string;
  school_code: string;
}

/** Just enough of a user to identify them within their school. */
export interface UserRef {
  id: number;
  school_id: number;
}

export type ExamStatus = 'draft' | 'collecting' | 'review';

/** An exam row with its class name, as exam lookups return it. */
export interface ExamRow {
  id: number;
  school_id: number;
  class_id: number;
  class_name: string;
  title: string;
  subject: string;
  exam_date: string | null;
  max_marks: number;
  status: ExamStatus;
  peer_sharing: number;
  anonymous: number;
  marks_released: number;
  created_by: number;
  created_at: Date | string;
}

export interface SubmissionRow {
  id: string;
  school_id: number;
  exam_id: number;
  student_id: number;
  marks: number | null;
  feedback: string;
  is_model: number;
  hidden_from_peers: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export type FileKind = 'paper' | 'solution' | 'answer';

export interface FileRow {
  id: string;
  school_id: number;
  exam_id: number;
  submission_id: string | null;
  kind: FileKind;
  stored_name: string;
  original_name: string;
  mime: string;
  size: number;
  created_at: Date | string;
}

/** A request body: untrusted JSON, checked field by field. */
export type Body = Record<string, any>;

export type StorageMode = 'disk' | 'db' | 'cloudinary';

export interface CloudinaryConfig {
  url: string;
  apiBase?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by the session middleware; null when not logged in. */
      user?: SessionUser | null;
    }
  }
}
