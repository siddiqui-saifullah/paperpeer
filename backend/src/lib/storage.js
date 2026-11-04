import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { cloudinaryClient, parseCloudinaryUrl } from './cloudinary.js';
import { randomId } from './crypto.js';
import { HttpError, badRequest } from './http.js';

export const MAX_FILES_PER_UPLOAD = 20;

// Only these types are ever stored. The type comes from the file's own bytes,
// never from the client: this is what keeps an uploaded .html or .svg from
// being served back to a logged-in user as a page.
const SIGNATURES = [
  { mime: 'application/pdf', ext: '.pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export function detectType(buffer) {
  return SIGNATURES.find((s) => s.test(buffer)) || null;
}

// Where file bytes live. Both keep the same names, so switching only moves bytes.
function diskBackend(dataDir) {
  const uploadRoot = path.join(dataDir, 'uploads');
  const schoolDir = (schoolId) => path.join(uploadRoot, String(Number(schoolId)));
  const fileOf = (schoolId, storedName) => path.join(schoolDir(schoolId), path.basename(storedName));
  return {
    async write(schoolId, storedName, buffer) {
      await fs.promises.mkdir(schoolDir(schoolId), { recursive: true });
      await fs.promises.writeFile(fileOf(schoolId, storedName), buffer);
    },
    read: (schoolId, storedName) => fs.promises.readFile(fileOf(schoolId, storedName)).catch(() => null),
    remove: (schoolId, storedName) => fs.promises.unlink(fileOf(schoolId, storedName)).catch(() => {}),
  };
}

// Serverless hosts have no lasting disk, so bytes go in Postgres next to the rows.
function databaseBackend(db) {
  return {
    write: (schoolId, storedName, buffer) =>
      db.prepare('INSERT INTO file_blobs (stored_name, school_id, data) VALUES (?, ?, ?)').run(storedName, schoolId, buffer),
    async read(schoolId, storedName) {
      const row = await db.prepare('SELECT data FROM file_blobs WHERE school_id = ? AND stored_name = ?').get(schoolId, storedName);
      return row ? Buffer.from(row.data) : null;
    },
    remove: (schoolId, storedName) =>
      db.prepare('DELETE FROM file_blobs WHERE school_id = ? AND stored_name = ?').run(schoolId, storedName),
  };
}

// Cloudinary's free plan has far more room than the database. Files are private:
// only this backend can fetch them, after checking who is asking.
function cloudinaryBackend({ url, apiBase }) {
  const client = cloudinaryClient({ ...parseCloudinaryUrl(url), apiBase });
  const publicId = (schoolId, storedName) => `paperpeer/${Number(schoolId)}/${path.basename(storedName)}`;
  return {
    write: (schoolId, storedName, buffer) => client.upload(publicId(schoolId, storedName), buffer),
    read: (schoolId, storedName) => client.download(publicId(schoolId, storedName)),
    // Throws when Cloudinary cannot be reached; fileStore queues a retry.
    remove: (schoolId, storedName) => client.destroy(publicId(schoolId, storedName)),
  };
}

// maxFileMb: Vercel refuses request bodies over 4.5 MB, so serverless uses 4.
export function fileStore({ dataDir, mode = 'disk', db, cloudinary, maxFileMb = 15 }) {
  const backend =
    mode === 'cloudinary' ? cloudinaryBackend(cloudinary)
    : mode === 'db' ? databaseBackend(db)
    : diskBackend(dataDir);
  // Uploads land here first, whichever backend keeps them.
  const tmpDir = path.join(dataDir, 'uploads', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const receive = multer({
    dest: tmpDir,
    defParamCharset: 'utf8',
    limits: { fileSize: maxFileMb * 1024 * 1024, files: MAX_FILES_PER_UPLOAD, fields: 5 },
  }).array('files', MAX_FILES_PER_UPLOAD);

  const removeTmp = (p) => fs.promises.unlink(p).catch(() => {});

  async function removeOrQueue(schoolId, storedName) {
    try {
      await backend.remove(schoolId, storedName);
      return true;
    } catch (err) {
      console.error(`Could not delete stored file ${storedName}; will retry:`, err.message);
      await db?.prepare(
        `INSERT INTO pending_file_deletions (stored_name, school_id, last_error) VALUES (?, ?, ?)
         ON CONFLICT (stored_name) DO UPDATE SET attempts = pending_file_deletions.attempts + 1, last_error = EXCLUDED.last_error`,
      ).run(storedName, schoolId, String(err.message).slice(0, 500)).catch(() => {});
      return false;
    }
  }

  // Retries queued deletions, oldest first. Returns how many are still waiting.
  async function retryPending(limit = 10) {
    if (!db) return 0;
    const due = await db.prepare('SELECT school_id, stored_name FROM pending_file_deletions ORDER BY created_at LIMIT ?').all(limit);
    for (const row of due) {
      try {
        await backend.remove(row.school_id, row.stored_name);
        await db.prepare('DELETE FROM pending_file_deletions WHERE stored_name = ?').run(row.stored_name);
      } catch (err) {
        await db.prepare('UPDATE pending_file_deletions SET attempts = attempts + 1, last_error = ? WHERE stored_name = ?')
          .run(String(err.message).slice(0, 500), row.stored_name);
      }
    }
    return Number((await db.prepare('SELECT count(*) AS n FROM pending_file_deletions').get()).n);
  }

  const keep = async (schoolId, buffer, type, originalName) => {
    const fileId = randomId();
    const storedName = fileId + type.ext;
    await backend.write(schoolId, storedName, buffer);
    return { id: fileId, storedName, originalName: originalName.slice(0, 200), mime: type.mime, size: buffer.length };
  };

  return {
    maxFileMb,

    // Must run after the route has checked permission, so a rejected caller's
    // upload is never stored.
    receive(req, res) {
      return new Promise((resolve, reject) => {
        receive(req, res, (err) => {
          if (!err) {
            if (!req.files?.length) return reject(badRequest('Choose at least one file.'));
            return resolve(req.files);
          }
          const cleanup = Promise.all((req.files || []).map((f) => removeTmp(f.path)));
          cleanup.then(() => {
            if (err instanceof multer.MulterError) {
              if (err.code === 'LIMIT_FILE_SIZE') {
                reject(new HttpError(413, `Each file must be under ${maxFileMb} MB.`));
              } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
                reject(badRequest(`Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.`));
              } else {
                reject(badRequest('That upload could not be read.'));
              }
            } else {
              reject(err);
            }
          });
        });
      });
    },

    discard(uploads) {
      return Promise.all(uploads.map((f) => removeTmp(f.path)));
    },

    // Checks every file before keeping any, so one bad file fails the whole upload.
    async accept(schoolId, uploads) {
      const stored = [];
      try {
        const checked = [];
        for (const upload of uploads) {
          const handle = await fs.promises.open(upload.path, 'r');
          const head = Buffer.alloc(16);
          await handle.read(head, 0, 16, 0);
          await handle.close();
          const type = detectType(head);
          if (!type) throw badRequest(`"${upload.originalname}" must be a PDF, JPG, PNG or WEBP file.`);
          checked.push({ upload, type });
        }
        // One file in memory at a time.
        for (const { upload, type } of checked) {
          stored.push(await keep(schoolId, await fs.promises.readFile(upload.path), type, upload.originalname));
        }
        return stored;
      } catch (err) {
        await Promise.all(stored.map((f) => backend.remove(schoolId, f.storedName)));
        throw err;
      } finally {
        await Promise.all(uploads.map((f) => removeTmp(f.path)));
      }
    },

    saveBuffer(schoolId, buffer, originalName) {
      const type = detectType(buffer);
      if (!type) throw new Error('Unsupported file type');
      return keep(schoolId, buffer, type, originalName);
    },

    // The file's bytes, or null when they are gone.
    read: (schoolId, storedName) => backend.read(schoolId, storedName),

    // Called after the file's rows are gone. If storage cannot delete the bytes
    // right now, the file is queued and retried on later deletes, so a deleted
    // answer sheet never stays in storage for good.
    async delete(schoolId, storedName) {
      if (await removeOrQueue(schoolId, storedName)) await retryPending().catch(() => {});
    },

    retryPending,
  };
}
