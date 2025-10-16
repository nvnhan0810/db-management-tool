<template>
  <div class="query-editor">
    <!-- Title Bar -->
    <!-- <CustomTitleBar 
      :current-connection="props.connection"
      :active-tab="tableStore.activeTab || undefined"
      :sidebar-visible="showRowDetailSidebar"
      @tab-change="handleTabChange"
      @add-query="handleAddQuery"
      @new-connection="handleNewConnection"
      @disconnect="handleDisconnect"
      @select-database="handleSelectDatabase"
      @toggle-sidebar="handleToggleSidebar"
    /> -->
    
    <div class="query-content">
      <!-- Show content only when connected and has database -->
      <template v-if="isConnected && props.connection?.database">
        <!-- Database Tables Sidebar -->
        <el-aside v-if="showTablesSidebar" width="250px">
          <DatabaseTables
            :tables="tables"
            :is-loading="isLoadingTables"
            :active-table-name="activeTableName || undefined"
            @select-table="handleSelectTable"
          />
        </el-aside>
        
        <!-- Main Content Area - RightSidebar is now the main content -->
        <el-main :class="{ 'with-row-detail': showRowDetailSidebar && hasSelectedRow }">
          <RightSidebar
            :visible="showRightSidebar"
            :active-table-name="activeTableName || undefined"
            :connection-id="props.connection?.id"
            :show-row-detail="showRowDetailSidebar && hasSelectedRow"
            :is-sidebar-hidden="isSidebarHidden"
            ref="rightSidebarRef"
            @table-selected="handleTableSelected"
            @close-sidebar="handleCloseSidebar"
            @show-sidebar="handleShowSidebar"
            @row-selected="handleRowSelected"
          />
        </el-main>
      </template>
      
      <!-- Show no database selected state when connected but no database -->
      <template v-else-if="isConnected && !props.connection?.database">
        <el-main class="no-database-main">
          <div class="no-database-content">
            <el-icon :size="64" class="database-icon">
              <Folder />
            </el-icon>
            <h2>No Database Selected</h2>
            <p>You're connected to the server but haven't selected a database yet.</p>
            <p>Click the database button in the title bar to select a database.</p>
          </div>
        </el-main>
      </template>
      
      <!-- Show not connected state -->
      <template v-else>
        <el-main class="not-connected-main">
          <div class="not-connected-content">
            <el-icon :size="64" class="connection-icon">
              <Connection />
            </el-icon>
            <h2>Not Connected</h2>
            <p>Please establish a database connection first.</p>
          </div>
        </el-main>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Connection, Folder } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';
import { useDatabase } from '../composables/useDatabase';
import { useTableStore } from '../stores/tableStore';
import CustomTitleBar from './CustomTitleBar.vue';
import DatabaseTables from './DatabaseTables.vue';
import RightSidebar from './RightSidebar.vue';

const props = defineProps<{
  connection: ActiveConnection | null;
}>();

const emit = defineEmits<{
  'open-new-window': [];
  'disconnect-connection': [tabId: string];
  'select-database': [];
}>();

const query = ref('');
const { isConnected, queryResult, error, executeQuery: runQuery, disconnect, getTables, getTableStructure, hasActiveConnections, refreshConnectionStatus } = useDatabase();

// Use Pinia store
const tableStore = useTableStore();

// Computed properties
const connectionName = computed(() => {
  return props.connection?.name || 'Unknown Connection';
});

const showTablesSidebar = computed(() => {
  return props.connection?.database && props.connection?.isConnected;
});

// Tables state
const tables = ref<Array<{ name: string; type?: string }>>([]);
const isLoadingTables = ref(false);
const showRightSidebar = ref(true); // Always show right sidebar
const showRowDetailSidebar = ref(false); // Toggle for row detail sidebar
const isSidebarHidden = ref(false); // Track if sidebar is manually hidden
const hasSelectedRow = ref(false); // Track if there's a selected row
const rightSidebarRef = ref();
const activeTableName = ref<string | null>(null);

// Methods

