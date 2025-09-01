<template>
  <div class="right-sidebar">
    <!-- Browser-style Tabs -->
    <div class="tabs-container">
      <div class="tabs-list">
        <div v-for="tab in tableStore.tabs" :key="tab.id" class="tab-item"
          :class="{ active: tableStore.activeTab === tab.id }" @click="setActiveTab(tab.id)">
          <span class="tab-title">{{ tab.title }}</span>
          <el-button size="small" class="close-tab" @click.stop="closeTab(tab.id)">
            <el-icon>
              <Close />
            </el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- Tab Content Area -->
    <div class="content-container">
      <div v-if="tableStore.activeTab && getActiveTabContent()" class="content-area">
        <!-- Table Info Tab -->
        <div v-if="getActiveTabContent()?.type === 'table'" class="table-info">
          <div class="table-info-wrapper">
            <!-- 1. Filter Section (only show in data mode) -->
            <TableFilterSection v-if="displayMode === 'data'"
              :columns="(getActiveTabContent()?.data as TableData)?.columns || []" @update:filters="handleFiltersUpdate"
              @apply-filters="handleApplyFilters" />


            <!-- 2. Main Content Section -->
            <TableMainContent :display-mode="displayMode"
              :columns="(getActiveTabContent()?.data as TableData)?.columns || []"
              :table-name="(getActiveTabContent()?.data as TableData)?.name || ''"
              :rows="(getActiveTabContent()?.data as TableData)?.rows" :table-data="tableData"
              :is-loading-data="isLoadingData" :indexes="(getActiveTabContent()?.data as TableData)?.indexes || []"
              @refresh-data="handleRetryLoadData" />



            <!-- 3. Settings Section -->
            <TableSettings :display-mode="displayMode" :records-per-page="recordsPerPage" :current-page="currentPage"
              :total-pages="totalPages" @update:display-mode="handleDisplayModeUpdate"
              @update:records-per-page="handleRecordsPerPageUpdate" @update:current-page="handleCurrentPageUpdate"
              @load-data="handleRetryLoadData" />
          </div>

          <!-- 4. SQL Section -->
          <TableSqlHistory :executed-queries="executedQueries" />
        </div>

        <!-- Query Tab -->
        <div v-else-if="getActiveTabContent()?.type === 'query'" class="query-editor">
          <SqlEditor :connection-id="connectionId" @query-executed="handleQueryExecuted" />
        </div>
      </div>

      <div v-else class="empty-state">
        <el-empty description="Click on a table to view its information" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue';
import { computed, watch } from 'vue';
import { useDatabase } from '../composables/useDatabase';
import { useTableStore } from '../stores/tableStore';
import SqlEditor from './SqlEditor.vue';
import TableFilterSection from './TableFilterSection.vue';
import TableMainContent from './TableMainContent.vue';
import TableSettings from './TableSettings.vue';
import TableSqlHistory from './TableSqlHistory.vue';

// Use types from Pinia store
import type { QueryData, TableData } from '../stores/tableStore';

const props = defineProps<{
  visible: boolean;
  activeTableName?: string;
  connectionId?: string; // Add connection ID prop
}>();

const emit = defineEmits<{
  'close-sidebar': [];
  'table-selected': [tableName: string];
}>();

// Get current connection from useDatabase
const { currentConnection } = useDatabase();

// Use Pinia store
const tableStore = useTableStore();

// Use computed properties from Pinia store
const hasTabs = computed(() => tableStore.hasTabs);

// Get active table state from store
const activeTableState = computed(() => tableStore.activeTableState);

const displayMode = computed(() => tableStore.displayMode);

const filterRows = computed(() => tableStore.filterRows);
const tableData = computed(() => tableStore.tableData);
const isLoadingData = computed(() => tableStore.isLoadingData);
const recordsPerPage = computed(() => tableStore.recordsPerPage);
const currentPage = computed(() => tableStore.currentPage);
const totalPages = computed(() => tableStore.totalPages);
const executedQueries = computed(() => tableStore.executedQueries);

