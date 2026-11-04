import express from 'express';
import { notFound } from '../../lib/http.js';
import { requireUser, staffOnly, me } from '../../middleware/guards.js';
import { filesService } from './files.service.js';
import type { Db } from '../../types.js';
import type { FileStore } from '../../lib/storage.js';

export function fileRoutes({ db, store }: { db: Db; store: FileStore }) {
  const router = express.Router();
  const service = filesService(db, store);

  router.post('/exams/:id/files', ...staffOnly, async (req, res) => {
    const { exam, kind } = await service.examForUpload(me(req), req.params.id, req.query.kind);
    const uploads = await store.receive(req, res);
    res.status(201).json({ files: await service.addExamFiles(exam, kind, uploads) });
  });

  router.get('/files/:fileId', requireUser, async (req, res) => {
    const { file, filename } = await service.readable(me(req), req.params.fileId);
    const bytes = await store.read(file.school_id, file.stored_name);
    if (!bytes) throw notFound('This file is no longer available.');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    });
    res.send(bytes);
  });

  router.delete('/files/:fileId', requireUser, async (req, res) => {
    await service.remove(me(req), req.params.fileId);
    res.json({ ok: true });
  });

  return router;
}
