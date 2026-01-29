<template>
  <div class="connection-content">
    <div v-if="connection" class="content-container">
      <!-- Left Sidebar: Tables List -->
      <div class="tables-sidebar">
        <div class="sidebar-header">
          <h3>Tables</h3>
          <span v-if="!isLoadingTables && tables.length > 0" class="tables-count">{{ tables.length }}</span>
        </div>

        <!-- No Database Selected -->
        <div v-if="!connection.database" class="no-database">
          <el-icon :size="48" class="database-icon">
            <Folder />
          </el-icon>
          <p class="no-database-text">No database selected</p>
          <el-button type="primary" size="small" @click="showDatabaseModal = true">
            Select Database
          </el-button>
        </div>

        <!-- Loading Tables -->
        <div v-else-if="isLoadingTables" class="loading">
          <el-skeleton :rows="5" animated />
        </div>

        <!-- Tables List -->
        <div v-else-if="tables.length > 0" class="tables-list-wrapper">
          <div class="tables-filter">
            <el-input
              v-model="tableNameFilter"
              placeholder="Filter by table name..."
              clearable
              size="small"
              class="table-filter-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <div class="tables-list">
            <template v-if="filteredTables.length > 0">
              <div
                v-for="table in filteredTables"
                :key="table.name"
                class="table-item"
                :class="{ active: activeTableName === table.name }"
                @click="handleSelectTable(table)"
              >
                <el-icon class="table-icon">
                  <Document />
                </el-icon>
                <span class="table-name">{{ table.name }}</span>
              </div>
            </template>
            <div v-else class="no-match">
              <span>No tables match "{{ tableNameFilter }}"</span>
            </div>
          </div>
        </div>

        <!-- No Tables -->
        <div v-else class="no-tables">
          <el-empty description="No tables found" :image-size="80" />
        </div>
      </div>

      <!-- Right Content: Tabs -->
      <div class="content-area">
        <!-- Default: Connection Info -->
        <div v-if="tabs.length === 0" class="connection-info-default">
          <el-card>
            <template #header>
              <div class="card-header">
                <div class="header-left">
                  <el-icon class="header-icon">
                    <Connection />
                  </el-icon>
                  <span>{{ connection.name || `${connection.type} - ${connection.host}` }}</span>
                </div>
                <div class="header-right">
                  <el-tag :type="connection.isConnected ? 'success' : 'danger'" size="default">
                    {{ connection.isConnected ? 'Connected' : 'Disconnected' }}
                  </el-tag>
                </div>
              </div>
            </template>
            <div class="connection-details">
              <div class="detail-item">
                <span class="detail-label">Type:</span>
                <span class="detail-value">{{ connection.type.toUpperCase() }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Host:</span>
                <span class="detail-value">{{ connection.host }}:{{ connection.port }}</span>
              </div>
              <div v-if="connection.database" class="detail-item">
                <span class="detail-label">Database:</span>
                <span class="detail-value">{{ connection.database }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Username:</span>
                <span class="detail-value">{{ connection.username }}</span>
              </div>
              <div v-if="connection.lastActivity" class="detail-item">
                <span class="detail-label">Last Activity:</span>
                <span class="detail-value">{{ formatDate(connection.lastActivity) }}</span>
              </div>
            </div>
          </el-card>
        </div>

        <!-- Tabs View -->
        <div v-else class="tabs-container">
          <el-tabs v-model="activeTabId" type="card" closable @tab-remove="handleRemoveTab" @tab-click="handleTabClick">
            <el-tab-pane
              v-for="tab in tabs"
              :key="tab.id"
              :label="tab.tableName"
              :name="tab.id"
            >
              <div class="tab-content-wrapper">
                <!-- Main Content Area -->
                <div class="tab-main-content">
                  <!-- Query Editor Tab -->
                  <QueryEditorTab
                    v-if="tab.tabType === 'query'"
                    :connection-id="connection?.id"
                    :db-type="connection?.type || 'postgresql'"
                  />

                  <!-- Table Tabs -->
                  <template v-else>
                    <!-- Structure View -->
                    <TableStructureView
                      v-if="tab.viewMode === 'structure'"
                      :structure="tab.structure"
                      :is-loading="tab.isLoadingStructure === true"
                      :error="tab.structureError || null"
                    />

                    <!-- Data View -->
                    <TableDataView
                      v-else-if="tab.viewMode === 'data'"
                      :data="tab.data"
                      :is-loading="tab.isLoadingData === true"
                      :error="tab.dataError || null"
                      :db-type="connection?.type || 'postgresql'"
                      @filter-apply="(whereClause: string | null) => handleFilterApply(tab, whereClause)"
                    />

                    <!-- Fallback if no view mode -->
                    <div v-else class="no-view-mode">
                      <el-empty description="No view mode selected" />
                    </div>
                  </template>
                </div>

                <!-- Footer (only for table tabs) -->
                <TableViewFooter
                  v-if="tab.tabType !== 'query'"
                  :view-mode="tab.viewMode || 'data'"
                  :data="tab.data"
                  @update:view-mode="(val: 'structure' | 'data') => switchViewMode(tab, val)"
                  @page-change="(page: number) => handlePageChange(tab, page)"
                  @per-page-change="(perPage: number) => handlePerPageChange(tab, perPage)"
                />
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </div>

    <div v-else class="no-connection">
      <el-empty description="No connection selected">
        <p class="empty-text">Select a connection from the sidebar to view details</p>
      </el-empty>
    </div>

    <!-- Database Select Modal -->
    <DatabaseSelectModal
      v-model="showDatabaseModal"
      :connection-id="connection?.id"
      @selected="handleDatabaseSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { useDatabase } from '@/composables/useDatabase';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { Connection, Document, Folder, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import DatabaseSelectModal from './DatabaseSelectModal.vue';
import QueryEditorTab from './QueryEditorTab.vue';
import TableDataView from './TableDataView.vue';
import TableStructureView from './TableStructureView.vue';
import TableViewFooter from './TableViewFooter.vue';

interface Table {
  name: string;
  type?: string;
}

interface Tab {
  id: string;
  tableName: string;
  tableType?: string;
  tabType?: 'table' | 'query'; // 'table' for table tabs, 'query' for query editor tabs
  viewMode?: 'structure' | 'data';
  isLoadingStructure?: boolean;
  isLoadingData?: boolean;
  structureError?: string;
  dataError?: string;
  structure?: {
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      ordinal_position?: number;
      character_set?: string;
      collation?: string;
      default_value?: string;
      extra?: string;
      foreign_key?: string;
      comment?: string;
    }>;
    indexes?: Array<{
      name: string;
      algorithm?: string;
      is_unique: boolean;
      column_name: string;
    }>;
    rows?: number;
  };
  data?: {
    rows: any[];
    total: number;
    page: number;
    perPage: number;
  };
  whereClause?: string | null;
}

const connectionsStore = useConnectionsStore();
const { currentConnection, activeConnections, currentTabId, switchToConnection } = connectionsStore;
const { getTables, getTableStructure, executeQuery } = useDatabase();

// Use currentConnection, but fallback to first active connection if currentConnection is null
const connection = computed(() => {
  const conn = currentConnection || (activeConnections.length > 0 ? activeConnections[0] : null);

  console.log('ConnectionContent - Computing connection:', {
    hasCurrentConnection: !!currentConnection,
    currentTabId: currentTabId,
    activeConnectionsCount: activeConnections.length,
    connection: conn ? {
      id: conn.id,
      name: conn.name,
      database: conn.database,
      type: conn.type
    } : null
  });

  return conn;
});

const tables = ref<Table[]>([]);
const tableNameFilter = ref('');
const isLoadingTables = ref(false);
const activeTableName = ref<string>('');

const filteredTables = computed(() => {
  const q = tableNameFilter.value.trim().toLowerCase();
  if (!q) return tables.value;
  return tables.value.filter(t => t.name.toLowerCase().includes(q));
});
const tabs = ref<Tab[]>([]);
const activeTabId = ref<string>('');
const showDatabaseModal = ref(false);

// Define loadTables function before watch to avoid "Cannot access before initialization" error
const loadTables = async () => {
  if (!connection.value?.id || !connection.value?.database) {
    console.log('Cannot load tables - missing connection or database:', {
      hasConnection: !!connection.value,
      hasId: !!connection.value?.id,
      hasDatabase: !!connection.value?.database,
      connection: connection.value
    });
    tables.value = [];
    return;
  }

  console.log('Loading tables for connection:', {
    id: connection.value.id,
    database: connection.value.database,
    type: connection.value.type
  });
  isLoadingTables.value = true;
  try {
    const tableList = await getTables(connection.value.id);
    console.log('Loaded tables result:', {
      count: tableList?.length || 0,
      tables: tableList,
      isArray: Array.isArray(tableList)
    });
    tables.value = tableList || [];
  } catch (error) {
    console.error('Failed to load tables:', error);
    tables.value = [];
  } finally {
    isLoadingTables.value = false;
  }
};

// Watch activeConnections to ensure currentTabId is set
watch(
  () => activeConnections,
  (newConnections) => {
    if (newConnections.length > 0 && !currentTabId) {
      console.log('No currentTabId, switching to first connection');
      switchToConnection(newConnections[0].tabId);
    }
  },
  { immediate: true, deep: true }
);

// Load tables when connection or database changes
watch(
  () => [connection.value?.id, connection.value?.database],
  async () => {
    console.log('Connection changed:', {
      hasConnection: !!connection.value,
      connectionId: connection.value?.id,
      database: connection.value?.database,
      activeConnectionsCount: activeConnections.length
    });

    if (connection.value?.database) {
      await loadTables();
    } else {
      tables.value = [];
      activeTableName.value = '';
    }
  },
  { immediate: true }
);

const handleSelectTable = async (table: Table) => {
  activeTableName.value = table.name;

  // Check if tab already exists
  const existingTab = tabs.value.find(tab => tab.tableName === table.name);
  if (existingTab) {
    activeTabId.value = existingTab.id;
    // Load data if not loaded
    if (!existingTab.structure && connection.value?.id) {
      await loadTableStructure(existingTab);
    }
    return;
  }

  // Create new tab
  const newTab: Tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tableName: table.name,
    tableType: table.type,
    viewMode: 'data', // Default to data mode
    isLoadingStructure: false,
    isLoadingData: false,
  };

  tabs.value.push(newTab);
  activeTabId.value = newTab.id;

  // Load table data by default
  if (connection.value?.id) {
    await loadTableData(newTab);
  }
};

