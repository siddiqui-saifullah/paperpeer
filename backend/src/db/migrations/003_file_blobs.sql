-- File contents for hosts without a lasting disk (serverless). Rows are keyed by
-- files.stored_name; the disk store leaves this table empty.
CREATE TABLE file_blobs (
  stored_name TEXT PRIMARY KEY,
  school_id INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
