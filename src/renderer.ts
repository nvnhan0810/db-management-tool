import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { useThemeStore } from './presentation/stores/themeStore';
import { useConnectionsStore } from './presentation/stores/connectionsStore';
import './styles/theme-black.css';
import './styles/index.scss';

const initTheme = () => {
  const saved = localStorage.getItem('theme');
  const isDark =
    saved === 'dark' ||
    (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const html = document.documentElement;
  if (isDark) {
    html.classList.add('dark');
    html.setAttribute('data-theme', 'dark');
  } else {
    html.classList.remove('dark');
    html.setAttribute('data-theme', 'light');
  }
};
initTheme();

window.addEventListener('beforeunload', (e) => {
  const hasState = localStorage.getItem('connectionsState');
  if (hasState) {
    e.preventDefault();
    e.returnValue = 'You have active database connections. Are you sure you want to leave?';
    return e.returnValue;
  }
});

const app = createApp(App);
const pinia = createPinia();

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus);

app.mount('#app');

// Initialize stores after mount (Pinia must be installed first)
const themeStore = useThemeStore();
themeStore.applyTheme();

const connectionsStore = useConnectionsStore();
connectionsStore.initialize();
