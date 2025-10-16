<template>
  <div class="custom-title-bar" :class="{ macos: isMacOS, windows: !isMacOS }">
    <div class="left-custom-title-bar">
      <!-- macOS Traffic Light Buttons (left side) -->
      <div v-if="isMacOS" class="macos-traffic-lights">
        <div class="traffic-light close" @click="closeWindow">
          <div class="traffic-light-button"></div>
        </div>
        <div class="traffic-light minimize" @click="minimizeWindow">
          <div class="traffic-light-button"></div>
        </div>
        <div class="traffic-light maximize" @click="maximizeWindow">
          <div class="traffic-light-button"></div>
        </div>
      </div>

      <!-- Left side - Navigation tabs -->
      <div class="title-bar-left" v-if="connectionStore.activeConnection">
        <div class="nav-tabs">
          <el-tooltip content="New Connection" placement="bottom">
            <div class="nav-tab" @click="$emit('new-connection')">
              <el-icon>
                <Link />
              </el-icon>
            </div>
          </el-tooltip>

          <el-tooltip content="Disconnect" placement="bottom">
            <div class="nav-tab" @click="$emit('disconnect')">
              <el-icon>
                <SwitchButton />
              </el-icon>
            </div>
          </el-tooltip>

          <el-tooltip content="Select Database" placement="bottom">
            <div class="nav-tab" @click="$emit('select-database')">
              <el-icon>
                <Folder />
              </el-icon>
            </div>
          </el-tooltip>

          <!-- Divider -->
          <div class="nav-divider"></div>

          <!-- Action buttons -->
          <el-tooltip content="New Query" placement="bottom">
            <div class="nav-tab" @click="$emit('add-query')">
              <el-icon>
                <Edit />
              </el-icon>
            </div>
          </el-tooltip>
        </div>
      </div>
    </div>

    <!-- Center - App title -->
    <div class="title-bar-center">
      <div class="app-title">
        <div class="app-icon">
          <el-icon>
            <Monitor />
          </el-icon>
        </div>
        <div class="app-info">
          <span v-if="connectionStore.activeConnection" class="connection-info">
            {{ connectionStore.activeConnection.name || connectionStore.activeConnection.host }}
          </span>
          <span v-else class="app-name">Database Client</span>
        </div>
      </div>
    </div>

    <!-- Right side - Window controls and theme toggle -->
    <div class="title-bar-right">
      <!-- Sidebar toggle button -->
      <!-- <el-button size="small" class="control-btn sidebar-toggle" @click="handleSidebarToggle">
        <el-icon>
          <component :is="sidebarVisible ? 'Hide' : 'View'" />
        </el-icon>
      </el-button> -->

      <!-- Theme toggle button (always visible) -->
      <el-button size="small" class="control-btn theme-toggle" @click="handleThemeToggle">
        <el-icon>
          <component :is="isDarkMode ? 'Sunny' : 'Moon'" />
        </el-icon>
      </el-button>

      <!-- Windows-style Window controls (hidden on macOS) -->
      <div v-if="!isMacOS" class="window-controls">
        <el-button size="small" class="control-btn minimize" @click="minimizeWindow">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>
        <el-button size="small" class="control-btn maximize" @click="maximizeWindow">
          <el-icon>
            <FullScreen />
          </el-icon>
        </el-button>
        <el-button size="small" class="control-btn close" @click="closeWindow">
          <el-icon>
            <Close />
          </el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Close,
  Edit,
  Folder,
  FullScreen,
  Link,
  Minus,
  Monitor,
  SwitchButton
} from '@element-plus/icons-vue';
import { onMounted, ref } from 'vue';
import { useTheme } from '../composables/useTheme';
import { useConnectionStore } from '@/stores/connectionStore';

const connectionStore = useConnectionStore();


// const props = defineProps<{
//   currentConnection: ActiveConnection | null;
//   activeTab?: string;
//   sidebarVisible?: boolean;
// }>();

// const emit = defineEmits<{
//   'tab-change': [tabId: string];
//   'add-query': [];
//   'new-connection': [];
//   'disconnect': [];
//   'select-database': [];
//   'toggle-sidebar': [];
// }>();

// Platform detection
const isMacOS = ref(false);

// Use global theme composable
const { isDarkMode, toggleTheme } = useTheme();

onMounted(() => {
  isMacOS.value = navigator.platform.toLowerCase().includes('mac');
});

const handleThemeToggle = () => {
  toggleTheme();
};

// const handleSidebarToggle = () => {
//   emit('toggle-sidebar');
// };



// Window control methods
const minimizeWindow = () => {
  if (window.electron) {
    window.electron.invoke('window:minimize', {});
  }
};

const maximizeWindow = () => {
  if (window.electron) {
    window.electron.invoke('window:maximize', {});
  }
};

const closeWindow = () => {
  if (window.electron) {
    window.electron.invoke('window:close', {});
  }
};
</script>

<style scoped lang="scss">
@use '@/sass/components/custom-title-bar.scss' as *;
</style>
