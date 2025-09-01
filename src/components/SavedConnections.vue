<template>
  <div class="saved-connections">
    <div class="header">
      <h3>Saved Connections</h3>
      <el-button 
        v-if="hasConnections" 
        size="small" 
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show Less' : 'Show All' }}
      </el-button>
    </div>
    
    <div v-if="isLoading" class="loading">
      <el-skeleton :rows="3" animated />
    </div>
    
    <div v-else-if="hasConnections" class="connections-list">
      <div 
        v-for="connection in displayedConnections" 
        :key="connection.id"
        class="connection-item"
        @click="loadConnection(connection)"
      >
        <div class="connection-info">
          <div class="connection-name">{{ connection.name }}</div>
          <div class="connection-details">
            {{ connection.host }} {{ connection.database ? ` - ${connection.database}` : '' }}
          </div>
        </div>
        <div class="connection-actions">
          <el-button 
            size="small" 
            type="danger" 
            @click.stop="deleteConnection(connection.id)"
          >
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    
    <div v-else class="no-connections">
      <el-empty description="No saved connections" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSavedConnections } from '../composables/useSavedConnections';
import type { SavedConnection } from '../services/storage';

const props = defineProps<{
  onLoadConnection: (connection: any) => void;
  refreshKey?: number; // Add this to force refresh
}>();

const { 
  savedConnections, 
  isLoading, 
  hasConnections, 
  loadSavedConnections,
  deleteConnection: deleteSavedConnection 
} = useSavedConnections();

// Load saved connections on mount and when refreshKey changes
onMounted(() => {
  loadSavedConnections();
});

// Watch for refreshKey changes to reload
watch(() => props.refreshKey, (newKey) => {
  if (newKey) {
    loadSavedConnections();
  }
});

const showAll = ref(false);

const displayedConnections = computed(() => {
  if (showAll.value) {
    return savedConnections.value;
  }
  return savedConnections.value.slice(0, 3);
});

const loadConnection = (savedConnection: SavedConnection) => {
  props.onLoadConnection(savedConnection);
};

const deleteConnection = async (connectionId: string) => {
  try {
    await deleteSavedConnection(connectionId);
  } catch (err) {
    console.error('Failed to delete connection:', err);
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  
  if (diffInHours < 24) {
    return `${Math.floor(diffInHours)} hours ago`;
  } else if (diffInHours < 168) { // 7 days
    return `${Math.floor(diffInHours / 24)} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};
</script>

<style scoped>
.saved-connections {
  margin-bottom: 2rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.header h3 {
  margin: 0;
  color: var(--el-text-color-primary);
}

.loading {
  padding: 1rem 0;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
}

.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background-color: var(--el-bg-color);
}

.connection-item:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Dark mode styles for saved connections */
.dark .connection-item {
  background-color: #2d3748 !important;
  border-color: #4a5568 !important;
  color: #f7fafc !important;
}

.dark .connection-item:hover {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.dark .connection-name {
  color: #f7fafc !important;
}

.dark .connection-details {
  color: #a0aec0 !important;
}

.dark .header h3 {
  color: #f7fafc !important;
}

.connection-info {
  flex: 1;
}

.connection-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 0.25rem;
}

.connection-details {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
}

.connection-actions {
  margin-left: 1rem;
}

.no-connections {
  padding: 2rem 0;
}
</style>
