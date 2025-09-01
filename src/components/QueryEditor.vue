<template>
  <div class="query-editor">
    <!-- Title Bar -->
            <!-- QueryTitleBar removed - functionality moved to CustomTitleBar -->
    
    <div class="query-content">
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
      <el-main>
        <RightSidebar
          :visible="true"
          :active-table-name="activeTableName || undefined"
          :connection-id="props.connection?.id"
          ref="rightSidebarRef"
          @table-selected="handleTableSelected"
        />
      </el-main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { ActiveConnection } from '../composables/useConnections';
import { useDatabase } from '../composables/useDatabase';
import { useTableStore } from '../stores/tableStore';
import DatabaseTables from './DatabaseTables.vue';
import RightSidebar from './RightSidebar.vue';

const props = defineProps<{
  connection: ActiveConnection | null;
}>();

const emit = defineEmits<{
  'new-connection': [];
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
const showRightSidebar = ref(false);
const rightSidebarRef = ref();
const activeTableName = ref<string | null>(null);

// Methods

const handleSelectTable = async (table: { name: string; type?: string }) => {
  // Add table info to right sidebar (don't update main query)
  if (rightSidebarRef.value) {
    try {
      // First try to refresh connection status and auto-reconnect if needed
      if (props.connection && !props.connection.isConnected) {
        console.log('Connection appears to be disconnected, attempting to refresh...');
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

// Method to add query tab
const addQueryTab = () => {
  tableStore.addQueryTab();
};

// Expose methods for parent component
defineExpose({
  addQueryTab
});

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
    console.log('No connection ID available for verification');
    return false;
  }
  
  try {
    // Check if connection is still active in database service
    const hasConnections = await hasActiveConnections();
    console.log('Database service has active connections:', hasConnections);
    return hasConnections;
  } catch (error) {
    console.error('Error verifying connection:', error);
    return false;
  }
};

const loadTables = async () => {
  // Check if we have a valid connection and are connected
  if (!props.connection?.database || !props.connection?.isConnected || !props.connection?.id) {
    console.log('Skipping loadTables - no valid connection or not connected', {
      database: props.connection?.database,
      isConnected: props.connection?.isConnected,
      id: props.connection?.id
    });
    tables.value = [];
    return;
  }
  
  // Verify connection is still active
  const isConnectionActive = await verifyConnection();
  if (!isConnectionActive) {
    console.log('Connection verification failed - connection may be inactive');
    tables.value = [];
    return;
  }
  
  isLoadingTables.value = true;
  try {
    console.log('Loading tables for connection:', props.connection.id);
    // Load real tables from database using the specific connection ID
    const databaseTables = await getTables(props.connection.id);
    
    // Ensure databaseTables is an array
    if (Array.isArray(databaseTables)) {
      tables.value = databaseTables;
      console.log(`Loaded ${databaseTables.length} tables for connection ${props.connection.id}`);
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

// Keyboard shortcuts
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl+N (Windows/Linux) or Cmd+N (Mac) for new connection
  // Only allow when we have an active connection
  if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
    if (props.connection) {
      event.preventDefault();
      console.log('Ctrl+N pressed in QueryEditor with active connection');
      emit('new-connection');
    } else {
      console.log('Ctrl+N pressed but no active connection - ignored');
    }
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// Watch for connection changes to load tables
watch(() => props.connection?.database, (newDatabase: string | undefined) => {
  console.log('Database changed:', newDatabase, 'isConnected:', props.connection?.isConnected);
  if (newDatabase && props.connection?.isConnected && props.connection?.id) {
    loadTables();
  } else {
    tables.value = [];
  }
}, { immediate: true });

watch(() => props.connection?.isConnected, (isConnected: boolean | undefined) => {
  console.log('Connection status changed:', isConnected, 'database:', props.connection?.database);
  if (isConnected && props.connection?.database && props.connection?.id) {
    loadTables();
  } else {
    tables.value = [];
  }
});

// Watch for connection object changes
watch(() => props.connection, (newConnection) => {
  console.log('Connection object changed:', newConnection?.id, 'isConnected:', newConnection?.isConnected);
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
}
</style> 