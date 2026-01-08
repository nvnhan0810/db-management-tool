<template>
  <el-dialog
    v-model="visible"
    title="Select Database"
    width="500px"
    :close-on-click-modal="false"
    @close="handleCancel"
  >
    <div v-if="isLoading" class="loading">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="databases.length === 0" class="no-databases">
      <el-empty description="No databases available">
        <p class="empty-text">No databases found for this connection</p>
      </el-empty>
    </div>

    <div v-else class="databases-list">
      <div
        v-for="database in databases"
        :key="database.name"
        class="database-item"
        :class="{ active: selectedDatabase === database.name }"
        @click="handleSelectDatabase(database.name)"
      >
        <el-icon class="database-icon">
          <Folder />
        </el-icon>
        <div class="database-info">
          <div class="database-name">{{ database.name }}</div>
          <div v-if="database.tableCount !== undefined" class="database-details">
            {{ database.tableCount }} table{{ database.tableCount !== 1 ? 's' : '' }}
          </div>
        </div>
        <el-icon v-if="selectedDatabase === database.name" class="check-icon">
          <Check />
        </el-icon>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">Cancel</el-button>
        <el-button
          type="primary"
          @click="handleConfirm"
          :disabled="!selectedDatabase"
          :loading="isConnecting"
        >
          Connect
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useDatabase } from '@/composables/useDatabase';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { Check, Folder } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  connectionId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'selected': [databaseName: string];
}>();

const { getDatabases } = useDatabase();
const connectionsStore = useConnectionsStore();
const { selectDatabase, currentConnection } = connectionsStore;

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const databases = ref<Array<{ name: string; tableCount?: number }>>([]);
const selectedDatabase = ref<string>('');
const isLoading = ref(false);
const isConnecting = ref(false);

// Load databases when modal opens
watch(visible, async (newValue) => {
  if (newValue) {
    await loadDatabases();
    // Pre-select current database if exists
    if (currentConnection?.database) {
      selectedDatabase.value = currentConnection.database;
    } else {
      selectedDatabase.value = '';
    }
  }
});

const loadDatabases = async () => {
  isLoading.value = true;
  try {
    const connectionId = props.connectionId || currentConnection?.id;
    if (!connectionId) {
      ElMessage.error('No connection available');
      return;
    }

    const dbList = await getDatabases(connectionId);
    databases.value = dbList || [];
  } catch (error) {
    console.error('Failed to load databases:', error);
    ElMessage.error('Failed to load databases');
    databases.value = [];
  } finally {
    isLoading.value = false;
  }
};

const handleSelectDatabase = (databaseName: string) => {
  selectedDatabase.value = databaseName;
};

const handleConfirm = async () => {
  if (!selectedDatabase.value) return;

  isConnecting.value = true;
  try {
    const success = await selectDatabase(selectedDatabase.value);
    if (success) {
      ElMessage.success(`Connected to database: ${selectedDatabase.value}`);
      emit('selected', selectedDatabase.value);
      visible.value = false;
    } else {
      ElMessage.error('Failed to connect to database');
    }
  } catch (error) {
    console.error('Failed to select database:', error);
    ElMessage.error('Failed to connect to database');
  } finally {
    isConnecting.value = false;
  }
};

const handleCancel = () => {
  selectedDatabase.value = '';
  visible.value = false;
};
</script>

<style scoped lang="scss">
.loading {
  padding: 20px;
}

.no-databases {
  padding: 40px 20px;
  text-align: center;

  .empty-text {
    margin-top: 12px;
    color: var(--el-text-color-regular);
    font-size: 14px;
  }
}

.databases-list {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;

  .database-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    background-color: transparent;
    border: 1px solid transparent;

    &:hover {
      background-color: var(--el-fill-color-light);
    }

    &.active {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);

      .dark & {
        background-color: rgba(64, 158, 255, 0.2);
        border-color: rgba(64, 158, 255, 0.5);
      }

      [data-theme="light"] & {
        background-color: rgba(64, 158, 255, 0.1);
        border-color: rgba(64, 158, 255, 0.3);
      }
    }

    .database-icon {
      font-size: 20px;
      color: var(--el-color-primary);
      margin-right: 12px;
    }

    .database-info {
      flex: 1;
      min-width: 0;

      .database-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        margin-bottom: 4px;
      }

      .database-details {
        font-size: 12px;
        color: var(--el-text-color-regular);
      }
    }

    .check-icon {
      font-size: 18px;
      color: var(--el-color-primary);
      margin-left: 12px;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

