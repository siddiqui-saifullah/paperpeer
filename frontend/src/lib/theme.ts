import { store } from './format';

export type Theme = 'light' | 'dark';

export const currentTheme = (): Theme =>
  (document.documentElement.dataset.theme as Theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
  window.dispatchEvent(new Event('themechange'));
}

export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');

/** Applied before the first paint, so a saved theme never flashes the other one. */
export function applySavedTheme() {
  const saved = store.get('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}
