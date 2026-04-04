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
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { Check, Folder } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { storeToRefs } from 'pinia';
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
const connectionStore = useConnectionStore();
const { currentConnection } = storeToRefs(connectionStore);
const { selectDatabase } = connectionStore;

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
    const current = currentConnection?.value;
    if (current?.database) {
      selectedDatabase.value = current.database;
    } else {
      selectedDatabase.value = '';
    }
  }
});

const loadDatabases = async () => {
  isLoading.value = true;
  try {
    // Ưu tiên dùng rootConnectionId để luôn lấy danh sách DB từ connection gốc
    const current = currentConnection?.value;
    const baseId = (current as any)?.rootConnectionId || current?.id;
    const connectionId = props.connectionId || baseId;
    if (!connectionId) {
      await showErrorDialog({ title: 'Error', message: 'No connection available' });
      return;
    }

    const dbList = await getDatabases(connectionId);
    databases.value = dbList || [];
  } catch (error) {
    console.error('Failed to load databases:', error);
    await showErrorDialog({
      title: 'Load databases failed',
      message: error instanceof Error ? error.message : 'Failed to load databases',
      details: error instanceof Error ? error.stack : undefined,
    });
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
      emit('selected', selectedDatabase.value);
      visible.value = false;
    } else {
      await showErrorDialog({ title: 'Connect failed', message: 'Failed to connect to database' });
    }
  } catch (error) {
    console.error('Failed to select database:', error);
    await showErrorDialog({
      title: 'Connect failed',
      message: error instanceof Error ? error.message : 'Failed to connect to database',
      details: error instanceof Error ? error.stack : undefined,
    });
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
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    background-color: transparent;
    border: 1px solid transparent;

    &:hover {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary) inset;
      background-color: transparent;
    }

    &.active {
      background-color: var(--el-color-primary-light-9);
      border-color: var(--el-color-primary);

      .dark & {
        background-color: rgba(64, 158, 255, 0.2);
        border-color: rgba(64, 158, 255, 0.5);
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
