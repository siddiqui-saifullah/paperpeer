import express from 'express';
import { notFound } from '../../lib/http.js';
import { requireUser, staffOnly } from '../../middleware/guards.js';
import { filesService } from './files.service.js';

export function fileRoutes({ db, store }) {
  const router = express.Router();
  const service = filesService(db, store);

  router.post('/exams/:id/files', staffOnly, async (req, res) => {
    const exam = await service.examForUpload(req.user, req.params.id, req.query.kind);
    const uploads = await store.receive(req, res);
    res.status(201).json({ files: await service.addExamFiles(exam, req.query.kind, uploads) });
  });

  router.get('/files/:fileId', requireUser, async (req, res, next) => {
    const { file, filename } = await service.readable(req.user, req.params.fileId);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(file.stored_name, { root: store.dir(file.school_id), cacheControl: false, etag: false }, (err) => {
      if (err && !res.headersSent) next(notFound('This file is no longer available.'));
    });
  });

  router.delete('/files/:fileId', requireUser, async (req, res) => {
    await service.remove(req.user, req.params.fileId);
    res.json({ ok: true });
  });

  return router;
}
