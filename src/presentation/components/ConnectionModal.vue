<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? 'Edit Connection' : 'New Connection'"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleCancel"
  >
    <div class="form-wrapper">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
        label-position="left"
      >
        <el-tabs v-model="activeTab" class="connection-modal-tabs">
          <el-tab-pane label="Connection" name="connection">
            <ConnectionModalConnectionTab
              :form="form"
              :name-error="nameError"
              :disabled="isFormBusy"
            />
          </el-tab-pane>
          <el-tab-pane label="SSH" name="ssh" :disabled="form.type === 'sqlite'">
            <ConnectionModalSSHTab
              v-model:ssh-auth-method="sshAuthMethod"
              :form="form"
              :disabled="isFormBusy"
            />
          </el-tab-pane>
        </el-tabs>
      </el-form>
      <!-- Overlay blocks all form interaction when Test/Connect/Save is running -->
      <div v-if="isFormBusy" class="form-busy-overlay" aria-hidden="true" />
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">Cancel</el-button>
        <el-button
          type="default"
          class="btn-test-connection"
          :loading="isTesting"
          :disabled="isSaving || isConnecting"
          @click="handleTestConnection"
        >
          Test Connection
        </el-button>
        <el-button
          type="primary"
          :loading="isSaving"
          :disabled="isConnecting || isTesting"
          @click="handleSave"
        >
          Save
        </el-button>
        <el-button
          type="success"
          :loading="isConnecting"
          :disabled="isSaving || isTesting"
          @click="handleConnect"
        >
          Connect
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '@/domain/connection/types';
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import ConnectionModalConnectionTab from '@/presentation/components/ConnectionModal/ConnectionTab.vue';
import ConnectionModalSSHTab from '@/presentation/components/ConnectionModal/SSHTab.vue';
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { ElMessage } from 'element-plus';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  modelValue: boolean;
  connectionToEdit?: SavedConnection | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'saved': [];
  'connected': [];
}>();

const router = useRouter();
const connectionsStore = useConnectionsStore();
const { connect, disconnect } = useDatabase();
const connectionStore = useConnectionStore();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const formRef = ref();
const isSaving = ref(false);
const isConnecting = ref(false);
const isTesting = ref(false);
const isFormBusy = computed(() => isSaving.value || isConnecting.value || isTesting.value);
const error = ref<string | null>(null);
const nameError = ref('');
const isEditing = ref(false);
const editingConnectionId = ref<string | null>(null);

const form = reactive<DatabaseConnection & { name?: string }>({
  id: crypto.randomUUID(),
  type: 'postgresql',
  host: 'localhost',
  port: 5432,
  username: '',
  password: '',
  database: '',
  name: '',
  ssh: {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
  },
});

const sshAuthMethod = ref<'password' | 'key'>('password');
const activeTab = ref<'connection' | 'ssh'>('connection');

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
};

/** Database value for connection: PostgreSQL uses 'postgres' when empty. */
const getEffectiveDatabase = (): string => {
  const db = form.database?.trim() ?? '';
  if (form.type === 'postgresql' && !db) return 'postgres';
  return db;
};

const buildCleanConnection = (): DatabaseConnection => ({
  id: form.id,
  type: form.type,
  host: form.host,
  port: form.port,
  username: form.username,
  password: form.password,
  database: getEffectiveDatabase(),
  ssh: form.ssh?.enabled
    ? {
        enabled: true,
        host: form.ssh.host || '',
        port: form.ssh.port || 22,
        username: form.ssh.username || '',
        password: sshAuthMethod.value === 'password' ? (form.ssh.password || '') : undefined,
        privateKey: sshAuthMethod.value === 'key' ? (form.ssh.privateKey || '') : undefined,
        passphrase: sshAuthMethod.value === 'key' ? (form.ssh.passphrase || '') : undefined,
      }
    : undefined,
});