const handleRemoveTab = (tabId: string) => {
  const index = tabs.value.findIndex(tab => tab.id === tabId);
  if (index > -1) {
    tabs.value.splice(index, 1);

    // If removed tab was active, switch to another tab or clear active
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        activeTabId.value = tabs.value[tabs.value.length - 1].id;
        activeTableName.value = tabs.value[tabs.value.length - 1].tableName;
      } else {
        activeTabId.value = '';
        activeTableName.value = '';
      }
    }
  }
};

const handleTabClick = async (tab: any) => {
  const tabData = tabs.value.find(t => t.id === tab.name);
  if (tabData) {
    activeTableName.value = tabData.tableName;
    // Load structure if not loaded
    if (!tabData.structure && connection.value?.id) {
      await loadTableStructure(tabData);
    }
  }
};

// Load table structure
const loadTableStructure = async (tab: Tab) => {
  if (!connection.value?.id) {
    tab.structureError = 'No connection available';
    tab.isLoadingStructure = false;
    return;
  }

  tab.isLoadingStructure = true;
  tab.structureError = undefined;
  tab.structure = undefined; // Clear previous structure

  try {
    console.log('Loading table structure for:', tab.tableName, 'connection:', connection.value.id);
    const structure = await getTableStructure(connection.value.id, tab.tableName);
    console.log('Table structure loaded:', structure);
    console.log('Structure columns:', structure?.columns);
    console.log('Structure columns length:', structure?.columns?.length);

    if (structure && structure.columns && Array.isArray(structure.columns)) {
      // Find the tab in the array to ensure we're modifying the reactive object
      const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
      if (tabIndex !== -1) {
        // Modify the reactive object directly
        tabs.value[tabIndex].structure = {
          columns: structure.columns,
          indexes: structure.indexes || [],
          rows: structure.rows,
        };
        tabs.value[tabIndex].isLoadingStructure = false;
        console.log('Tab structure set via array index:', tabs.value[tabIndex].structure);
      } else {
        // Fallback: direct assignment
        tab.structure = {
          columns: structure.columns,
          indexes: structure.indexes || [],
          rows: structure.rows,
        };
        console.log('Tab structure set directly:', tab.structure);
      }
    } else {
      tab.structureError = 'No structure data returned';
      console.warn('No structure data:', structure);
      tab.structure = undefined;
    }
  } catch (error) {
    console.error('Failed to load table structure:', error);
    tab.structureError = error instanceof Error ? error.message : 'Failed to load table structure';
    tab.structure = undefined;
  } finally {
    // Ensure loading state is set to false
    const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].isLoadingStructure = false;
    } else {
      tab.isLoadingStructure = false;
    }
    await nextTick(); // Wait for Vue to update
    console.log('Loading finished. isLoadingStructure:', tab.isLoadingStructure, 'hasStructure:', !!tab.structure, 'columnsCount:', tab.structure?.columns?.length);
  }
};

