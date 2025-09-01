<template>
  <div class="database-list">
    <div class="database-list-header">
      <h4>Selected Databases</h4>
      <el-button 
        type="primary" 
        size="small" 
        @click="showDatabaseManagerDialog = true"
        :icon="Plus"
      >
        Manage
      </el-button>
    </div>
    
    <div v-if="databases.length === 0" class="no-databases">
      <div class="no-databases-content">
        <el-icon :size="48" class="database-icon">
          <Folder />
        </el-icon>
        <h4>No Databases Selected</h4>
        <p>Click "Manage" to select databases for this connection.</p>
      </div>
    </div>
    
    <div v-else class="databases-grid">
      <div 
        v-for="database in databases" 
        :key="database.name"
        class="database-card"
        :class="{ 
          'active': database.name === activeDatabase,
          'connected': database.isConnected 
        }"
        @click="selectDatabase(database.name)"
        @contextmenu.prevent="showContextMenu($event, database)"
      >
        <div class="database-icon">
          <el-icon :size="20">
            <Folder />
          </el-icon>
          <div 
            class="status-dot"
            :class="{ 'connected': database.isConnected }"
          ></div>
        </div>
        <div class="database-name">
          {{ database.name }}
        </div>
        <div class="database-details">
          {{ database.tableCount }} tables
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <el-dropdown 
      ref="contextMenuRef"
      trigger="contextmenu"
      :visible="contextMenuVisible"
      @visible-change="handleContextMenuVisibleChange"
      placement="bottom-start"
    >
      <span class="context-menu-trigger"></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item @click="disconnectDatabase" divided>
            <el-icon><Close /></el-icon>
            <span>Disconnect Database</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- Database Manager Dialog -->
    <el-dialog
      v-model="showDatabaseManagerDialog"
      title="Database Manager"
      width="600px"
      :close-on-click-modal="false"
    >
      <div class="database-manager">
        <!-- Available Databases Section -->
        <div class="section">
          <h4>Available Databases</h4>
          <div class="available-databases">
            <div v-if="availableDatabases.length === 0" class="no-available-databases">
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
              :class="{ 'selected': isDatabaseSelected(db.name) }"
              @click="toggleDatabaseSelection(db.name)"
            >
              <div class="database-info">
                <el-icon><Folder /></el-icon>
                <span>{{ db.name }}</span>
                <span class="table-count">({{ db.tableCount }} tables)</span>
              </div>
              <el-icon v-if="isDatabaseSelected(db.name)" class="check-icon">
                <Check />
              </el-icon>
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
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="showDatabaseManagerDialog = false">Close</el-button>
          <el-button type="primary" @click="saveDatabaseSelection">
            Save Selection
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Check, Close, Folder, Plus } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { reactive, ref } from 'vue';

interface DatabaseInfo {
  name: string;
  tableCount: number;
  isConnected: boolean;
}

const props = defineProps<{
  databases: DatabaseInfo[];
  activeDatabase: string | null;
  connectionId: string;
}>();

const emit = defineEmits<{
  'select-database': [databaseName: string];
  'add-database': [databaseName: string];
  'disconnect-database': [databaseName: string];
  'update-selected-databases': [databases: string[]];
}>();

// Context menu state
const contextMenuVisible = ref(false);
const contextMenuRef = ref();
const selectedDatabase = ref<DatabaseInfo | null>(null);

// Database manager dialog state
const showDatabaseManagerDialog = ref(false);
const isCreatingDatabase = ref(false);
const newDatabaseForm = reactive({
  name: ''
});

// Mock available databases - in real implementation, this would come from the database
const availableDatabases = ref([
  { name: 'information_schema', tableCount: 79, isConnected: false },
  { name: 'mysql', tableCount: 33, isConnected: false },
  { name: 'performance_schema', tableCount: 87, isConnected: false },
  { name: 'sys', tableCount: 101, isConnected: false },
  { name: 'test', tableCount: 0, isConnected: false },
  { name: 'admins', tableCount: 1, isConnected: true }
]);