const handleSelectTable = async (table: { name: string; type?: string }) => {
  // Add table info to right sidebar (don't update main query)
  if (rightSidebarRef.value) {
    try {
      // First try to refresh connection status and auto-reconnect if needed
      if (props.connection && !props.connection.isConnected) {

        await refreshConnectionStatus();
      }
      
      // Load real table structure from database
      const tableStructure = await loadTableStructure(table.name);
      
      // Check if tableStructure is valid
      if (!tableStructure || typeof tableStructure !== 'object') {
        throw new Error(`Invalid table structure returned: ${JSON.stringify(tableStructure)}`);
      }
      
      const tableData = {
        name: table.name,
        columns: tableStructure.columns || [],
        rows: tableStructure.rows || 0,
        indexes: tableStructure.indexes || []
      };
      
      // Add table tab using store with connection ID
      const tableId = await tableStore.addTableTab(tableData, props.connection?.id);
      
      // Load table structure and add to executed queries
      const structureQuery = `DESCRIBE ${table.name}`;
      tableStore.addExecutedQuery(structureQuery, true);
      
      // Auto-load table data using store
      // The data will be loaded automatically when the tab is created
      showRightSidebar.value = true;
      activeTableName.value = table.name;
    } catch (error) {
      console.error('Error loading table structure:', error);
      
      // Fallback to basic table data with some mock columns
      const tableData = {
        name: table.name,
        columns: [
          { name: 'id', type: 'INT', nullable: false },
          { name: 'name', type: 'VARCHAR(255)', nullable: true }
        ],
        rows: 0,
        indexes: []
      };
      
      // Add table tab using store with connection ID
      await tableStore.addTableTab(tableData, props.connection?.id);
      
      // Add error to executed queries
      const errorQuery = `DESCRIBE ${table.name}`;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      tableStore.addExecutedQuery(errorQuery, false, errorMessage);
      
      showRightSidebar.value = true;
      activeTableName.value = table.name;
    }
  }
};

const handleTableSelected = (tableName: string) => {
  activeTableName.value = tableName;
};

// Handle tab change
const handleTabChange = (tabId: string) => {
  tableStore.activeTab = tabId;
};

// Handle add query
const handleAddQuery = () => {
  tableStore.addQueryTab();
};

// Handle new connection - always open new window
const handleNewConnection = () => {
  emit('open-new-window');
};

// Handle disconnect
const handleDisconnect = async () => {
  if (props.connection?.id) {
    try {
      // Disconnect from database
      await disconnect();
      
      // Remove from active connections
      if (props.connection.tabId) {
        // Emit event to parent to handle connection removal
        emit('disconnect-connection', props.connection.tabId);
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  }
};

// Handle select database from title bar
const handleSelectDatabase = () => {
  emit('select-database');
};

// Handle toggle sidebar
const handleToggleSidebar = () => {
  if (isSidebarHidden.value) {
    // If sidebar is hidden, check if there's a selected row
    if (!hasSelectedRow.value) {
      ElMessage.info('No Rows Selected');
      return;
    }
    // Show sidebar
    isSidebarHidden.value = false;
    showRowDetailSidebar.value = true;
  } else {
    // If sidebar is visible, hide it
    isSidebarHidden.value = true;
    showRowDetailSidebar.value = false;
  }
};

// Method to add query tab
const addQueryTab = () => {
  tableStore.addQueryTab();
};

// Handle close sidebar
const handleCloseSidebar = () => {
  isSidebarHidden.value = true;
  showRowDetailSidebar.value = false;
};

// Handle show sidebar
const handleShowSidebar = () => {
  isSidebarHidden.value = false;
  showRowDetailSidebar.value = true;
};

// Handle row selected
const handleRowSelected = (row: any) => {
  hasSelectedRow.value = !!row;
};

// Expose methods for parent component (moved to end of file)

// Method to load table structure from database
const loadTableStructure = async (tableName: string) => {
  if (!props.connection?.id) {
    throw new Error('No connection ID available');
  }
  
  try {
    // Use real database call to get table structure
    const structure = await getTableStructure(props.connection.id, tableName);
    return structure;
  } catch (error) {
    console.error('Error loading table structure:', error);
    throw error;
  }
};

// Method to verify connection status
const verifyConnection = async () => {
  if (!props.connection?.id) {

    return false;
  }
  
  try {
    // Check if connection is still active in database service
    const hasConnections = await hasActiveConnections();

    return hasConnections;
  } catch (error) {
    console.error('Error verifying connection:', error);
    return false;
  }
};

const loadTables = async (retryCount = 0) => {
  // Check if we have a valid connection and are connected
  if (!props.connection?.database || !props.connection?.isConnected || !props.connection?.id) {
    tables.value = [];
    return;
  }
  
  // Verify connection is still active
  const isConnectionActive = await verifyConnection();
  if (!isConnectionActive) {
    // Retry up to 3 times with increasing delay
    if (retryCount < 3) {
      const delay = (retryCount + 1) * 200; // 200ms, 400ms, 600ms
      setTimeout(() => {
        loadTables(retryCount + 1);
      }, delay);
      return;
    } else {
      tables.value = [];
      return;
    }
  }
  
  isLoadingTables.value = true;
  try {
    // Load real tables from database using the specific connection ID
    const databaseTables = await getTables(props.connection.id);
    
    // Ensure databaseTables is an array
    if (Array.isArray(databaseTables)) {
      tables.value = databaseTables;
    } else {
      console.warn('getTables returned non-array result:', databaseTables);
      tables.value = [];
    }
  } catch (err) {
    console.error('Error loading tables:', err);
    // Fallback to empty array if loading fails
    tables.value = [];
  } finally {
    isLoadingTables.value = false;
  }
};

// Handle reload data with CMD + R
const handleReloadData = async () => {
  try {
    // Check if we have an active table tab
    const activeTabContent = tableStore.getActiveTabContent();
    
    if (activeTabContent?.type === 'table') {
      // We have an active table - check for unsaved changes
      const hasUnsavedChanges = await checkForUnsavedChanges();
      
      if (hasUnsavedChanges) {
        // Show confirmation dialog
        const confirmed = await showDiscardChangesDialog();
        if (!confirmed) {

          return;
        }
        // Clear unsaved changes if user confirmed
        if (rightSidebarRef.value && rightSidebarRef.value.clearUnsavedChanges) {
          rightSidebarRef.value.clearUnsavedChanges();
        }
      }
      
      // Reload table data

      if (rightSidebarRef.value && rightSidebarRef.value.handleRetryLoadData) {
        await rightSidebarRef.value.handleRetryLoadData();
      }
      
      ElMessage.success('Table data reloaded successfully');
    } else if (props.connection?.isConnected && props.connection?.id) {
      // No active table but we have a connection - reload table list

      await loadTables();
      ElMessage.success('Table list reloaded successfully');
    } else {
      // No active table and no connection - skip

      ElMessage.info('No data to reload');
    }
  } catch (error) {
    console.error('Error during reload:', error);
    ElMessage.error('Failed to reload data');
  }
};

// Check for unsaved changes in the active table
const checkForUnsavedChanges = async (): Promise<boolean> => {
  if (rightSidebarRef.value && rightSidebarRef.value.hasUnsavedChanges) {
    return rightSidebarRef.value.hasUnsavedChanges();
  }
  return false;
};

// Show confirmation dialog for discarding changes
const showDiscardChangesDialog = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    ElMessageBox.confirm(
      'You have unsaved changes. Are you sure you want to discard them and reload the data?',
      'Discard Changes',
      {
        confirmButtonText: 'Discard & Reload',
        cancelButtonText: 'Cancel',
        type: 'warning',
        distinguishCancelAndClose: true,
      }
    ).then(() => {
      resolve(true);
    }).catch(() => {
      resolve(false);
    });
  });
};