// Methods
// Use Pinia store methods
const setActiveTab = (tabId: string) => {
  tableStore.activeTab = tabId;

  // Emit table-selected event if this is a table tab
  const tab = tableStore.getActiveTabContent();
  if (tab?.type === 'table' && tab.data && 'name' in tab.data) {
    emit('table-selected', tab.data.name);
  }
};

const getActiveTabContent = () => {
  return tableStore.getActiveTabContent();
};

const addQueryTab = () => {
  tableStore.addQueryTab();
};

const addTableTab = async (tableData: any) => {
  // This method is now handled by the store
  // The store will automatically load table data
  console.log('addTableTab called - this should be handled by store');
};

const closeTab = (tabId: string) => {
  tableStore.closeTab(tabId);
};

const executeQuery = async () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;

    try {
      // TODO: Implement actual query execution
      // For now, just mock a result
      queryData.result = {
        success: true,
        data: [
          { id: 1, name: 'Test 1' },
          { id: 2, name: 'Test 2' }
        ],
        fields: [
          { name: 'id' },
          { name: 'name' }
        ]
      };

      // Add to executed queries for the active table tab if it exists
      if (tableStore.activeTab && tableStore.tableTabStates.has(tableStore.activeTab)) {
        tableStore.addExecutedQuery(queryData.query, true);
      }
    } catch (error) {
      queryData.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed'
      };

      // Add to executed queries with error for the active table tab if it exists
      if (tableStore.activeTab && tableStore.tableTabStates.has(tableStore.activeTab)) {
        tableStore.addExecutedQuery(queryData.query, false, error instanceof Error ? error.message : 'Query failed');
      }
    }
  }
};

const updateQuery = (value: string) => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;
    queryData.query = value;
  }
};

const clearQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'query' && activeTabContent.data) {
    const queryData = activeTabContent.data as QueryData;
    queryData.query = '';
    queryData.result = undefined;
  }
};

const generateSelectQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'table' && activeTabContent.data) {
    const tableData = activeTabContent.data as any;
    // Create a new query tab with SELECT * query
    tableStore.addQueryTab();
    const newTab = tableStore.getActiveTabContent();
    if (newTab?.type === 'query' && newTab.data) {
      newTab.data.query = `SELECT * FROM ${tableData.name}`;
    }
  }
};

const generateDescribeQuery = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'table' && activeTabContent.data) {
    const tableData = activeTabContent.data as any;
    // Create a new query tab with DESCRIBE query
    tableStore.addQueryTab();
    const newTab = tableStore.getActiveTabContent();
    if (newTab?.type === 'query' && newTab.data) {
      newTab.data.query = `DESCRIBE ${tableData.name}`;
    }
  }
};



// SQL generation and execution
const generateSQL = () => {
  const activeTabContent = getActiveTabContent();
  if (activeTabContent?.type === 'table' && activeTabContent.data && tableStore.activeTableState) {
    const tableData = activeTabContent.data as any;
    let sql = `SELECT * FROM ${tableData.name}`;

    const validFilters = filterRows.value.filter((f: any) => f.apply && f.column && f.operator && f.value);
    if (validFilters.length > 0) {
      sql += ' WHERE ' + validFilters.map((f: any) => `${f.column} ${f.operator} '${f.value}'`).join(' AND ');
    }

    if (displayMode.value === 'data') {
      sql += ` LIMIT ${recordsPerPage.value} OFFSET ${(currentPage.value - 1) * recordsPerPage.value}`;
    }

    // Store generated SQL in store if needed
    // generatedSQL.value = sql;
  }
};



// Watch for changes to regenerate SQL
watch([filterRows, displayMode, recordsPerPage, currentPage], () => {
  generateSQL();
}, { deep: true });



