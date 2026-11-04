-- Files whose bytes could not be deleted from storage (say Cloudinary was
-- unreachable) after their rows were removed. Retried on later deletes until gone.
CREATE TABLE pending_file_deletions (
  stored_name TEXT PRIMARY KEY,
  school_id INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