// Load table data
const loadTableData = async (tab: Tab, page: number = 1, perPage: number = 50) => {
  if (!connection.value?.id) {
    const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
    if (tabIndex !== -1) {
      tabs.value[tabIndex].dataError = 'No connection available';
      tabs.value[tabIndex].isLoadingData = false;
    } else {
      tab.dataError = 'No connection available';
      tab.isLoadingData = false;
    }
    return;
  }

  // Find tab in array to ensure reactivity
  const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
  const targetTab = tabIndex !== -1 ? tabs.value[tabIndex] : tab;

  targetTab.isLoadingData = true;
  targetTab.dataError = undefined;

  try {
    const offset = (page - 1) * perPage;
    // Escape table name properly based on database type
    let tableName: string;
    if (connection.value.type === 'postgresql') {
      tableName = `"${tab.tableName}"`;
    } else if (connection.value.type === 'mysql') {
      tableName = `\`${tab.tableName}\``;
    } else {
      tableName = tab.tableName;
    }

    console.log('Loading table data:', tab.tableName, 'page:', page, 'perPage:', perPage, 'whereClause:', tab.whereClause);

    // Build WHERE clause
    const whereClause = tab.whereClause ? ` WHERE ${tab.whereClause}` : '';

    // Get total count first
    const countQuery = `SELECT COUNT(*) as total FROM ${tableName}${whereClause}`;
    const countResult = await window.electron?.invoke('database:query', {
      connectionId: connection.value.id,
      query: countQuery
    });

    console.log('Count result:', countResult);

    const total = countResult?.success && countResult.data?.[0]?.total
      ? parseInt(String(countResult.data[0].total), 10)
      : 0;

    // Get data
    const queryStr = `SELECT * FROM ${tableName}${whereClause} LIMIT ${perPage} OFFSET ${offset}`;
    const result = await window.electron?.invoke('database:query', {
      connectionId: connection.value.id,
      query: queryStr
    });

    console.log('Table data query result:', result);
    console.log('Result data:', result?.data);
    console.log('Result data type:', Array.isArray(result?.data));
    console.log('Result data length:', result?.data?.length);

    if (result?.success && result.data) {
      const dataRows = Array.isArray(result.data) ? result.data : [];
      const dataObj = {
        rows: dataRows,
        total,
        page,
        perPage,
      };

      // Update via array index for reactivity
      if (tabIndex !== -1) {
        tabs.value[tabIndex].data = dataObj;
        tabs.value[tabIndex].isLoadingData = false;
      } else {
        tab.data = dataObj;
        tab.isLoadingData = false;
      }

      console.log('Data set:', dataObj);
      await nextTick();
    } else {
      const errorMsg = result?.error || 'Failed to load table data';
      if (tabIndex !== -1) {
        tabs.value[tabIndex].dataError = errorMsg;
        tabs.value[tabIndex].isLoadingData = false;
      } else {
        tab.dataError = errorMsg;
        tab.isLoadingData = false;
      }
    }
  } catch (error) {
    console.error('Failed to load table data:', error);
    const errorMsg = error instanceof Error ? error.message : 'Failed to load table data';
    if (tabIndex !== -1) {
      tabs.value[tabIndex].dataError = errorMsg;
      tabs.value[tabIndex].isLoadingData = false;
    } else {
      tab.dataError = errorMsg;
      tab.isLoadingData = false;
    }
  }
};

