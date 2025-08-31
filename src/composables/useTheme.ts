import { onMounted, ref } from 'vue';

// Global theme state
const isDarkMode = ref(false);

// Initialize theme on module load
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme');
  isDarkMode.value = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme();
};

const applyTheme = () => {
  const html = document.documentElement;
  if (isDarkMode.value) {
    html.classList.add('dark');
    html.setAttribute('data-theme', 'dark');
  } else {
    html.classList.remove('dark');
    html.setAttribute('data-theme', 'light');
  }
};

// Initialize theme immediately
initTheme();

export function useTheme() {
  const toggleTheme = () => {
    isDarkMode.value = !isDarkMode.value;
    localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light');
    applyTheme();
  };

  const setTheme = (theme: 'dark' | 'light') => {
    isDarkMode.value = theme === 'dark';
    localStorage.setItem('theme', theme);
    applyTheme();
  };

  onMounted(() => {
    // Listen for theme changes from other components
    window.addEventListener('storage', (e) => {
      if (e.key === 'theme') {
        isDarkMode.value = e.newValue === 'dark';
        applyTheme();
      }
    });
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        isDarkMode.value = e.matches;
        applyTheme();
      }
    });
  });

  return {
    isDarkMode,
    toggleTheme,
    setTheme,
    applyTheme
  };
}
