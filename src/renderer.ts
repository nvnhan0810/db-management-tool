import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '@vscode/codicons/dist/codicon.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { useConnectionsStore } from './presentation/stores/connectionsStore';
import { applyDarkTheme } from './presentation/utils/applyDarkTheme';
import './styles/theme-black.css';
import './styles/index.scss';

applyDarkTheme();

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

const connectionsStore = useConnectionsStore();
connectionsStore.initialize();
