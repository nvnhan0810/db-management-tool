<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? 'Edit Connection' : 'New Connection'"
    width="600px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleCancel"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="120px"
      label-position="left"
    >
      <el-form-item label="Connection Name" prop="name">
        <el-input
          v-model="form.name"
          placeholder="Enter connection name (required for save)"
          :class="{ 'is-error': nameError }"
        />
        <div v-if="nameError" class="field-error">{{ nameError }}</div>
        <div class="field-hint">Required for Save, optional for Connect</div>
      </el-form-item>

      <el-form-item label="Database Type" prop="type">
        <el-select v-model="form.type" placeholder="Select database type" style="width: 100%">
          <el-option label="MySQL" value="mysql" />
          <el-option label="PostgreSQL" value="postgresql" />
          <el-option label="SQLite" value="sqlite" />
        </el-select>
      </el-form-item>

      <template v-if="form.type !== 'sqlite'">
        <el-form-item label="Host" prop="host">
          <el-input v-model="form.host" placeholder="localhost" />
        </el-form-item>

        <el-form-item label="Port" prop="port">
          <el-input-number
            v-model="form.port"
            :min="1"
            :max="65535"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="Username" prop="username">
          <el-input v-model="form.username" placeholder="Enter username" />
        </el-form-item>

        <el-form-item label="Password" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="Enter password"
            show-password
          />
        </el-form-item>
      </template>

      <el-form-item label="Database" prop="database">
        <el-input
          v-model="form.database"
          :placeholder="form.type === 'sqlite' ? 'Path to database file' : 'Database name (optional)'"
        />
        <div class="field-hint">Leave empty to connect without selecting a database</div>
      </el-form-item>
    </el-form>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">Cancel</el-button>
        <el-button
          type="primary"
          @click="handleSave"
          :loading="isSaving"
        >
          Save
        </el-button>
        <el-button
          type="success"
          @click="handleConnect"
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
import type { SavedConnection } from '@/services/storage';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import type { DatabaseConnection } from '@/types/connection';
import { ElMessage } from 'element-plus';
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
const connectionStore = useConnectionStore();
const { connect } = useDatabase();
const connectionsStore = useConnectionsStore();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const formRef = ref();
const isSaving = ref(false);
const isConnecting = ref(false);
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
});

const rules = {
  type: [{ required: true, message: 'Please select database type', trigger: 'change' }],
  host: [{ required: true, message: 'Please enter host', trigger: 'blur' }],
  port: [{ required: true, message: 'Please enter port', trigger: 'blur' }],
  username: [{ required: true, message: 'Please enter username', trigger: 'blur' }],
};

// Reset form when modal opens or connectionToEdit changes
watch(visible, (newVal) => {
  if (newVal) {
    if (props.connectionToEdit) {
      loadConnectionForEdit(props.connectionToEdit);
    } else {
      resetForm();
    }
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
    const decryptedConnection = await connectionStore.getDecryptedConnection(savedConnection);

    // Populate form with connection data
    form.id = decryptedConnection.id;
    form.type = decryptedConnection.type;
    form.host = decryptedConnection.host;
    form.port = decryptedConnection.port;
    form.username = decryptedConnection.username;
    form.password = decryptedConnection.password;
    form.database = decryptedConnection.database || '';
    form.name = savedConnection.name;

    isEditing.value = true;
    editingConnectionId.value = savedConnection.id;
    error.value = null;
    nameError.value = '';
    formRef.value?.clearValidate();
  } catch (err) {
    console.error('Failed to load connection for edit:', err);
    error.value = err instanceof Error ? err.message : 'Failed to load connection';
    ElMessage.error(error.value);
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
    // Create clean connection object
    const cleanConnection: DatabaseConnection = {
      id: form.id,
      type: form.type,
      host: form.host,
      port: form.port,
      username: form.username,
      password: form.password,
      database: form.database,
    };

    // Save or update connection
    await connectionStore.saveConnection(cleanConnection, form.name!.trim());

    ElMessage.success(isEditing.value ? 'Connection updated successfully!' : 'Connection saved successfully!');

    // Close modal and emit saved event
    visible.value = false;
    emit('saved');
  } catch (err) {
    console.error('Failed to save connection:', err);
    error.value = err instanceof Error ? err.message : 'Failed to save connection';
    ElMessage.error(error.value);
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
    // Create clean connection object
    const cleanConnection: DatabaseConnection = {
      id: form.id,
      type: form.type,
      host: form.host,
      port: form.port,
      username: form.username,
      password: form.password,
      database: form.database,
    };

    // Connect to database
    const success = await connect(cleanConnection);

    if (success) {
      // Set as active connection in store
      const connectionName = form.name || `${form.type} - ${form.host}`;
      const connectionWithName = {
        ...cleanConnection,
        name: connectionName,
      };
      connectionStore.setActiveConnection(connectionWithName);

      // Add to useConnections for multiple connections support
      const tabId = await connectionsStore.addConnection(connectionWithName, connectionName);
      console.log('Added connection with tabId:', tabId);

      // If name provided, also save the connection
      if (form.name && form.name.trim()) {
        try {
          await connectionStore.saveConnection(cleanConnection, form.name.trim());
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
      error.value = 'Failed to connect to database. Please check your credentials.';
      ElMessage.error(error.value);
    }
  } catch (err) {
    console.error('Connection error:', err);
    error.value = err instanceof Error ? err.message : 'Failed to connect to database';
    ElMessage.error(error.value);
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
</style>
