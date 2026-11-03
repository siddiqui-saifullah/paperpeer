import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomId } from './crypto.js';
import { HttpError, badRequest } from './http.js';

export const MAX_FILE_MB = 15;
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

export function fileStore(dataDir) {
  const uploadRoot = path.join(dataDir, 'uploads');
  const tmpDir = path.join(uploadRoot, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const receive = multer({
    dest: tmpDir,
    defParamCharset: 'utf8',
    limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES_PER_UPLOAD, fields: 5 },
  }).array('files', MAX_FILES_PER_UPLOAD);

  const remove = (p) => fs.promises.unlink(p).catch(() => {});
  const schoolDir = (schoolId) => path.join(uploadRoot, String(Number(schoolId)));

  return {
    // Must run after the route has checked permission, so a rejected caller's
    // upload is never written to disk.
    receive(req, res) {
      return new Promise((resolve, reject) => {
        receive(req, res, (err) => {
          if (!err) {
            if (!req.files?.length) return reject(badRequest('Choose at least one file.'));
            return resolve(req.files);
          }
          const cleanup = Promise.all((req.files || []).map((f) => remove(f.path)));
          cleanup.then(() => {
            if (err instanceof multer.MulterError) {
              if (err.code === 'LIMIT_FILE_SIZE') {
                reject(new HttpError(413, `Each file must be under ${MAX_FILE_MB} MB.`));
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
      return Promise.all(uploads.map((f) => remove(f.path)));
    },

    // Checks every file before keeping any, so one bad file fails the whole upload.
    async accept(schoolId, uploads) {
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
        await fs.promises.mkdir(schoolDir(schoolId), { recursive: true });
        const stored = [];
        for (const { upload, type } of checked) {
          const fileId = randomId();
          const storedName = fileId + type.ext;
          await fs.promises.rename(upload.path, path.join(schoolDir(schoolId), storedName));
          stored.push({
            id: fileId,
            storedName,
            originalName: upload.originalname.slice(0, 200),
            mime: type.mime,
            size: upload.size,
          });
        }
        return stored;
      } catch (err) {
        await Promise.all(uploads.map((f) => remove(f.path)));
        throw err;
      }
    },

    saveBuffer(schoolId, buffer, originalName) {
      const type = detectType(buffer);
      if (!type) throw new Error('Unsupported file type');
      fs.mkdirSync(schoolDir(schoolId), { recursive: true });
      const fileId = randomId();
      const storedName = fileId + type.ext;
      fs.writeFileSync(path.join(schoolDir(schoolId), storedName), buffer);
      return { id: fileId, storedName, originalName, mime: type.mime, size: buffer.length };
    },

    dir: schoolDir,

    delete(schoolId, storedName) {
      return remove(path.join(schoolDir(schoolId), path.basename(storedName)));
    },
  };
}
