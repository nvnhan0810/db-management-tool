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
      <div class="title-bar-left" v-if="hasActiveConnection">
        <div class="nav-tabs">
          <el-tooltip content="New Connection" placement="bottom">
            <div class="nav-tab" @click="$emit('new-connection')">
              <el-icon>
                <Link />
              </el-icon>
            </div>
          </el-tooltip>

          <el-tooltip content="Disconnect" placement="bottom">
            <div class="nav-tab" @click="handleDisconnect">
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
          <span v-if="currentConnectionName" class="connection-info">
            {{ currentConnectionName }}
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
import { useDatabase } from '@/composables/useDatabase';
import { useConnectionStore } from '@/stores/connectionStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
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
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useTheme } from '../composables/useTheme';

const connectionStore = useConnectionStore();
const connectionsStore = useConnectionsStore();
const { disconnect } = useDatabase();
const router = useRouter();


// Emit events for backward compatibility
const emit = defineEmits<{
  'tab-change': [tabId: string];
  'add-query': [];
  'new-connection': [];
  'disconnect': [];
  'select-database': [];
  'toggle-sidebar': [];
}>();

// Platform detection
const isMacOS = ref(false);

// Use global theme composable
const { isDarkMode, toggleTheme } = useTheme();

// Computed properties
const hasActiveConnection = computed(() => {
  // Check connectionStore first
  if (connectionStore.activeConnection) {
    return true;
  }

  // Check connectionsStore - if there are any active connections, show buttons
  return connectionsStore.activeConnections.length > 0;
});

const currentConnectionName = computed(() => {
  if (connectionStore.activeConnection) {
    return connectionStore.activeConnection.name || connectionStore.activeConnection.host;
  }
  if (connectionsStore.currentConnection) {
    return connectionsStore.currentConnection.name || connectionsStore.currentConnection.host;
  }
  return null;
});

onMounted(() => {
  isMacOS.value = navigator.platform.toLowerCase().includes('mac');
});

const handleThemeToggle = () => {
  toggleTheme();
};

// Handle disconnect
const handleDisconnect = async () => {
  try {
    // Check if we should disconnect from connectionStore or connectionsStore
    if (connectionStore.activeConnection) {
      // Disconnect from connectionStore
      const activeConnectionId = connectionStore.activeConnection.id;

      await disconnect();
      connectionStore.setActiveConnection(null);
      connectionStore.setConnectionStatus(false);

      // Also remove from connectionsStore if it exists there
      const connectionInStore = connectionsStore.activeConnections.find(
        conn => conn.id === activeConnectionId
      );
      if (connectionInStore?.tabId) {
        await connectionsStore.removeConnection(connectionInStore.tabId);
      }

      ElMessage.success('Disconnected successfully');

      // Navigate to home if we're in workspace
      if (router.currentRoute.value.name === 'workspace') {
        router.push({ name: 'home' });
      }
    } else if (connectionsStore.currentConnection) {
      // Disconnect from connectionsStore (workspace)
      const currentConnection = connectionsStore.currentConnection;
      if (currentConnection.tabId) {
        await connectionsStore.removeConnection(currentConnection.tabId);
        ElMessage.success('Disconnected successfully');
        // Navigation will be handled by watch() below
      }
    }

    // Also emit event for backward compatibility
    emit('disconnect');
  } catch (error) {
    console.error('Error disconnecting:', error);
    ElMessage.error('Failed to disconnect');
  }
};

// Watch for when all connections are removed and navigate to home
watch(
  () => connectionsStore.activeConnections.length,
  (newLength: number, oldLength: number) => {
    // Only navigate if we're in workspace and all connections are gone
    if (newLength === 0 && oldLength > 0 && router.currentRoute.value.name === 'workspace') {
      router.push({ name: 'home' });
    }
  }
);

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
