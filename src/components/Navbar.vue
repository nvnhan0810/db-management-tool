<template>
  <nav class="navbar">
    <div class="navbar-brand">
      <div class="brand-icon">
        <el-icon><Monitor /></el-icon>
      </div>
      <div class="brand-text">
        <h1>Database Client</h1>
        <span v-if="currentConnection" class="connection-status">
          Connected to {{ currentConnection.name || currentConnection.host }}
        </span>
      </div>
    </div>
    
    <div class="navbar-menu">
      <div class="nav-items">
        <div 
          v-for="item in navItems" 
          :key="item.id"
          class="nav-item"
          :class="{ active: activeNav === item.id }"
          @click="$emit('nav-change', item.id)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </div>
      </div>
    </div>
    
    <div class="navbar-actions">
      <el-button 
        size="small" 
        type="primary" 
        @click="$emit('new-connection')"
      >
        <el-icon><Plus /></el-icon>
        New Connection
      </el-button>
      
      <el-dropdown @command="handleCommand">
        <el-button size="small">
          <el-icon><Setting /></el-icon>
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="settings">Settings</el-dropdown-item>
            <el-dropdown-item command="about">About</el-dropdown-item>
            <el-dropdown-item divided command="quit">Quit</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </nav>
</template>

<script setup lang="ts">
import {
    ArrowDown,
    Monitor,
    Plus,
    Setting
} from '@element-plus/icons-vue';
import { computed } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

const props = defineProps<{
  currentConnection: ActiveConnection | null;
  activeNav?: string;
}>();

const emit = defineEmits<{
  'nav-change': [navId: string];
  'new-connection': [];
}>();

// Navigation items
const navItems = computed<NavItem[]>(() => [
  {
    id: 'home',
    label: 'Home',
    icon: 'HomeFilled'
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: 'Connection'
  },
  {
    id: 'query',
    label: 'Query',
    icon: 'Document'
  }
]);

const handleCommand = (command: string) => {
  switch (command) {
    case 'settings':
      emit('nav-change', 'settings');
      break;
    case 'about':
      // Handle about
      break;
    case 'quit':
      if (window.electron) {
        window.electron.invoke('app:quit', {});
      }
      break;
  }
};
</script>

<style scoped>
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  display: flex;
  align-items: center;
  font-size: 24px;
}

.brand-text h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.connection-status {
  font-size: 12px;
  opacity: 0.8;
}

.navbar-menu {
  flex: 1;
  display: flex;
  justify-content: center;
}

.nav-items {
  display: flex;
  gap: 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  background-color: rgba(255, 255, 255, 0.2);
  font-weight: 600;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .navbar {
    background: linear-gradient(135deg, #2d3748 0%, #4a5568 100%);
  }
}
</style>
