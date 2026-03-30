import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const THEME_KEY = 'theme';

function getInitialTheme(): boolean {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(isDark: boolean) {
  const html = document.documentElement;
  if (isDark) {
    html.classList.add('dark');
    html.setAttribute('data-theme', 'dark');
  } else {
    html.classList.remove('dark');
    html.setAttribute('data-theme', 'light');
  }
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
