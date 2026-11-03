import express from 'express';
import { sessionStore } from './modules/auth/session.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { peopleRoutes } from './modules/people/people.routes.js';
import { examRoutes } from './modules/exams/exams.routes.js';
import { submissionRoutes } from './modules/submissions/submissions.routes.js';
import { fileRoutes } from './modules/files/files.routes.js';
import { questionRoutes } from './modules/questions/questions.routes.js';
import { fileStore } from './lib/storage.js';
import { notFound } from './lib/http.js';
import { requireApiHeader } from './middleware/csrf.js';
import { errorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security.js';

// Wires the app together. Each feature lives in src/modules/<feature>.
export function createApp({ db, dataDir, frontendDir, secureCookies = false, trustProxy = false }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders({ secureCookies }));

  const session = sessionStore(db, { secureCookies });
  const store = fileStore(dataDir);

  const api = express.Router();
  api.use(requireApiHeader);
  api.use(express.json({ limit: '256kb' }));
  api.use(session.attach);
  api.use(authRoutes({ db, session }));
  api.use(peopleRoutes({ db, session }));
  api.use(examRoutes({ db, store }));
  api.use(submissionRoutes({ db, store }));
  api.use(fileRoutes({ db, store }));
  api.use(questionRoutes({ db }));
  api.use(() => {
    throw notFound();
  });
  app.use('/api', api);

  if (frontendDir) app.use(express.static(frontendDir));
  app.use(errorHandler);
  return app;
}
