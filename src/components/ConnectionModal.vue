<template>
  <el-dialog
    v-model="visible"
    title="New Connection"
    width="800px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
  >
    <div class="connection-modal-content">
      <!-- Left side - Saved Connections -->
      <div class="saved-connections-panel">
        <h4>Saved Connections</h4>
        <div v-if="hasConnections" class="saved-list">
          <div 
            v-for="connection in recentConnections" 
            :key="connection.id"
            class="saved-item"
            @click="loadSavedConnection(connection)"
          >
            <div class="saved-info">
              <div class="saved-name">{{ connection.name }}</div>
              <div class="saved-details">
                {{ connection.type }} - {{ connection.host }}:{{ connection.port }}
              </div>
              <div class="saved-database">{{ connection.database }}</div>
            </div>
          </div>
        </div>
        <div v-else class="no-saved">
          <el-empty description="No saved connections" />
        </div>
      </div>

      <!-- Right side - Connection Form -->
      <div class="connection-form-panel">
        <h4>New Connection</h4>
        <el-form :model="form" label-width="120px">
          <el-form-item label="Connection Name">
            <el-input 
              v-model="form.name" 
              placeholder="Enter connection name"
            />
          </el-form-item>

          <el-form-item label="Database Type">
            <el-select v-model="form.type" placeholder="Select database type">
              <el-option label="MySQL" value="mysql" />
            </el-select>
          </el-form-item>

          <el-form-item label="Host">
            <el-input v-model="form.host" placeholder="localhost" />
          </el-form-item>

          <el-form-item label="Port">
            <el-input-number v-model="form.port" :min="1" :max="65535" />
          </el-form-item>

          <el-form-item label="Username">
            <el-input v-model="form.username" />
          </el-form-item>

          <el-form-item label="Password">
            <el-input v-model="form.password" type="password" />
          </el-form-item>

          <el-form-item label="Database">
            <el-input v-model="form.database" placeholder="Database name" />
          </el-form-item>
        </el-form>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <div v-if="connectionError" class="error-message">
          {{ connectionError }}
        </div>
        <div class="dialog-buttons">
          <el-button @click="handleCancel">Cancel</el-button>
          <el-button 
            type="primary" 
            @click="handleConnect"
            :loading="isConnecting"
            :disabled="!!connectionError"
          >
            {{ connectionError ? 'Fix Error' : 'Connect' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, reactive, ref, watch } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useSavedConnections } from '../composables/useSavedConnections';
import type { DatabaseConnection } from '../types';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'connection-created': [connection: DatabaseConnection, name: string];
}>();

const { connect, error: dbError } = useDatabase();
const { 
  hasConnections, 
  recentConnections, 
  getDecryptedConnection,
  loadSavedConnections
} = useSavedConnections();

const isConnecting = ref(false);
const connectionError = ref<string | null>(null);

const form = reactive<DatabaseConnection & { name?: string }>({
  id: crypto.randomUUID(),
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: '',
  password: '',
  database: '',
  name: '',
});

// Computed for dialog visibility
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

// Load saved connections when modal opens
watch(visible, (newValue) => {
  if (newValue) {
    console.log('Modal opened, loading saved connections...');
    loadSavedConnections();
    connectionError.value = null; // Clear error when modal opens
  }
});

// Clear error when form changes
watch(form, () => {
  if (connectionError.value) {
    connectionError.value = null;
  }
}, { deep: true });

// Debug saved connections
watch(recentConnections, (connections) => {
  console.log('Recent connections updated:', connections);
}, { immediate: true });

watch(hasConnections, (has) => {
  console.log('Has connections:', has);
}, { immediate: true });

// Load saved connection into form
const loadSavedConnection = async (savedConnection: any) => {
  try {
    const connection = await getDecryptedConnection(savedConnection);
    Object.assign(form, connection);
    form.name = savedConnection.name;
  } catch (err) {
    console.error('Failed to load saved connection:', err);
    ElMessage.error('Failed to load saved connection');
  }
};

// Handle connect
const handleConnect = async () => {
  if (!form.host || !form.username || !form.database) {
    connectionError.value = 'Please fill in all required fields';
    return;
  }

  connectionError.value = null;
  isConnecting.value = true;
  try {
    const success = await connect(form);
    if (success) {
      const connectionName = form.name || `${form.type} - ${form.host}`;
      emit('connection-created', form, connectionName);
      ElMessage.success('Connection successful!');
      visible.value = false;
      
      // Reset form
      Object.assign(form, {
        id: crypto.randomUUID(),
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: '',
        password: '',
        database: '',
        name: '',
      });
    } else {
      // Show detailed error from useDatabase
      const errorMessage = dbError.value || 'Connection failed';
      console.error('Connection failed:', errorMessage);
      connectionError.value = errorMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Connection failed';
    console.error('Connection error:', errorMessage);
    connectionError.value = errorMessage;
  } finally {
    isConnecting.value = false;
  }
};

// Handle cancel
const handleCancel = () => {
  visible.value = false;
};
</script>

<style scoped>
.connection-modal-content {
  display: flex;
  gap: 2rem;
  min-height: 400px;
}

.saved-connections-panel {
  flex: 1;
  border-right: 1px solid var(--el-border-color);
  padding-right: 1rem;
}

.connection-form-panel {
  flex: 1;
  padding-left: 1rem;
}

.saved-connections-panel h4,
.connection-form-panel h4 {
  margin: 0 0 1rem 0;
  color: var(--el-text-color-primary);
}

.saved-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.saved-item {
  padding: 0.75rem;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.saved-item:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

/* Dark mode styles for saved connections in modal */
.dark .saved-item {
  background-color: #2d3748 !important;
  border-color: #4a5568 !important;
  color: #f7fafc !important;
}

.dark .saved-item:hover {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
}

.dark .saved-name {
  color: #f7fafc !important;
}

.dark .saved-details {
  color: #e2e8f0 !important;
}

.dark .saved-database {
  color: #a0aec0 !important;
}

.dark .saved-connections-panel h4,
.dark .connection-form-panel h4 {
  color: #f7fafc !important;
}

.dark .saved-connections-panel {
  border-right-color: #4a5568 !important;
}

.saved-info {
  min-width: 0;
}

.saved-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.saved-details {
  font-size: 0.75rem;
  color: var(--el-text-color-regular);
  margin-bottom: 0.25rem;
}

.saved-database {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.no-saved {
  padding: 2rem 0;
}

.dialog-footer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.error-message {
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
  padding: 0.75rem;
  border-radius: 4px;
  border: 1px solid var(--el-color-danger-light-7);
  font-size: 0.875rem;
}

.dialog-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
