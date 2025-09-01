<template>
  <div class="database-manager">
    <!-- Available Databases Section -->
    <div class="section">
      <h4>Available Databases</h4>
      <div class="available-databases">
        <div v-if="isLoadingDatabases" class="loading-databases">
          <el-icon class="is-loading" :size="32">
            <Loading />
          </el-icon>
          <p>Loading databases...</p>
        </div>
        <div v-else-if="availableDatabases.length === 0" class="no-available-databases">
          <el-icon :size="32" class="database-icon">
            <Folder />
          </el-icon>
          <p>No databases available. Create a new database below.</p>
        </div>
        <div 
          v-else
          v-for="db in availableDatabases" 
          :key="db.name"
          class="database-item"
          @click="selectDatabase(db.name)"
        >
          <div class="database-info">
            <el-icon><Folder /></el-icon>
            <span>{{ db.name }}</span>
            <span class="table-count">({{ db.tableCount }} tables)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create New Database Section -->
    <div class="section">
      <h4>Create New Database</h4>
      <el-form :model="newDatabaseForm" inline>
        <el-form-item>
          <el-input 
            v-model="newDatabaseForm.name" 
            placeholder="Enter database name"
            @keyup.enter="createDatabase"
          />
        </el-form-item>
        <el-form-item>
          <el-button 
            type="primary" 
            @click="createDatabase" 
            :loading="isCreatingDatabase"
          >
            Create
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Folder, Loading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { useDatabase } from '../composables/useDatabase';

interface DatabaseInfo {
  name: string;
  tableCount: number;
  isConnected: boolean;
}

const props = defineProps<{
  selectedDatabases?: DatabaseInfo[];
  activeDatabase?: string | null;
  connectionId?: string;
}>();

const emit = defineEmits<{
  'select-database': [databaseName: string];
  'add-database': [databaseName: string];
  'disconnect-database': [databaseName: string];
  'update-selected-databases': [databases: string[]];
}>();

// Create database form state
const isCreatingDatabase = ref(false);
const newDatabaseForm = reactive({
  name: ''
});

// Available databases - will be loaded from server
const availableDatabases = ref<DatabaseInfo[]>([]);
const isLoadingDatabases = ref(false);

// Use database composable
const { getDatabases } = useDatabase();

// Load databases from server
const loadDatabases = async () => {
  if (!props.connectionId) {
    return;
  }
  
  isLoadingDatabases.value = true;
  try {
    // Get databases from server
    const databases = await getDatabases(props.connectionId);
    
    if (!databases || !Array.isArray(databases)) {
      availableDatabases.value = [];
      return;
    }
    
    // Convert to DatabaseInfo format
    const formattedDatabases: DatabaseInfo[] = databases.map(db => ({
      name: db.name,
      tableCount: db.tableCount || 0,
      isConnected: false // Don't show active state in popup
    }));
    
    availableDatabases.value = formattedDatabases;
  } catch (error) {
    console.error('Error loading databases:', error);
    ElMessage.error('Failed to load databases: ' + (error instanceof Error ? error.message : 'Unknown error'));
    
    // Fallback to empty array
    availableDatabases.value = [];
  } finally {
    isLoadingDatabases.value = false;
  }
};

// Initialize when component mounts
onMounted(() => {
  // Load databases from server
  loadDatabases();
});

const selectDatabase = (databaseName: string) => {
  // Simply emit the selected database name
  emit('select-database', databaseName);
};

const createDatabase = async () => {
  if (!newDatabaseForm.name.trim()) {
    ElMessage.warning('Please enter a database name');
    return;
  }

  isCreatingDatabase.value = true;
  try {
    // Add to available databases
    availableDatabases.value.push({
      name: newDatabaseForm.name.trim(),
      tableCount: 0,
      isConnected: false
    });
    
    // Add to selected databases
    selectedDatabasesInManager.value.push(newDatabaseForm.name.trim());
    
    newDatabaseForm.name = '';
    ElMessage.success('Database created successfully');
  } catch (error) {
    ElMessage.error('Failed to create database');
  } finally {
    isCreatingDatabase.value = false;
  }
};

// No need to expose methods anymore
</script>

<style scoped>
.database-manager {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section h4 {
  margin: 0 0 1rem 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
}

.available-databases {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 0.5rem;
}

.database-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.25rem;
}

.database-item:hover {
  background-color: var(--el-color-primary-light-9);
}



.database-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.table-count {
  color: var(--el-text-color-secondary);
  font-size: 0.875rem;
}

.check-icon {
  color: var(--el-color-primary);
}

.loading-databases,
.no-available-databases {
  text-align: center;
  padding: 2rem;
  color: var(--el-text-color-secondary);
}

.loading-databases p,
.no-available-databases p {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
}

.database-icon {
  color: var(--el-text-color-placeholder);
}
</style>
