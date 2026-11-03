export class Safe {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const toHtml = (value) => {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(value);
};

// Every interpolated value is escaped unless it is itself the result of html``.
export function html(strings, ...values) {
  return new Safe(strings.reduce((out, part, i) => out + part + (i < values.length ? toHtml(values[i]) : ''), ''));
}