// Switch view mode
const switchViewMode = async (tab: Tab, mode: 'structure' | 'data') => {
  const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].viewMode = mode;
  } else {
    tab.viewMode = mode;
  }

  if (mode === 'data') {
    const targetTab = tabIndex !== -1 ? tabs.value[tabIndex] : tab;
    if (!targetTab.data && connection.value?.id) {
      await loadTableData(targetTab);
    }
  } else if (mode === 'structure') {
    const targetTab = tabIndex !== -1 ? tabs.value[tabIndex] : tab;
    if (!targetTab.structure && connection.value?.id) {
      await loadTableStructure(targetTab);
    }
  }
};

// Handle pagination change
const handlePageChange = async (tab: Tab, page: number) => {
  if (tab.data) {
    await loadTableData(tab, page, tab.data.perPage);
  }
};

// Handle per page change
const handlePerPageChange = async (tab: Tab, perPage: number) => {
  if (tab.data) {
    await loadTableData(tab, 1, perPage);
  }
};

// Handle filter apply
const handleFilterApply = async (tab: Tab, whereClause: string | null) => {
  const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
  const targetTab = tabIndex !== -1 ? tabs.value[tabIndex] : tab;

  // Set whereClause
  targetTab.whereClause = whereClause;

  // Reload data with filter
  // Use current page and perPage from existing data, or defaults
  const page = targetTab.data?.page || 1;
  const perPage = targetTab.data?.perPage || 50;

  await loadTableData(targetTab, page, perPage);
};

