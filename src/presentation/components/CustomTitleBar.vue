<template>
  <div class="custom-title-bar" :class="{ macos: isMacOS, windows: !isMacOS }">
    <div class="left-custom-title-bar">
      <!-- macOS Traffic Light Buttons (left side) -->
      <div v-if="isMacOS" class="macos-traffic-lights">
        <div class="traffic-light close" @click.stop="closeWindow">
          <div class="traffic-light-button"></div>
        </div>
        <div class="traffic-light minimize" @click.stop="minimizeWindow">
          <div class="traffic-light-button"></div>
        </div>
        <div class="traffic-light maximize" @click.stop="maximizeWindow">
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

    <!-- Right side - Window controls -->
    <div class="title-bar-right">
      <!-- Tables list (left schema sidebar) -->
      <el-tooltip
        v-if="hasActiveConnection"
        :content="
          tablesListSidebarOpen
            ? 'Tables list: visible (drag splitter to resize)'
            : 'Tables list: hidden'
        "
        placement="bottom"
      >
        <el-button
          size="small"
          class="control-btn sidebar-toggle"
          @click="handleTablesListSidebarToggle"
        >
          <span
            class="codicon row-detail-sidebar-codicon"
            :class="
              tablesListSidebarOpen
                ? 'codicon-layout-sidebar-left'
                : 'codicon-layout-sidebar-left-off'
            "
            aria-hidden="true"
          />
        </el-button>
      </el-tooltip>

      <!-- Bottom SQL history panel toggle -->
      <el-tooltip
        v-if="hasActiveConnection"
        :content="sqlHistoryPanelOpen ? 'SQL history: open' : 'SQL history: closed'"
        placement="bottom"
      >
        <el-button
          size="small"
          class="control-btn sidebar-toggle"
          @click="handleSqlHistoryToggle"
        >
          <span
            class="codicon codicon-layout-panel row-detail-sidebar-codicon"
            aria-hidden="true"
          />
        </el-button>
      </el-tooltip>

      <!-- Row/cell detail panel: when on, clicking a data row opens the right sidebar (default: on) -->
      <el-tooltip
        v-if="hasActiveConnection"
        :content="
          rowDetailPanelEnabled
            ? 'Row detail panel: on (click row to show)'
            : 'Row detail panel: off (click row will not open panel)'
        "
        placement="bottom"
      >
        <el-button
          size="small"
          class="control-btn sidebar-toggle"
          @click="handleRowDetailPanelToggle"
        >
          <span
            class="codicon codicon-layout-sidebar-right row-detail-sidebar-codicon"
            aria-hidden="true"
          />
        </el-button>
      </el-tooltip>

      <!-- Windows-style Window controls (hidden on macOS) -->
      <div v-if="!isMacOS" class="window-controls">
        <el-button size="small" class="control-btn minimize" @click.stop="minimizeWindow">
          <el-icon>
            <Minus />
          </el-icon>
        </el-button>
        <el-button size="small" class="control-btn maximize" @click.stop="maximizeWindow">
          <el-icon>
            <FullScreen />
          </el-icon>
        </el-button>
        <el-button size="small" class="control-btn close" @click.stop="closeWindow">
          <el-icon>
            <Close />
          </el-icon>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
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
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const connectionStore = useConnectionStore();
const connectionsStore = useConnectionsStore();
const { disconnect } = useDatabase();
const { rowDetailPanelEnabled, sqlHistoryPanelOpen, tablesListSidebarOpen } = storeToRefs(connectionStore);
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

// Computed properties
const hasActiveConnection = computed(() => {
  // Check saved “pointer” (e.g. connecting from home)
  if (connectionsStore.activeConnection) {
    return true;
  }

  // Workspace tabs
  return connectionStore.activeConnections.length > 0;
});

const currentConnectionName = computed(() => {
  if (connectionsStore.activeConnection) {
    return connectionsStore.activeConnection.name || connectionsStore.activeConnection.host;
  }
  if (connectionStore.currentConnection) {
    return connectionStore.currentConnection.name || connectionStore.currentConnection.host;
  }
  return null;
});

const activeConnectionId = computed(() => {
  return connectionsStore.activeConnection?.id ?? connectionStore.currentConnection?.id ?? null;
});

onMounted(() => {
  isMacOS.value = navigator.platform.toLowerCase().includes('mac');
});

// Handle disconnect
const handleDisconnect = async () => {
  try {
    // When we have workspace tabs, disconnect current tab only; do NOT navigate.
    // Navigation to home is handled by watch() when activeConnections.length becomes 0.
    if (connectionStore.activeConnections.length > 0) {
      const currentConnection = connectionStore.currentConnection;
      if (currentConnection?.tabId) {
        await connectionStore.removeConnection(currentConnection.tabId);
        // success: no toast
      }
      emit('disconnect');
      return;
    }

    // Single connection (from Home or last one): clear saved pointer and navigate to home
    const connId = activeConnectionId.value;
    if (connectionsStore.activeConnection && connId) {
      await disconnect(connId);
      connectionsStore.setActiveConnection(null);
      connectionsStore.setConnectionStatus(false);

      const connectionInStore = connectionStore.activeConnections.find(
        conn => conn.id === connId
      );
      if (connectionInStore?.tabId) {
        await connectionStore.removeConnection(connectionInStore.tabId);
      }

      // success: no toast

      if (router.currentRoute.value.name === 'workspace') {
        router.push({ name: 'home' });
      }
    }

    emit('disconnect');
  } catch (error) {
    console.error('Error disconnecting:', error);
    await showErrorDialog({
      title: 'Disconnect failed',
      message: error instanceof Error ? error.message : 'Failed to disconnect',
      details: error instanceof Error ? error.stack : undefined,
    });
  }
};

// Watch for when all connections are removed and navigate to home
watch(
  () => connectionStore.activeConnections.length,
  (newLength: number, oldLength: number) => {
    // Only navigate if we're in workspace and all connections are gone
    if (newLength === 0 && oldLength > 0 && router.currentRoute.value.name === 'workspace') {
      router.push({ name: 'home' });
    }
  }
);

const handleRowDetailPanelToggle = () => {
  connectionStore.toggleRowDetailPanel();
};

const handleSqlHistoryToggle = () => {
  connectionStore.toggleSqlHistoryPanel();
};

const handleTablesListSidebarToggle = () => {
  connectionStore.toggleTablesListSidebar();
};



// Window control methods
const minimizeWindow = async () => {
  try {
    if (window.electron) {
      await window.electron.invoke('window:minimize', {});
    } else {
      console.error('window.electron is not available');
    }
  } catch (error) {
    console.error('Error minimizing window:', error);
  }
};

const maximizeWindow = async () => {
  try {
    if (window.electron) {
      await window.electron.invoke('window:maximize', {});
    } else {
      console.error('window.electron is not available');
    }
  } catch (error) {
    console.error('Error maximizing window:', error);
  }
};

const closeWindow = async (event?: Event) => {
  try {
    // Prevent any default behavior
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (window.electron) {
      const result = await window.electron.invoke('window:close', {});
    } else {
      console.error('window.electron is not available');
    }
  } catch (error) {
    console.error('Error closing window:', error);
  }
};
</script>

<style scoped lang="scss">
@use '@/styles/components/custom-title-bar.scss' as *;

.row-detail-sidebar-codicon {
  font-size: 16px;
  line-height: 1;
  vertical-align: -0.125em;
  color: inherit;
}
</style>
