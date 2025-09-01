<template>
  <div class="connection-tabs">
    <!-- Show database list when connected and has database -->
    <DatabaseList
      v-if="hasConnections && currentConnection && currentConnection.database"
      :databases="selectedDatabases"
      :active-database="currentConnection.database"
      :connection-id="currentConnection.id"
      @select-database="handleSelectDatabase"
      @add-database="handleAddDatabase"
      @disconnect-database="handleDisconnectDatabase"
    />
    
    <!-- Show no database selected state when connected but no database -->
    <div v-else-if="hasConnections && currentConnection && !currentConnection.database" class="no-database">
      <div class="no-database-content">
        <el-icon :size="48" class="database-icon">
          <Folder />
        </el-icon>
        <h4>No Database Selected</h4>
        <p>You're connected but haven't selected a database yet.</p>
        <el-button type="primary" @click="handleSelectDatabase('')">
          Select Database
        </el-button>
      </div>
    </div>
    
    <!-- Show empty state when no connections -->
    <div v-else class="no-connections">
      <el-empty description="No active connections" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder } from '@element-plus/icons-vue';
import { computed } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';
import DatabaseList from './DatabaseList.vue';

const props = defineProps<{
  connections: ActiveConnection[];
  currentTabId: string | null;
  hasConnections: boolean;
  selectedDatabases?: Array<{ name: string; tableCount: number; isConnected: boolean }>;
}>();

const emit = defineEmits<{
  'select-database': [databaseName: string];
  'add-database': [databaseName: string];
  'disconnect-database': [databaseName: string];
}>();

// Get current connection
const currentConnection = computed(() => {
  if (!props.currentTabId) return null;
  return props.connections.find(conn => conn.tabId === props.currentTabId);
});

// Use selectedDatabases from props or default empty array
const selectedDatabases = computed(() => {
  return props.selectedDatabases || [];
});

// Database handlers
const handleSelectDatabase = (databaseName: string) => {
  emit('select-database', databaseName);
};

const handleAddDatabase = (databaseName: string) => {
  emit('add-database', databaseName);
};

const handleDisconnectDatabase = (databaseName: string) => {
  emit('disconnect-database', databaseName);
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

.no-database {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.no-database-content {
  text-align: center;
  color: var(--el-text-color-regular);
}

.no-database-content h4 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
}

.no-database-content p {
  margin: 0 0 1.5rem 0;
  color: var(--el-text-color-secondary);
  font-size: 0.875rem;
}

.database-icon {
  color: var(--el-text-color-placeholder);
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