const rules = {
  type: [{ required: true, message: 'Please select database type', trigger: 'change' }],
  host: [{ required: true, message: 'Please enter host', trigger: 'blur' }],
  port: [{ required: true, message: 'Please enter port', trigger: 'blur' }],
  username: [{ required: true, message: 'Please enter username', trigger: 'blur' }],
  'ssh.host': [
    {
      validator: (rule: any, value: any, callback: any) => {
        if (form.ssh?.enabled && !value) {
          callback(new Error('Please enter SSH host'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ],
  'ssh.username': [
    {
      validator: (rule: any, value: any, callback: any) => {
        if (form.ssh?.enabled && !value) {
          callback(new Error('Please enter SSH username'));
        } else {
          callback();
        }
      },
      trigger: 'blur'
    }
  ],
};

// Reset form when modal opens or connectionToEdit changes
watch(visible, (newVal) => {
  if (newVal) {
    activeTab.value = 'connection';
    if (props.connectionToEdit) {
      loadConnectionForEdit(props.connectionToEdit);
    } else {
      resetForm();
    }
  }
});

// When switching to SQLite, stay on Connection tab (SSH tab is disabled)
// When changing between MySQL/PostgreSQL, auto-update port if it was the default of the previous type
watch(() => form.type, (newType, oldType) => {
  if (newType === 'sqlite' && activeTab.value === 'ssh') {
    activeTab.value = 'connection';
    return;
  }
  if (newType === 'sqlite') return;
  const newDefault = DEFAULT_PORTS[newType];
  if (newDefault === undefined) return;
  const oldDefault = oldType ? DEFAULT_PORTS[oldType] : undefined;
  const isCurrentlyDefaultOfOld = oldDefault !== undefined && form.port === oldDefault;
  if (isCurrentlyDefaultOfOld || oldType === 'sqlite') {
    form.port = newDefault;
  }
});

watch(() => props.connectionToEdit, (newConnection) => {
  if (visible.value && newConnection) {
    loadConnectionForEdit(newConnection);
  }
});

// Clear error when form changes
watch(form, () => {
  if (error.value) {
    error.value = null;
  }
  if (nameError.value) {
    nameError.value = '';
  }
}, { deep: true });

const validateForm = async (): Promise<boolean> => {
  try {
    await formRef.value?.validate();
    return true;
  } catch {
    return false;
  }
};

const validateName = (): boolean => {
  if (!form.name || !form.name.trim()) {
    nameError.value = 'Connection name is required for Save';
    return false;
  }
  nameError.value = '';
  return true;
};

const loadConnectionForEdit = async (savedConnection: SavedConnection) => {
  try {
    // Get decrypted connection
    const decryptedConnection = await connectionsStore.getDecryptedConnection(savedConnection);

    // Populate form with connection data
    form.id = decryptedConnection.id;
    form.type = decryptedConnection.type;
    form.host = decryptedConnection.host;
    form.port = decryptedConnection.port;
    form.username = decryptedConnection.username;
    form.password = decryptedConnection.password;
    form.database = decryptedConnection.database || '';
    form.name = savedConnection.name;

    // Load SSH config if exists
    if (decryptedConnection.ssh && decryptedConnection.ssh.enabled) {
      form.ssh = {
        enabled: true,
        host: decryptedConnection.ssh.host || '',
        port: decryptedConnection.ssh.port || 22,
        username: decryptedConnection.ssh.username || '',
        password: decryptedConnection.ssh.password || '',
        privateKey: decryptedConnection.ssh.privateKey || '',
        passphrase: decryptedConnection.ssh.passphrase || '',
      };
      sshAuthMethod.value = decryptedConnection.ssh.privateKey ? 'key' : 'password';
    } else {
      form.ssh = {
        enabled: false,
        host: '',
        port: 22,
        username: '',
        password: '',
        privateKey: '',
        passphrase: '',
      };
      sshAuthMethod.value = 'password';
    }

    isEditing.value = true;
    editingConnectionId.value = savedConnection.id;
    error.value = null;
    nameError.value = '';
    formRef.value?.clearValidate();
  } catch (err) {
    console.error('Failed to load connection for edit:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load connection';
    await showErrorDialog({ title: 'Error', message: error.value });
  }
};

const resetForm = () => {
  form.id = crypto.randomUUID();
  form.type = 'postgresql';
  form.host = 'localhost';
  form.port = 5432;
  form.username = '';
  form.password = '';
  form.database = '';
  form.name = '';
  form.ssh = {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    password: '',
    privateKey: '',
    passphrase: '',
  };
  sshAuthMethod.value = 'password';
  error.value = null;
  nameError.value = '';
  isEditing.value = false;
  editingConnectionId.value = null;
  formRef.value?.clearValidate();
};

const handleCancel = () => {
  resetForm();
  visible.value = false;
};

const handleTestConnection = async () => {
  const isValid = await validateForm();
  if (!isValid) {
    return;
  }

  error.value = null;
  isTesting.value = true;

  try {
    const cleanConnection = buildCleanConnection();
    const resp = await connect(cleanConnection);

    if (resp.success) {
      await disconnect(cleanConnection.id);
      ElMessage.success('Connection test successful!');
    } else {
      error.value =
        resp.error || 'Connection test failed. Please check your credentials and try again.';
      await showErrorDialog({ title: 'Error', message: error.value });
    }
  } catch (err) {
    console.error('Test connection error:', err);
    error.value = err instanceof Error ? err.message : 'Connection test failed';
    await showErrorDialog({ title: 'Error', message: error.value });
  } finally {
    isTesting.value = false;
  }
};

const handleSave = async () => {
  // Validate name (required for save)
  if (!validateName()) {
    return;
  }

  // Validate form
  const isValid = await validateForm();
  if (!isValid) {
    return;
  }

  error.value = null;
  isSaving.value = true;

  try {
    const cleanConnection = buildCleanConnection();

    // Save or update connection
    await connectionsStore.saveConnection(cleanConnection, form.name!.trim());

    ElMessage.success(isEditing.value ? 'Connection updated successfully!' : 'Connection saved successfully!');

    // Close modal and emit saved event
    visible.value = false;
    emit('saved');
  } catch (err) {
    console.error('Failed to save connection:', err);
    error.value = err instanceof Error ? err.message : 'Failed to save connection';
    await showErrorDialog({ title: 'Error', message: error.value });
  } finally {
    isSaving.value = false;
  }
};

const handleConnect = async () => {
  // Validate form (name is optional for connect)
  const isValid = await validateForm();
  if (!isValid) {
    return;
  }

  error.value = null;
  isConnecting.value = true;

  try {
    const cleanConnection = buildCleanConnection();
    // Connect to database
    const resp = await connect(cleanConnection);

    if (resp.success) {
      // Set as active connection in store
      const connectionName = form.name || `${form.type} - ${form.host}`;
      const connectionWithName = {
        ...cleanConnection,
        name: connectionName,
      };
      connectionsStore.setActiveConnection(connectionWithName);

      // Add to workspace tabs for multiple connections support
      const tabId = await connectionStore.addConnection(connectionWithName, connectionName);

      // If name provided, also save the connection
      if (form.name && form.name.trim()) {
        try {
          await connectionsStore.saveConnection(cleanConnection, form.name.trim());
        } catch (err) {
          console.error('Failed to auto-save connection:', err);
          // Don't fail the connect if save fails
        }
      }

      ElMessage.success('Connected successfully!');

      // Close modal and navigate to workspace
      visible.value = false;
      emit('connected');

      // Small delay to ensure state is updated before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate to workspace page
      router.push({ name: 'workspace' });
    } else {
      error.value = resp.error || 'Failed to connect to database. Please check your credentials.';
      await showErrorDialog({ title: 'Error', message: error.value });
    }
  } catch (err) {
    console.error('Connection error:', err);
    error.value = err instanceof Error ? err.message : 'Failed to connect to database';
    await showErrorDialog({ title: 'Error', message: error.value });
  } finally {
    isConnecting.value = false;
  }
};
</script>


<style scoped lang="scss">
.field-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}

.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}

.error-message {
  color: var(--el-color-danger);
  font-size: 14px;
  margin-bottom: 16px;
  padding: 8px;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
}

.form-wrapper {
  position: relative;
}

.form-busy-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  cursor: not-allowed;
  background: transparent;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.is-error) {
  .el-input__wrapper {
    box-shadow: 0 0 0 1px var(--el-color-danger) inset;
  }
}

.connection-modal-tabs {
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
  :deep(.el-tabs__content) {
    overflow: visible;
  }
}

/* Loading state: only footer buttons in this modal */
.dialog-footer .btn-test-connection {
  min-width: 130px;
}

/* Remove Element Plus loading mask (::before) only for footer buttons */
.dialog-footer :deep(.el-button.is-loading)::before {
  display: none;
}

/* In dark mode, keep footer button text visible while loading (override index.scss) */
.dark .dialog-footer :deep(.el-button.is-loading) {
  color: inherit !important;
}
</style>