// Method to load table structure (columns)
const loadTableStructure = async (tableName: string) => {
  try {
    // TODO: Implement actual database call to get table structure
    // For now, we'll use the columns from the tableData
    const activeTabContent = getActiveTabContent();
    if (activeTabContent?.type === 'table' && activeTabContent.data) {
      const tableData = activeTabContent.data as TableData;

      // The columns should already be available from the tableData
      // This method can be extended to fetch more detailed column information
      // like constraints, indexes, etc. from the database
    }
  } catch (error) {
    console.error('Error loading table structure:', error);
  }
};

// Use Pinia store method
const addExecutedQuery = (sql: string, success: boolean, error?: string) => {
  tableStore.addExecutedQuery(sql, success, error);
};

// Event handlers for child components
const handleFiltersUpdate = (filters: Array<{ apply: boolean; column: string; operator: string; value: string }>) => {
  if (tableStore.activeTableState) {
    tableStore.activeTableState.filterRows = filters;
  }
};

const handleDisplayModeUpdate = (mode: 'data' | 'structure') => {
  if (tableStore.activeTableState) {
    tableStore.activeTableState.displayMode = mode;
  }
};

const handleRecordsPerPageUpdate = (records: number) => {
  if (tableStore.activeTableState) {
    tableStore.activeTableState.recordsPerPage = records;
  }
};

const handleCurrentPageUpdate = (page: number) => {
  if (tableStore.activeTableState) {
    tableStore.activeTableState.currentPage = page;
  }
};

const handleApplyFilters = (filters: Array<{ apply: boolean; column: string; operator: string; value: string }>) => {
  // Update filterRows with the new filters
  if (tableStore.activeTableState) {
    tableStore.activeTableState.filterRows = filters;
  }

  // Generate SQL with the applied filters
  generateSQL();

  // TODO: Execute the generated SQL to load data
  // This would typically call a method to load table data with the filters
};

const handleRetryLoadData = async () => {
  if (!tableStore.activeTab || !tableStore.tableTabStates.has(tableStore.activeTab)) {
    return;
  }

  const tableState = tableStore.tableTabStates.get(tableStore.activeTab)!;
  const tableData = getActiveTabContent()?.data as any;

  if (!tableData) {
    return;
  }

  try {
    // Set loading state
    tableState.isLoadingData = true;

    // Generate SQL for loading data with pagination
    const offset = (tableState.currentPage - 1) * tableState.recordsPerPage;
    const sql = `SELECT * FROM ${tableData.name} LIMIT ${tableState.recordsPerPage} OFFSET ${offset}`;

    // Execute query to get actual data
    const connectionId = props.connectionId || currentConnection.value?.id;

    const result = await window.electron.invoke('database:query', {
      connectionId: connectionId,
      query: sql
    });

    if (result.success) {
      // Update table data with real data (even if empty array)
      tableState.tableData = result.data || [];

      // Add to executed queries
      tableStore.addExecutedQuery(sql, true);

      // Check if data is empty
      if (!result.data || result.data.length === 0) {
        // Table has no data
      }
    } else {
      throw new Error(result.error || 'Failed to load table data');
    }
  } catch (error) {
    // Add error to executed queries
    const offset = (tableState.currentPage - 1) * tableState.recordsPerPage;
    const sql = `SELECT * FROM ${tableData.name} LIMIT ${tableState.recordsPerPage} OFFSET ${offset}`;
    const errorMessage = error instanceof Error ? error.message : 'Failed to load table data';
    tableStore.addExecutedQuery(sql, false, errorMessage);
  } finally {
    // Clear loading state
    tableState.isLoadingData = false;
  }
};

// Handle query execution from SqlEditor
const handleQueryExecuted = (result: any) => {
  // Query result is already handled by the store
  console.log('Query executed:', result);
};

