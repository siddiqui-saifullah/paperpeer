import { useEffect, useState } from 'react';
import { currentTheme, type Theme } from '../lib/theme';

export function useTheme(): Theme {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    const update = () => setTheme(currentTheme());
    window.addEventListener('themechange', update);
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => {
      window.removeEventListener('themechange', update);
      media.removeEventListener('change', update);
    };
  }, []);
  return theme;
}
