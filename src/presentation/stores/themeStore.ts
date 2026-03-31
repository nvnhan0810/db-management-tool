import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const THEME_KEY = 'theme';

function getInitialTheme(): boolean {
  // App uses a fixed dark theme (black background, white text).
  // Keep the key for backward compatibility, but always start in dark mode.
  return true;
}

function applyTheme(_isDark: boolean) {
  const html = document.documentElement;
  // Force dark theme regardless of the flag to avoid any accidental light mode.
  html.classList.add('dark');
  html.setAttribute('data-theme', 'dark');
  localStorage.setItem(THEME_KEY, 'dark');
}

export const useThemeStore = defineStore('theme', () => {
  const isDarkMode = ref(getInitialTheme());

  watch(
    isDarkMode,
    (val) => {
      localStorage.setItem(THEME_KEY, val ? 'dark' : 'light');
      applyTheme(val);
    },
    { immediate: true }
  );

  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value;
  };

  const setTheme = (theme: 'dark' | 'light') => {
    isDarkMode.value = theme === 'dark';
  };

  return {
    isDarkMode,
    toggleTheme,
    setTheme,
    applyTheme: () => applyTheme(isDarkMode.value),
  };
});