// Expose methods for parent component
defineExpose({
  addTableTab,
  addQueryTab,
  setActiveTab,
  addExecutedQuery,
  handleRetryLoadData
});
</script>

<style scoped>
.right-sidebar {
  width: 100%;
  height: calc(100vh - 32px);
  background-color: var(--el-bg-color-page);
  display: flex;
  flex-direction: column;
}

.tabs-container {
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
  height: 35px;
  /* Match Tables header height */
  display: flex;
  align-items: center;
}

.tabs-list {
  display: flex;
  overflow-x: auto;
  align-items: flex-end;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.05rem 0.75rem;
  background-color: var(--el-bg-color-page);
  border: 0.5px solid var(--el-border-color);
  border-bottom: none;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 0;
  flex-shrink: 0;
  position: relative;
  height: 34px;
  /* Fixed height for consistency */
}

.tab-item:hover {
  background-color: var(--el-bg-color);
}

.tab-item.active {
  background-color: var(--el-bg-color);
  border-color: var(--el-border-color);
  border-bottom: 2px solid var(--el-color-primary);
  z-index: 1;
}



.tab-title {
  font-size: 0.875rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-tab {
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-regular);
}

.close-tab:hover {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}

.content-container {
  flex: 1;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-top: none;
  border-radius: 0 0 6px 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.content-area {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

/* Table Info Styles */
.table-info {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.label {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.value {
  color: var(--el-text-color-primary);
}

.table-info-wrapper {
  height: calc(100vh - 32px - 36px - 434px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.columns-section h5 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.column-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  font-size: 0.875rem;
}

.column-name {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.column-type {
  color: var(--el-text-color-regular);
  font-family: monospace;
}

.column-nullable {
  color: var(--el-text-color-secondary);
  font-size: 0.75rem;
}

/* Query Editor Styles */
.query-editor h4 {
  margin: 0 0 1rem 0;
  color: var(--el-text-color-primary);
}

.query-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.query-input {
  margin-bottom: 1rem;
}

.query-results h5 {
  margin: 1rem 0 0.5rem 0;
  color: var(--el-text-color-primary);
}

/* Table Tab Content Layout */
.table-info {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Filter section - fixed height */
.table-info>div:nth-child(1) {
  flex: 0 0 auto;
}

/* Main content section - takes most space but leaves room for bottom sections */
.table-info>div:nth-child(2) {
  flex: 1;
  /* Take remaining space */
  min-height: 400px;
  /* Reasonable minimum height */
  max-height: 400px;
  /* Reasonable maximum height */
  overflow: hidden;
  /* Hide overflow, let table handle scroll */
  display: flex;
  /* Ensure flex layout */
  flex-direction: column;
  /* Vertical layout */
}

/* Settings and SQL sections - no extra spacing */
.table-info>div:nth-child(3),
.table-info>div:nth-child(4) {
  flex: 0 0 auto;
  background-color: var(--el-bg-color-page);
  z-index: 10;
}



/* Ensure table info container has proper height */
.table-info {
  display: flex;
  flex-direction: column;
  /* Consistent spacing between sections */
}

.error-message {
  color: var(--el-color-danger);
  padding: 0.5rem;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Dark mode styles */
.dark .tab-item {
  background-color: #2d3748;
  border-color: #4a5568;
  color: var(--el-text-color-primary);
}

.dark .tab-item:hover {
  background-color: #4a5568;
  border-color: #718096;
}

.dark .tab-item.active {
  background-color: #1a202c;
  border-color: #409eff;
  border-bottom: 2px solid #409eff;
  color: #409eff;
}

.dark .tabs-container {
  background-color: #2d3748;
  border-bottom-color: #4a5568;
}

.dark .content-container {
  background-color: #1a202c;
  border-color: #4a5568;
}

.dark .column-item {
  background-color: #2d3748;
  border-color: #4a5568;
}

.dark .detail-item {
  border-bottom-color: #4a5568;
}
</style>
