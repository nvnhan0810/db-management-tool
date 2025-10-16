<template>
  <div class="connection-layout">
    <div class="connection-wrapper">
      <!-- Left Side - Connection Form -->
      <!-- <div class="connection-form"> -->
        <!-- <h3>{{ isEditing ? 'Edit Connection' : 'Database Connection' }}</h3> -->
        <!-- <el-form :model="form" label-width="130px"> -->
          <!-- <el-form-item label="Connection Name">
            <el-input v-model="form.name"
              placeholder="Enter connection name (optional for connect/test, required for save)"
              :class="{ 'is-error': nameError }" />
            <div v-if="nameError" class="field-error">{{ nameError }}</div>
          </el-form-item> -->

          <!-- <el-form-item label="Database Type">
            <el-select v-model="form.type" placeholder="Select database type">
              <el-option label="MySQL" value="mysql" />
            </el-select>
          </el-form-item> -->

          <!-- <template v-if="form.type !== 'sqlite'">
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
          </template> -->

          <!-- <el-form-item label="Database">
            <el-input v-model="form.database"
              :placeholder="form.type === 'sqlite' ? 'Path to database file' : 'Database name (optional)'" />
            <div class="field-hint">Leave empty to connect without selecting a database</div>
          </el-form-item> -->


          <!-- <div class="form-actions">
            <el-button v-if="isEditing" type="info" @click="resetForm">
              New
            </el-button>
            <el-button type="primary" @click="handleConnect" :loading="isConnecting">
              Connect
            </el-button>
            <el-button type="success" @click="handleTest" :loading="isTesting">
              Test
            </el-button>
            <el-button type="warning" @click="handleSave" :loading="isSaving">
              {{ isEditing ? 'Update' : 'Save' }}
            </el-button>
          </div> -->
        <!-- </el-form> -->

        <!-- <div v-if="error" class="error-message"> -->
          <!-- {{ error }} -->
        <!-- </div> -->
      <!-- </div> -->

      <!-- Right Side - Saved Connections -->
      <div class="saved-connections-sidebar">
        <div>123</div>
        <!-- <SavedConnections :refresh-key="refreshKey" @load-connection="loadSavedConnection" /> -->
      </div>
    </div>

    <!-- Test Result Dialog -->
    <el-dialog v-model="showTestResult" :title="testResult?.success ? 'Test Successful' : 'Test Failed'" width="400px"
      :close-on-click-modal="true" :close-on-press-escape="true">
      <div class="test-result-content">
        <div class="test-result-icon">
          <div v-if="testResult?.success" class="success-icon">✓</div>
          <div v-else class="error-icon">✗</div>
        </div>
        <p class="test-result-message">{{ testResult?.message }}</p>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="showTestResult = false">
            OK
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref, watch } from 'vue';
// import { useConnections } from '../composables/useConnections';
import { useDatabase } from '../composables/useDatabase';
import { useSavedConnections } from '../composables/useSavedConnections';
import type { DatabaseConnection } from '@/types/connection';
import SavedConnections from './SavedConnections.vue';

const { connect, disconnect, error } = useDatabase();
const {
  loadSavedConnections,
  saveConnection,
  getDecryptedConnection,
  updateLastUsed
} = useSavedConnections();
// const { activeConnections } = useConnections();

const isConnecting = ref(false);


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

// Track if we're editing an existing connection
const isEditing = ref(false);
const originalConnectionId = ref<string | null>(null);

const nameError = ref('');
const isTesting = ref(false);
const isSaving = ref(false);
const refreshKey = ref(0);


// Load saved connections on mount
onMounted(() => {
  loadSavedConnections();
});

// Clear error when form changes
watch(form, () => {
  if (error.value) {
    error.value = null;
  }
}, { deep: true });

// Load a saved connection
const loadSavedConnection = async (savedConnection: any) => {
  try {
    const connection = await getDecryptedConnection(savedConnection);

    // Create a clean connection object
    const cleanConnection = {
      id: connection.id,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database
    };

    Object.assign(form, cleanConnection);
    form.name = savedConnection.name;

    // Set editing mode
    isEditing.value = true;
    originalConnectionId.value = savedConnection.id;

    console.log('Loaded saved connection:', cleanConnection);
  } catch (err) {
    console.error('Failed to load saved connection:', err);
  }
};

