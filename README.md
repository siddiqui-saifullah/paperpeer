# PaperPeer

A multi-school web app for sharing exam question papers, solutions and student answers, so students can learn from how classmates approached the same paper.

## Run it

Needs Node.js 22.13 or newer.

```bash
npm install
npm run seed
npm start
```

Open http://localhost:5173. `npm run seed` is optional and creates two demo schools. Run it while the servers are stopped.

| Part | Address | Started by |
| --- | --- | --- |
| Frontend | http://localhost:5173 | `npm start` |
| Backend API | http://localhost:3000/api | `npm start` |

`npm start` runs both, and `npm run dev` also restarts the backend when its code changes. Keep only one copy running. The frontend passes `/api` requests on to the backend, so the browser only talks to port 5173.

| School code | Username | Role |
| --- | --- | --- |
| `greenfield` or `riverside` | `admin` | School admin |
| `greenfield` or `riverside` | `meera` | Teacher |
| `greenfield` or `riverside` | `10-a-1`, `10-a-2` | Student |

All demo accounts use the password `demo1234`. Never seed a real deployment.

Run the tests with `npm test`.

## Database

PaperPeer uses PostgreSQL. Without any setup it runs embedded Postgres stored in `data/pglite`, which needs no account and allows only one running process at a time. A second process is refused with a clear message.

If the local files are ever damaged, `npm run db:reset` moves them aside under a dated name and the next start creates a fresh database.