// Selected databases for the manager
const selectedDatabasesInManager = ref<string[]>([]);

// Initialize selected databases when dialog opens
const initializeSelectedDatabases = () => {
  selectedDatabasesInManager.value = props.databases.map(db => db.name);
};

const selectDatabase = (databaseName: string) => {
  emit('select-database', databaseName);
};

const showContextMenu = (event: MouseEvent, database: DatabaseInfo) => {
  event.preventDefault();
  selectedDatabase.value = database;
  contextMenuVisible.value = true;
  
  // Position the context menu at the mouse position
  if (contextMenuRef.value) {
    const dropdown = contextMenuRef.value.$el;
    dropdown.style.position = 'fixed';
    dropdown.style.left = `${event.clientX}px`;
    dropdown.style.top = `${event.clientY}px`;
    dropdown.style.zIndex = '9999';
  }
};

const handleContextMenuVisibleChange = (visible: boolean) => {
  contextMenuVisible.value = visible;
  if (!visible) {
    selectedDatabase.value = null;
  }
};

const disconnectDatabase = () => {
  if (selectedDatabase.value) {
    emit('disconnect-database', selectedDatabase.value.name);
    contextMenuVisible.value = false;
    selectedDatabase.value = null;
  }
};

// Database manager methods
const isDatabaseSelected = (databaseName: string) => {
  return selectedDatabasesInManager.value.includes(databaseName);
};

const toggleDatabaseSelection = (databaseName: string) => {
  const index = selectedDatabasesInManager.value.indexOf(databaseName);
  if (index > -1) {
    selectedDatabasesInManager.value.splice(index, 1);
  } else {
    selectedDatabasesInManager.value.push(databaseName);
  }
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

const saveDatabaseSelection = () => {
  emit('update-selected-databases', selectedDatabasesInManager.value);
  showDatabaseManagerDialog.value = false;
  ElMessage.success('Database selection updated');
};

// Watch for dialog open to initialize selected databases
const handleDialogOpen = () => {
  initializeSelectedDatabases();
};
</script>

<style scoped>
.database-list {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
}

.database-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color-light);
}

.database-list-header h4 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
}

.no-databases {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.no-databases-content {
  text-align: center;
  color: var(--el-text-color-regular);
}

.no-databases-content h4 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
}

.no-databases-content p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.875rem;
}

.database-icon {
  color: var(--el-text-color-placeholder);
}

.databases-grid {
  padding: 0.75rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  overflow-y: auto;
}

.database-card {
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

.database-card:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.database-card.active {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-8);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
  transform: none;
  z-index: 1;
}

.database-card.connected {
  border-left: 2px solid var(--el-color-success);
}

.database-icon {
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

.database-name {
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

.database-details {
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

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

.database-item.selected {
  background-color: var(--el-color-primary-light-8);
  border: 1px solid var(--el-color-primary);
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

.no-available-databases {
  text-align: center;
  padding: 2rem;
  color: var(--el-text-color-secondary);
}

.no-available-databases p {
  margin: 0.5rem 0 0 0;
  font-size: 0.875rem;
}

/* Dark mode adjustments */
.dark .database-card {
  background-color: #2d3748 !important;
  border-color: #4a5568 !important;
  color: #f7fafc !important;
}

.dark .database-card:hover {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.dark .database-card.active {
  background-color: #4a5568 !important;
  border-color: #409eff !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
}

.dark .database-name {
  color: #f7fafc !important;
}

.dark .database-details {
  color: #a0aec0 !important;
}

.dark .database-icon {
  color: #e2e8f0 !important;
}

.dark .database-list-header h4 {
  color: #f7fafc !important;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .databases-grid {
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: 0.5rem;
  }
  
  .database-card {
    width: 100%;
    height: auto;
    max-width: 70px;
    padding: 0.5rem 0.25rem;
  }
  
  .database-name {
    font-size: 0.7rem;
  }
  
  .database-details {
    font-size: 0.6rem;
  }
  
  .database-icon .el-icon {
    font-size: 18px;
  }
}
</style>