const validateForm = () => {
  nameError.value = '';

  if (!form.host || !form.username) {
    return 'Please fill in all required fields (Host and Username)';
  }

  return null;
};

const validateName = () => {
  if (!form.name || !form.name.trim()) {
    nameError.value = 'Connection name is required';
    return false;
  }
  nameError.value = '';
  return true;
};

const emit = defineEmits<{
  'connection-created': [connection: DatabaseConnection, name: string];
  'open-new-window': [connection: DatabaseConnection, name: string];
}>();

const handleConnect = async () => {
  const validationError = validateForm();
  if (validationError) {
    error.value = validationError;
    return;
  }

  error.value = null;
  isConnecting.value = true;
  try {
    const success = await connect(form);
    if (success) {
      // Update last used if it's a saved connection
      await updateLastUsed(form.id);

      // Create a clean DatabaseConnection object without extra properties
      const cleanConnection: DatabaseConnection = {
        id: form.id,
        type: form.type,
        host: form.host,
        port: form.port,
        username: form.username,
        password: form.password,
        database: form.database
      };

      // Emit connection created event to add to active connections
      const connectionName = form.name || `${form.type} - ${form.host}`;

      // Emit connection created event to add to active connections in current window
      emit('connection-created', cleanConnection, connectionName);
    } else {
      // Show detailed error from useDatabase
      const errorMessage = error.value || 'Connection failed';
      console.error('Connection failed:', errorMessage);
      error.value = errorMessage; // Set error to show on UI
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Connection failed';
    console.error('Connection error:', errorMessage);
    error.value = errorMessage; // Set error to show on UI
  } finally {
    isConnecting.value = false;
  }
};

const showTestResult = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const handleTest = async () => {
  const validationError = validateForm();
  if (validationError) {
    error.value = validationError;
    return;
  }

  error.value = null;
  isTesting.value = true;
  try {
    const success = await connect(form);
    if (success) {
      // Disconnect after test
      await disconnect();
      testResult.value = {
        success: true,
        message: 'Connection test successful! Database connection is working properly.'
      };
    } else {
      // Show detailed error from useDatabase
      const errorMessage = error.value || 'Connection test failed. Please check your connection details.';
      testResult.value = {
        success: false,
        message: errorMessage
      };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Test connection failed';
    testResult.value = {
      success: false,
      message: errorMessage
    };
  } finally {
    isTesting.value = false;
    showTestResult.value = true;
  }
};

const handleSave = async () => {
  // First validate name (required for save)
  if (!validateName()) {
    return;
  }

  // Then validate all other required fields
  const validationError = validateForm();
  if (validationError) {
    error.value = validationError;
    return;
  }

  error.value = null;
  isSaving.value = true;
  try {
    if (isEditing.value) {
      // Update existing connection
      await saveConnection(form, form.name!.trim());
      ElMessage.success('Connection updated successfully!');
    } else {
      // Save new connection
      await saveConnection(form, form.name!.trim());
      ElMessage.success('Connection saved successfully!');
    }

    // Reset form and editing state
    resetForm();
    // Force refresh of saved connections list
    refreshKey.value++;
  } catch (err) {
    console.error('Failed to save connection:', err);
    error.value = err instanceof Error ? err.message : 'Failed to save connection';
  } finally {
    isSaving.value = false;
  }
};

// Reset form to initial state
const resetForm = () => {
  form.id = crypto.randomUUID();
  form.type = 'mysql';
  form.host = 'localhost';
  form.port = 3306;
  form.username = '';
  form.password = '';
  form.database = '';
  form.name = '';

  // Reset editing state
  isEditing.value = false;
  originalConnectionId.value = null;

  // Clear errors
  error.value = null;
  nameError.value = '';
};
</script>

<style scoped lang="scss">
@use '@/sass/components/connection-form.scss' as *;
</style>