To use [Neon](https://neon.tech) (free tier):

1. Create a Neon project and copy its connection string.
2. Copy `.env.example` to `.env` and paste the string after `DATABASE_URL=`.
3. Run `npm start`. The tables are created automatically.

Embedded data is not copied to Neon. With a `DATABASE_URL` set, uploaded files are stored in Postgres too (table `file_blobs`), so every server using that database sees the same files. Set `STORAGE=disk` to keep them in `DATA_DIR` instead.

## How it works

1. A school registers and gets its own school code. Its first user is the admin, with the username `admin`.
2. The admin or a teacher pastes a class list. The class and all logins are created together, and each person replaces their first password at first login.
3. A teacher creates an exam on one screen and publishes it. The exam page then always shows the one next step:

| Stage | Students can see | Students can do |
| --- | --- | --- |
| Not published | Nothing | Nothing |
| Accepting answers | Question paper | Upload their answers |
| Answers closed | Paper, solution, classmates' answers | Mark answers helpful, keep private notes |

Teachers can also upload a student's scanned sheet themselves at any stage, and can enter marks directly in the answers table.

Phone photos are resized in the browser before upload, which also removes their location metadata. A student moved to another class keeps the exams they already answered.

Per exam, a teacher controls whether answers are shared with the class, whether names are hidden, and when marks are released. Teachers can mark model answers, which appear first, and hide any sheet from classmates. A student's marks and feedback are only ever visible to that student and to staff.

## Question-level insights

An exam can be split into questions, each with marks and a topic. Marking then records marks per question and, where marks were lost, the kind of mistake: concept gap, calculation slip, misread question, incomplete working or not attempted. The total is always the sum of the questions.

| Feature | Who sees it | What it shows |
| --- | --- | --- |
| Mistake Map (exam) | Staff | Average per question and which mistakes cost marks, with suggested next steps |
| Mistake Map (school) | Staff | Every topic in every class by mastery and mistake type, plus students averaging below 60% |
| Skill Map | Each student | Their own mastery per topic across every released exam |
| Peer Bridge | Each student | For each question they lost marks on, classmates' answers that got that question fully right |

Peer Bridge only appears when names are hidden and marks are released, so it never reveals who scored what. `npm run seed` adds demo questions to the Greenfield and Riverside maths exams, including on an existing demo database.

## Data separation between schools

- Every table has a `school_id`, and each query filters on the school of the logged-in user, never on a value from the request.
- References between tables are composite `(school_id, id)` foreign keys, so the database itself refuses a row that links two schools.
- Uploaded files are stored per school outside `frontend/` and are served only after a permission check.
- A record from another school returns 404, so its existence is never confirmed.

## Project structure

The frontend and backend are separate folders on separate ports, and they talk only through the JSON API at `/api`.

```text
frontend/                    Browser app: plain ES modules, no build step
  server.js                  Serves these files, passes /api to the backend
  index.html
  styles/                    tokens, base, components, responsive
  js/
    main.js                  Starts the app
    router.js                URL to page table
    core/                    html, api client, session, ui helpers
    components/              Pieces shared by pages: layout, files, exam row
    pages/                   One file per screen

backend/
  src/
    server.js                Starts the server
    app.js                   Wires everything together
    config.js                All environment settings
    db/                      Postgres connection, plus numbered SQL migrations
    lib/                     Generic helpers: crypto, storage, validation
    middleware/              Login guards, CSRF, security headers, errors
    modules/                 One folder per feature
      auth/ people/ exams/ submissions/ files/ questions/
  scripts/seed.js            Demo data
  test/                      API tests
```

Each backend feature has the same three layers:

| File | Job | Must not |
| --- | --- | --- |
| `x.routes.js` | Read the request, send the response | Hold rules or SQL |
| `x.service.js` | Rules and permissions | Touch `req` or `res` |
| `x.repo.js` | SQL queries | Decide anything |

Rules that protect students live in one place each: `exams/exam-access.js` decides who can see an exam, and `files/files.service.js` decides who can read a file.

### Adding a feature

- **Backend:** add `modules/<feature>/` with the three files, then register its routes in `src/app.js`. Every query takes `school_id` from the logged-in user.
- **Database:** add the next numbered file in `db/migrations/`. Never edit one that has already run.
- **Frontend:** add a file in `js/pages/`, then one line in the table in `js/router.js`.

## Deploy on Vercel (free)

Frontend and backend are two separate Vercel projects from this one repository. Neon holds the data and the uploaded files.

```
browser ──▶ paperpeer (frontend, static) ──/api/*──▶ paperpeer-api (backend, serverless) ──▶ Neon Postgres
```

The frontend forwards `/api/*` to the backend, so the browser sees one site: login cookies and the security policy work without CORS.

**1. Database.** Create a free project at [neon.tech](https://neon.tech). Copy the **pooled** connection string (its host contains `-pooler`).

**2. Backend project.** On Vercel: *Add New → Project*, import this repository.
- Project name: `paperpeer-api`
- Root Directory: `backend`
- Environment variable: `DATABASE_URL` = the Neon string
- Deploy. Tables are created on the first request. Check `https://paperpeer-api.vercel.app/api/me` returns `{"error":...}` JSON (401 is correct: not logged in).

**3. Frontend project.** Import the same repository again.
- Project name: `paperpeer`
- Root Directory: `frontend`
- No environment variables. If the backend got a different address than `paperpeer-api.vercel.app`, edit the `destination` in `frontend/vercel.json` first.
- Deploy, then open `https://paperpeer.vercel.app`.

**4. Demo data (optional).** From your computer: `DATABASE_URL="<neon string>" npm run seed`. Never run it on a database with real schools.

Pushing to the repository redeploys both projects.

**Limits on the free setup.** Each upload request must be under 4.5 MB, so the app sends files in batches and refuses single files over 4 MB (phone photos are shrunk first, so this mostly affects large PDFs). Neon's free tier has 0.5 GB, roughly 500 to 1,000 photographed answer pages. When that gets tight, move file bytes to object storage such as Cloudflare R2 or Vercel Blob; only `src/lib/storage.js` changes. The first request after a quiet spell takes a second or two while Vercel and Neon wake up.

## Going live

Set these environment variables:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Secure cookies and HSTS. Requires HTTPS. |
| `PORT` | Backend port. Default `3000`. |
| `SERVE_FRONTEND=1` | Serve the frontend from the backend, so one server and one port are enough. |
| `FRONTEND_PORT` | Port of the separate frontend server. Default `5173`. |
| `BACKEND_URL` | Where that frontend server finds the backend. Default `http://127.0.0.1:3000`. |
| `DATABASE_URL` | Postgres connection string. Required for a live deployment. |
| `DB_POOL_MAX` | Database connections per server process. Default `10`. |
| `DATA_DIR` | Where uploads live, plus the embedded database if `DATABASE_URL` is empty. Default `./data`. |
| `STORAGE` | `db` keeps uploaded files in Postgres, `disk` in `DATA_DIR`. Default `db` when `DATABASE_URL` is set. |
| `TRUST_PROXY=1` | Set when running behind one reverse proxy, so login limits see real client addresses. |

Back up `DATA_DIR`, since it holds every uploaded file. The host's disk must survive restarts and deploys, which many free hosts do not offer. To run several servers, move uploads to shared file storage and the in-memory login limiter to a shared store.
