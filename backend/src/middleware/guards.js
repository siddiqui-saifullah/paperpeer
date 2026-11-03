import { HttpError, forbidden } from '../lib/http.js';

export const isStaff = (user) => user.role === 'admin' || user.role === 'teacher';

export function requireLogin(req, _res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in.');
  next();
}

export function requireUser(req, res, next) {
  requireLogin(req, res, () => {
    if (req.user.must_change_password) throw new HttpError(403, 'Please set a new password first.');
    next();
  });
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};

export const staffOnly = [requireUser, requireRole('admin', 'teacher')];
export const adminOnly = [requireUser, requireRole('admin')];
export const studentOnly = [requireUser, requireRole('student')];
