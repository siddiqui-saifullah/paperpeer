export const formatDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const percent = (marks: number, max: number) => Math.round((marks / max) * 100);

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Browser storage for per-device conveniences (theme, last tab). Never required. */
export const store = {
  get(key: string): string {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* optional convenience */
    }
  },
};
