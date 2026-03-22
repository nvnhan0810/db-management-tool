<template>
  <el-dialog
    v-model="visible"
    title="Saved Connections"
    width="480px"
    :close-on-click-modal="true"
    class="saved-connections-modal"
    @close="handleClose"
  >
    <div class="modal-body">
      <div v-if="isLoading" class="loading">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="hasConnections" class="connections-list">
        <div
          v-for="connection in savedConnections"
          :key="connection.id"
          class="connection-item"
          @click="handleSelect(connection)"
        >
          <div class="connection-info">
            <div class="connection-name">{{ connection.name }}</div>
            <div class="connection-details">
              {{ connection.host }}{{ connection.database ? ` · ${connection.database}` : '' }}
            </div>
          </div>
          <el-icon class="connection-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <div v-else class="no-connections">
        <el-empty description="No saved connections">
          <el-button type="primary" @click="handleNewConnection">New Connection</el-button>
        </el-empty>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <el-button type="primary" @click="handleNewConnection">
          <el-icon><Plus /></el-icon>
          New Connection
        </el-button>
        <el-button @click="visible = false">Cancel</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { ArrowRight, Plus } from '@element-plus/icons-vue';
import { computed, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'new-connection': [];
  'select': [connection: SavedConnection];
}>();

const connectionsStore = useConnectionsStore();
const savedConnections = computed(() => connectionsStore.connections);
const isLoading = computed(() => connectionsStore.isLoading);
const hasConnections = computed(() => connectionsStore.hasConnections);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

watch(visible, (open) => {
  if (open) {
    connectionsStore.loadSavedConnections();
  }
});

const handleClose = () => {
  visible.value = false;
};

const handleNewConnection = () => {
  emit('new-connection');
  visible.value = false;
};

const handleSelect = (connection: SavedConnection) => {
  emit('select', connection);
};
</script>

<style scoped lang="scss">
.modal-body {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.loading {
  padding: 1rem 0;
}

.connections-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.connection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background-color: var(--el-bg-color);
}

.connection-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  background-color: var(--el-bg-color);
}

.connection-item:hover .connection-name,
.connection-item:hover .connection-details,
.connection-item:hover .connection-arrow {
  color: inherit;
}

.connection-info {
  flex: 1;
  min-width: 0;
}

.connection-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 0.25rem;
}

.connection-details {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.connection-arrow {
  color: var(--el-text-color-placeholder);
  margin-left: 0.5rem;
}

.no-connections {
  padding: 2rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
