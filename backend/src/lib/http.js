export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const forbidden = (msg = 'You do not have access to this.') => new HttpError(403, msg);
// Used for anything outside the caller's school or visibility, so that a
// response never confirms that another tenant's record exists.
export const notFound = (msg = 'Not found.') => new HttpError(404, msg);

export function str(value, label, { max = 200, min = 1, optional = false } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    if (optional) return '';
    throw badRequest(`${label} is required.`);
  }
  if (text.length < min) throw badRequest(`${label} must be at least ${min} characters.`);
  if (text.length > max) throw badRequest(`${label} must be at most ${max} characters.`);
  return text;
}

export function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647) throw notFound();
  return n;
}

export function bool(value) {
  return value ? 1 : 0;
}
