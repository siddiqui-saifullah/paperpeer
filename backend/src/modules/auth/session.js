import { randomToken, sha256 } from '../../lib/crypto.js';

const SESSION_DAYS = 7;
const COOKIE = 'pp_session';

function readCookie(req) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

// Sessions live in the database, and only a hash of each token is stored.
export function sessionStore(db, { secureCookies }) {
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: '/' };

  const lookup = db.prepare(`
    SELECT u.id, u.school_id, u.role, u.name, u.username, u.class_id, u.roll_no,
           u.must_change_password, s.name AS school_name, s.code AS school_code
    FROM sessions x
    JOIN users u ON u.id = x.user_id AND u.school_id = x.school_id
    JOIN schools s ON s.id = u.school_id
    WHERE x.token_hash = ? AND x.expires_at > ? AND u.active = 1
  `);

  return {
    async start(res, user) {
      const token = randomToken();
      const maxAge = SESSION_DAYS * 86400_000;
      await db.prepare('INSERT INTO sessions (token_hash, school_id, user_id, expires_at) VALUES (?, ?, ?, ?)')
        .run(sha256(token), user.school_id, user.id, Date.now() + maxAge);
      await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
      res.cookie(COOKIE, token, { ...cookieOptions, maxAge });
    },

    async end(req, res) {
      const token = readCookie(req);
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
      res.clearCookie(COOKIE, cookieOptions);
    },

    revokeOthers(req, user) {
      return db.prepare('DELETE FROM sessions WHERE school_id = ? AND user_id = ? AND token_hash <> ?')
        .run(user.school_id, user.id, sha256(readCookie(req) || ''));
    },

    revokeAll(schoolId, userId) {
      return db.prepare('DELETE FROM sessions WHERE school_id = ? AND user_id = ?').run(schoolId, userId);
    },

    async attach(req, _res, next) {
      const token = readCookie(req);
      req.user = token ? (await lookup.get(sha256(token), Date.now())) || null : null;
      next();
    },
  };
}