// Handle add new query tab
const handleAddQuery = () => {
  console.log('ConnectionContent: handleAddQuery called', {
    hasConnection: !!connection.value,
    connectionId: connection.value?.id
  });

  if (!connection.value?.id) {
    ElMessage.warning('Please connect to a database first');
    return;
  }

  // Count existing query tabs to generate name
  const queryTabs = tabs.value.filter(t => t.tabType === 'query');
  let queryName = 'New Query';
  if (queryTabs.length > 0) {
    queryName = `New Query ${queryTabs.length}`;
  }

  // Create new query tab
  const newQueryTab: Tab = {
    id: `query-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tableName: queryName,
    tabType: 'query',
  };

  tabs.value.push(newQueryTab);
  activeTabId.value = newQueryTab.id;

  console.log('ConnectionContent: New query tab created', newQueryTab);
};

// Expose method for parent components
defineExpose({
  handleAddQuery
});

// Get column names from data rows

const handleDatabaseSelected = async (databaseName: string) => {
  // Reload tables after database is selected
  await loadTables();
};

// Debug on mount
onMounted(() => {
  console.log('ConnectionContent mounted:', {
    hasConnection: !!connection.value,
    connection: connection.value,
    currentConnection: currentConnection,
    activeConnections: activeConnections,
    currentTabId: currentTabId
  });
});

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInMs = now.getTime() - d.getTime();
  const diffInMins = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMs / 3600000);
  const diffInDays = Math.floor(diffInMs / 86400000);

  if (diffInMins < 1) return 'Just now';
  if (diffInMins < 60) return `${diffInMins} minute${diffInMins > 1 ? 's' : ''} ago`;
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;

  return d.toLocaleDateString();
};
</script>

<style scoped lang="scss">
.connection-content {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: transparent;
  overflow: hidden;

  .content-container {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  // Left Sidebar: Tables
  .tables-sidebar {
    width: 280px;
    min-width: 280px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--el-bg-color-page);
    border-right: 1px solid var(--el-border-color);
    overflow: hidden;
    flex-shrink: 0;

    .dark & {
      background-color: rgba(45, 55, 72, 0.6);
      border-right-color: rgba(74, 85, 104, 0.5);
    }

    [data-theme="light"] & {
      background-color: rgba(255, 255, 255, 0.8);
      border-right-color: rgba(226, 232, 240, 0.8);
    }

    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--el-border-color-light);
      display: flex;
      justify-content: space-between;
      align-items: center;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      .tables-count {
        font-size: 12px;
        color: var(--el-text-color-secondary);
        background-color: var(--el-color-primary-light-9);
        padding: 2px 8px;
        border-radius: 12px;
        font-weight: 500;
      }
    }

    .no-database {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      text-align: center;

      .database-icon {
        color: var(--el-text-color-placeholder);
        margin-bottom: 16px;
      }

      .no-database-text {
        margin-bottom: 16px;
        color: var(--el-text-color-regular);
        font-size: 14px;
      }
    }

    .loading {
      flex: 1;
      padding: 20px;
    }

    .tables-list-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .tables-filter {
      flex-shrink: 0;
      padding: 8px;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .table-filter-input {
      width: 100%;
    }

    .tables-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;

      .table-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
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

          .table-name {
            color: var(--el-color-primary);
            font-weight: 600;
          }
        }

        .table-icon {
          font-size: 16px;
          color: var(--el-text-color-regular);
          margin-right: 8px;
        }

        .table-name {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }
      }
    }

    .no-match {
      padding: 16px;
      text-align: center;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    .no-tables {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
  }

  // Right Content Area
  .content-area {
    flex: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: transparent;

    .connection-info-default {
      flex: 1;
      padding: 20px;
      overflow-y: auto;

      :deep(.el-card) {
        border: 1px solid var(--el-border-color);
        background-color: var(--el-bg-color-page);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

        .dark & {
          background-color: rgba(45, 55, 72, 0.8);
          border-color: rgba(74, 85, 104, 0.5);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        [data-theme="light"] & {
          background-color: rgba(255, 255, 255, 0.9);
          border-color: rgba(226, 232, 240, 0.8);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
      }

      :deep(.el-card__header) {
        padding: 16px;
        background-color: transparent;
        border-bottom: 1px solid var(--el-border-color-light);

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;

          .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
            font-size: 16px;
            color: var(--el-text-color-primary);

            .header-icon {
              font-size: 20px;
              color: var(--el-color-primary);
            }
          }

          .header-right {
            display: flex;
            align-items: center;
          }
        }
      }

      :deep(.el-card__body) {
        padding: 16px;
        background-color: transparent;
      }

      .connection-details {
        display: flex;
        flex-direction: column;
        gap: 16px;

        .detail-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 6px;
          background-color: var(--el-fill-color-lighter);

          .dark & {
            background-color: rgba(74, 85, 104, 0.3);
          }

          [data-theme="light"] & {
            background-color: rgba(247, 250, 252, 0.8);
          }

          .detail-label {
            font-weight: 600;
            color: var(--el-text-color-regular);
            min-width: 120px;
            margin-right: 12px;
          }

          .detail-value {
            color: var(--el-text-color-primary);
            font-size: 14px;
          }
        }
      }
    }

    .tabs-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      :deep(.el-tabs) {
        height: 100%;
        display: flex;
        flex-direction: column;

        .el-tabs__header {
          margin: 0;
          padding: 0 16px;
          background-color: var(--el-bg-color-page);
          border-bottom: 1px solid var(--el-border-color-light);
        }

        .el-tabs__content {
          flex: 1;
          overflow: hidden;
          padding: 0;

          .el-tab-pane {
            height: 100%;
            overflow-y: auto;
            padding: 20px;
          }
        }
      }

      .tab-content-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background-color: var(--el-bg-color);
      }

      .tab-main-content {
        flex: 1;
        overflow-y: auto;
        background-color: var(--el-bg-color);
      }
    }
  }

  .no-connection {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;

    .empty-text {
      margin-top: 12px;
      color: var(--el-text-color-regular);
      font-size: 14px;
    }
  }
}
</style>
