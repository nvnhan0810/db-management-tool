<template>
  <div class="connection-tabs">
    <div v-if="!hasConnections" class="no-connections">
      <el-empty description="No active connections" />
    </div>
    
    <div v-else class="connections-grid">
      <div 
        v-for="(connection, index) in connections" 
        :key="connection.tabId"
        class="connection-card"
        :class="{ 
          'active': connection.tabId === currentTabId,
          'connected': connection.isConnected 
        }"
        @click="$emit('switch-tab', connection.tabId)"
        @contextmenu.prevent="showContextMenu($event, connection)"
      >
        <div class="connection-icon">
          <el-icon :size="20">
            <Connection />
          </el-icon>
          <div 
            class="status-dot"
            :class="{ 'connected': connection.isConnected }"
          ></div>
        </div>
        <div class="connection-name">
          {{ connection.name || `Connection ${index + 1}` }}
        </div>
        <div class="connection-details">
          {{ connection.database }}
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <el-dropdown 
      ref="contextMenuRef"
      trigger="contextmenu"
      :visible="contextMenuVisible"
      @visible-change="handleContextMenuVisibleChange"
      placement="bottom-start"
    >
      <span class="context-menu-trigger"></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="closeConnection" divided>
            <el-icon><Close /></el-icon>
            <span>Close Connection</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { Close, Connection } from '@element-plus/icons-vue';
import { ref } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';

const props = defineProps<{
  connections: ActiveConnection[];
  currentTabId: string | null;
  hasConnections: boolean;
}>();

const emit = defineEmits<{
  'switch-tab': [tabId: string];
  'close-tab': [tabId: string];
}>();

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuRef = ref();
const selectedConnection = ref<ActiveConnection | null>(null);

const showContextMenu = (event: MouseEvent, connection: ActiveConnection) => {
  event.preventDefault();
  selectedConnection.value = connection;
  contextMenuVisible.value = true;
  
  // Position the context menu at the mouse position
  if (contextMenuRef.value) {
    const dropdown = contextMenuRef.value.$el;
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${event.clientX}px`;
    dropdown.style.top = `${event.clientY}px`;
    dropdown.style.zIndex = '9999';
  }
};

const handleContextMenuVisibleChange = (visible: boolean) => {
  contextMenuVisible.value = visible;
  if (!visible) {
    selectedConnection.value = null;
  }
};

const closeConnection = () => {
  if (selectedConnection.value) {
    emit('close-tab', selectedConnection.value.tabId);
    contextMenuVisible.value = false;
    selectedConnection.value = null;
  }
};
</script>

<style scoped>
.connection-tabs {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
}

.tabs-header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color-light);
}

.add-connection-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.no-connections {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.connections-grid {
  padding: 0.75rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  overflow-y: auto;
}

.connection-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 0.5rem;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--el-bg-color);
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  height: auto;
  max-width: 80px;
  margin: 0 auto;
}

.connection-card:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.connection-card.active {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-8);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
  transform: none;
  z-index: 1;
}

.connection-card.connected {
  border-left: 2px solid var(--el-color-success);
}

.connection-icon {
  position: relative;
  margin-bottom: 0.5rem;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
}



.status-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-danger);
  border: 1px solid var(--el-bg-color);
  transition: background-color 0.2s ease;
}

.status-dot.connected {
  background-color: var(--el-color-success);
}

.connection-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  text-align: center;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.1;
  word-break: break-word;
  max-width: 100%;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-details {
  font-size: 0.65rem;
  color: var(--el-text-color-secondary);
  text-align: center;
  flex-shrink: 0;
}

.context-menu-trigger {
  position: fixed;
  top: -1000px;
  left: -1000px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* Dark mode adjustments */
.dark .connection-card {
  background-color: #2d3748 !important;
  border-color: #4a5568 !important;
  color: #f7fafc !important;
}

.dark .connection-card:hover {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.dark .connection-card.active {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.dark .connection-name {
  color: #f7fafc !important;
}

.dark .connection-details {
  color: #a0aec0 !important;
}

.dark .connection-icon {
  color: #e2e8f0 !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .connections-grid {
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: 0.5rem;
  }
  
  .connection-card {
    width: 100%;
    height: auto;
    max-width: 70px;
    padding: 0.5rem 0.25rem;
  }
  
  .connection-name {
    font-size: 0.7rem;
  }
  
  .connection-details {
    font-size: 0.6rem;
  }
  
  .connection-icon .el-icon {
    font-size: 18px;
  }
}
</style>
