/** App is fixed to dark theme; sets <html> class and persists preference for any legacy readers. */
const THEME_STORAGE_KEY = 'theme';

export function applyDarkTheme(): void {
  const html = document.documentElement;
  html.classList.add('dark');
  html.classList.remove('light');
  html.setAttribute('data-theme', 'dark');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  } catch {
    /* ignore quota / private mode */
  }
}
