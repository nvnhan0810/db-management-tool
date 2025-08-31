<template>
  <div class="connection-tabs">
    <div class="tabs-header">
      <el-button 
        size="small" 
        type="primary" 
        @click="$emit('new-connection')"
      >
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>
    
    <div v-if="!hasConnections" class="no-connections">
      <el-empty description="No active connections" />
    </div>
    
    <div v-else class="tabs-list">
      <div 
        v-for="(connection, index) in sortedConnections" 
        :key="connection.tabId"
        class="tab-item"
        :class="{ 
          'active': connection.tabId === currentTabId,
          'connected': connection.isConnected 
        }"
        @click="$emit('switch-tab', connection.tabId)"
      >
        <div class="tab-content">
          <div class="tab-name">
            {{ connection.name || `Connection ${index + 1}` }}
          </div>
          <div class="tab-status">
            <span 
              class="status-indicator"
              :class="{ 'connected': connection.isConnected }"
            ></span>
          </div>
        </div>
        <div class="tab-actions">
          <el-button 
            size="small" 
            type="danger" 
            @click.stop="$emit('close-tab', connection.tabId)"
          >
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, Plus } from '@element-plus/icons-vue';
import type { ActiveConnection } from '../composables/useConnections';

defineProps<{
  connections: ActiveConnection[];
  currentTabId: string | null;
  hasConnections: boolean;
  sortedConnections: ActiveConnection[];
}>();

defineEmits<{
  'new-connection': [];
  'switch-tab': [tabId: string];
  'close-tab': [tabId: string];
}>();
</script>

<style scoped>
.connection-tabs {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs-header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0.5rem;
  border-bottom: 1px solid var(--el-border-color);
}

.no-connections {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.tabs-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.tab-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* padding: 0.5rem;
  margin-bottom: 0.25rem; */
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--el-bg-color);
}

.tab-item:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.tab-item.active {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-8);
}

.tab-item.connected {
  border-left: 3px solid var(--el-color-success);
}

.tab-content {
  flex: 1;
  min-width: 0;
}

.tab-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-details {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--el-color-danger);
  transition: background-color 0.2s ease;
}

.status-indicator.connected {
  background-color: var(--el-color-success);
}

.tab-actions {
  margin-left: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tab-item:hover .tab-actions {
  opacity: 1;
}

.tab-item.active .tab-actions {
  opacity: 1;
}
</style>