// Keyboard shortcuts
const handleKeydown = async (event: KeyboardEvent) => {
  // Ctrl+N (Windows/Linux) or Cmd+N (Mac) for new connection
  // Only allow when we have an active connection
  if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
    if (props.connection) {
      event.preventDefault();

      emit('open-new-window');
    } else {

    }
  }
  
  // CMD + R is now handled by Home.vue and calls handleReloadData directly
  // No need to handle it here anymore
};

onMounted(() => {
  // Add event listener with high priority (capture phase)
  document.addEventListener('keydown', handleKeydown, { capture: true, passive: false });
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, { capture: true });
});

// Watch for connection changes to load tables
watch(() => props.connection?.database, (newDatabase: string | undefined, oldDatabase: string | undefined) => {
  if (newDatabase && props.connection?.isConnected && props.connection?.id) {
    // Add delay to ensure connection is fully established
    setTimeout(() => {
      loadTables();
    }, 100);
    
    // Note: Database state switching is handled by Home.vue
    // No need to call switchToDatabase here to avoid duplicate calls
  } else {
    tables.value = [];
  }
}, { immediate: true });

watch(() => props.connection?.isConnected, (isConnected: boolean | undefined) => {

  if (isConnected && props.connection?.database && props.connection?.id) {
    loadTables();
  } else {
    tables.value = [];
  }
});

// Watch for connection object changes
watch(() => props.connection, (newConnection) => {

  if (newConnection?.database && newConnection?.isConnected && newConnection?.id) {
    loadTables();
  } else {
    tables.value = [];
  }
}, { immediate: true });

const executeQuery = async () => {
  if (!query.value.trim()) return;
  await runQuery(query.value);
};

const clearQuery = () => {
  query.value = '';
};

// Expose methods for parent component
defineExpose({
  addQueryTab,
  handleReloadData
});

</script>

<style scoped>
.query-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.query-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.query-workspace {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  padding: 1rem;
}



.editor-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem;
}

.editor-container {
  flex: 1;
}

.error-message {
  color: var(--el-color-danger);
  padding: 0.5rem;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
}

.query-results {
  margin-top: 1rem;
}

.el-main {
  padding: 0;
  overflow: hidden;
  transition: margin-right 0.3s ease;
}

.el-main.with-row-detail {
  margin-right: 400px;
}

.no-database-main,
.not-connected-main {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color-page);
}

.no-database-content,
.not-connected-content {
  text-align: center;
  color: var(--el-text-color-regular);
  max-width: 400px;
}

.no-database-content h2,
.not-connected-content h2 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
  font-size: 1.5rem;
  font-weight: 600;
}

.no-database-content p,
.not-connected-content p {
  margin: 0.5rem 0;
  color: var(--el-text-color-secondary);
  font-size: 1rem;
  line-height: 1.5;
}

.database-icon,
.connection-icon {
  color: var(--el-text-color-placeholder);
}
</style> 