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
          <div
            ref="tablesListRef"
            class="tables-list"
            tabindex="0"
            @keydown="onTablesSidebarKeydown"
            @contextmenu.prevent.stop="onTablesSidebarContextMenu"
          >
            <template v-if="filteredTables.length > 0">
              <el-dropdown
                v-for="table in filteredTables"
                :key="table.name"
                trigger="contextmenu"
                @command="(cmd: string | number) => onTableMenuCommand(String(cmd), table)"
              >
                <div
                  class="table-item"
                  :class="{
                    active: activeTableName === table.name,
                    'multi-selected': selectedTableNames.includes(table.name),
                  }"
                  @click="handleTableRowClick($event, table)"
                  @contextmenu.prevent.stop
                >
                  <el-icon class="table-icon">
                    <Document />
                  </el-icon>
                  <span class="table-name">{{ table.name }}</span>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="export">Export SQL…</el-dropdown-item>
                    <el-dropdown-item command="import">Import SQL</el-dropdown-item>
                    <el-dropdown-item divided command="drop">Drop Table…</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
            <div v-else class="no-match">
              <span>No tables match "{{ tableNameFilter }}"</span>
            </div>
          </div>
        </div>

        <!-- No Tables -->
        <div v-else class="no-tables" @contextmenu.prevent.stop="onTablesSidebarContextMenu">
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

        <!-- Tabs View + Data sidebar + bottom SQL panel (resizable) -->
        <div v-else class="content-split" ref="splitRef">
          <div ref="contentAreaInnerRef" class="content-area-inner">
            <div class="tabs-container">
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
              :ref="(el: any) => setTableDataViewRef(tab.id, el)"
              :data="tab.data"
              :is-loading="tab.isLoadingData === true"
              :error="tab.dataError || null"
              :db-type="connection?.type || 'postgresql'"
              :table-name="tab.tableName"
              :connection-id="connection?.id"
              :column-types="(tab.structure?.columns) ? Object.fromEntries(tab.structure.columns.map((c: { name: string; type: string }) => [c.name, c.type])) : {}"
              :columns-from-structure="tab.structure?.columns?.map((c: { name: string }) => c.name) ?? []"
              :sidebar-panel-open="dataSidebarVisible"
              :sidebar-selected-row-index="getDataSidebarState(tab.id).selectedRowIndex"
              :sidebar-selected-column="getDataSidebarState(tab.id).selectedColumn"
              :sidebar-modified-rows="getDataSidebarState(tab.id).modifiedRows"
              :sidebar-deleted-rows="getDataSidebarState(tab.id).deletedRows"
              :sort-by="tab.sortBy || null"
              :sort-order="tab.sortOrder || null"
              @filter-apply="(whereClause: string | null) => handleFilterApply(tab, whereClause)"
              @refresh="() => { loadTableData(tab); clearDataSidebarState(tab.id); }"
              @cell-select="(e: { rowIndex: number; columnKey: string | null }) => onDataCellSelect(tab.id, e)"
              @sidebar-close="onDataSidebarClose(tab.id)"
              @update-field="(e: { field: string; value: unknown }) => onDataUpdateField(tab.id, e)"
              @mark-deleted="onDataMarkDeleted(tab.id)"
              @unmark-deleted="onDataUnmarkDeleted(tab.id)"
              @sort-change="(payload: { prop: string | null; order: 'ascending' | 'descending' | null }) => handleSortChange(tab, payload)"
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
                    @add-row="handleAddRow(tab)"
                  />
                </div>
              </el-tab-pane>
            </el-tabs>
            </div>
            <!-- Data table cell sidebar (inside content-area, full height) -->
            <div
              v-if="dataSidebarVisible"
              class="data-detail-sidebar-wrap"
            >
              <TableDataCellSidebar
                ref="dataSidebarRef"
                :visible="true"
                :selected-row="dataSidebarSelectedRow"
                :selected-column="dataSidebarSelectedColumn"
                :modified-fields="dataSidebarModifiedFields"
                :is-deleted="dataSidebarIsDeleted"
                :column-types="dataSidebarColumnTypes"
                @close="onDataSidebarClose(activeTabId)"
                @update-field="(field: string, value: unknown) => onDataUpdateField(activeTabId, { field, value })"
                @mark-deleted="onDataMarkDeleted(activeTabId)"
                @unmark-deleted="onDataUnmarkDeleted(activeTabId)"
              />
            </div>
          </div>

          <div
            v-if="sqlHistoryPanelOpen"
            class="splitter-bar"
            role="separator"
            aria-orientation="horizontal"
            @mousedown.prevent="startSqlPanelResize"
          />

          <div
            v-if="sqlHistoryPanelOpen"
            class="bottom-sql-panel-wrap"
            :style="{ height: `${sqlPanelHeight}px` }"
          >
            <BottomSqlHistoryPanel />
          </div>
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

    <!-- Export progress dialog -->
    <el-dialog
      v-model="exportDialogVisible"
      title="Export SQL"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="exportStatus !== 'running'"
    >
      <div v-if="exportStatus === 'running'">
        <div style="margin-bottom: 8px; font-weight: 600;">
          {{ exportTitle }}
        </div>
        <div style="margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 12px;">
          {{ exportSubtitle }}
        </div>
        <el-progress :percentage="exportPercent" />
      </div>

      <div v-else-if="exportStatus === 'success'">
        <el-result icon="success" title="Export completed">
          <template #sub-title>
            <div style="word-break: break-all;">{{ exportPath }}</div>
          </template>
        </el-result>
      </div>

      <div v-else-if="exportStatus === 'error'">
        <el-result icon="error" title="Export failed">
          <template #sub-title>
            <div style="white-space: pre-wrap;">{{ exportError }}</div>
          </template>
        </el-result>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button
            v-if="exportStatus === 'running'"
            type="danger"
            :loading="exportCanceling"
            @click="handleCancelExport"
          >
            Cancel
          </el-button>

          <el-button
            v-if="exportStatus === 'success'"
            type="primary"
            @click="handleOpenExportPath"
          >
            Open file location
          </el-button>

          <el-button
            v-if="exportStatus !== 'running'"
            @click="exportDialogVisible = false"
          >
            Close
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Export mode modal -->
    <el-dialog
      v-model="exportModeVisible"
      title="Export options"
      width="320px"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
    >
      <el-radio-group
        v-model="exportMode"
        style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start;"
      >
        <el-radio label="structure-data">Structure and Data</el-radio>
        <el-radio label="structure">Structure</el-radio>
        <el-radio label="data">Data</el-radio>
      </el-radio-group>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button @click="exportModeVisible = false">Cancel</el-button>
          <el-button type="primary" @click="confirmExportMode">Export</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Import progress dialog -->
    <el-dialog
      v-model="importDialogVisible"
      title="Import SQL"
      width="520px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="importStatus !== 'running'"
    >
      <div v-if="importStatus === 'running'">
        <div style="margin-bottom: 8px; font-weight: 600;">
          {{ importTitle }}
        </div>
        <div style="margin-bottom: 12px; color: var(--el-text-color-secondary); font-size: 12px;">
          {{ importSubtitle }}
        </div>
        <el-progress :percentage="importPercent" />
      </div>

      <div v-else-if="importStatus === 'success'">
        <el-result icon="success" title="Import completed">
          <template #sub-title>
            <div style="white-space: pre-wrap;">Executed statements: {{ importExecuted }}</div>
          </template>
        </el-result>
      </div>

      <div v-else-if="importStatus === 'error'">
        <el-result icon="error" title="Import failed">
          <template #sub-title>
            <div style="white-space: pre-wrap;">{{ importError }}</div>
          </template>
        </el-result>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <el-button
            v-if="importStatus === 'error'"
            @click="handleCopyImportError"
          >
            Copy error
          </el-button>

          <el-button
            v-if="importStatus === 'running'"
            type="danger"
            :loading="importCanceling"
            @click="handleCancelImport"
          >
            Cancel
          </el-button>

          <el-button
            v-if="importStatus !== 'running'"
            @click="importDialogVisible = false"
          >
            Close
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Sidebar context menu (blank area) -->
    <teleport to="body">
      <div
        v-if="tablesSidebarMenuVisible"
        class="tables-sidebar-context-overlay"
        @click="closeTablesSidebarMenu"
        @contextmenu.prevent
      >
        <div
          class="tables-sidebar-context-menu"
          :style="{ left: `${tablesSidebarMenuX}px`, top: `${tablesSidebarMenuY}px` }"
          @click.stop
          @contextmenu.prevent
        >
          <div class="tables-sidebar-context-title">
            {{
              tables.length === 0
                ? 'No tables'
                : selectedTableNames.length > 0
                  ? `Export ${selectedTableNames.length} table(s)`
                  : `Export all tables`
            }}
          </div>
          <el-button text class="tables-sidebar-context-item" @click="handleSidebarMenuExport">
            Export SQL…
          </el-button>
          <el-button text class="tables-sidebar-context-item" @click="handleSidebarMenuImport">
            Import SQL
          </el-button>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import BottomSqlHistoryPanel from '@/presentation/components/BottomSqlHistoryPanel.vue';
import DatabaseSelectModal from '@/presentation/components/DatabaseSelectModal.vue';
import QueryEditorTab from '@/presentation/components/QueryEditorTab.vue';
import TableDataCellSidebar from '@/presentation/components/TableDataCellSidebar.vue';
import TableDataView from '@/presentation/components/TableDataView.vue';
import TableStructureView from '@/presentation/components/TableStructureView.vue';
import TableViewFooter from '@/presentation/components/TableViewFooter.vue';
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { Connection, Document, Folder, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { storeToRefs } from 'pinia';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

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
  sortBy?: string | null;
  sortOrder?: 'asc' | 'desc' | null;
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

type DatabaseQueryResult = {
  success: boolean;
  data?: Array<Record<string, unknown>>;
  error?: string;
};

type TableStructureResult = {
  columns: NonNullable<Tab['structure']>['columns'];
  indexes?: NonNullable<Tab['structure']>['indexes'];
  rows?: number;
};

const connectionStore = useConnectionStore();
const { dataSidebarOpen, rowDetailPanelEnabled, sqlHistoryPanelOpen, currentConnection, activeConnections, currentTabId } =
  storeToRefs(connectionStore);
const { switchToConnection } = connectionStore;
const {
  getTables,
  getTableStructure,
  executeQuery,
  exportTablesSql,
  exportTablesSqlToPathWithJob,
  chooseSavePath,
  cancelExport,
  showItemInFolder,
  dropTable,
  importSqlScript,
  saveTextFile,
  openSqlFile,
  chooseOpenSqlPath,
  importSqlFromPathWithJob,
  cancelImport,
} = useDatabase();

// Use currentConnection, but fallback to first active connection if currentConnection is null
const connection = computed(() => {
  const conn = currentConnection.value || (activeConnections.value.length > 0 ? activeConnections.value[0] : null);

  return conn;
});

const tables = ref<Table[]>([]);
const tableNameFilter = ref('');
const isLoadingTables = ref(false);
const activeTableName = ref<string>('');
/** Multi-select (Ctrl/Cmd+click); cleared on normal table click. */
const selectedTableNames = ref<string[]>([]);
const tablesListRef = ref<HTMLElement | null>(null);

// Export dialog state
const exportDialogVisible = ref(false);
const exportStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle');
const exportJobId = ref<string | null>(null);
const exportPath = ref<string>('');
const exportError = ref<string>('');
const exportTableIndex = ref(0);
const exportTotalTables = ref(0);
const exportCurrentTable = ref<string>('');
const exportRowsDone = ref(0);
const exportRowsTotal = ref(0);
const exportCanceling = ref(false);

const exportPercent = computed(() => {
  const total = exportTotalTables.value || 0;
  if (total <= 0) return 0;
  const doneTables = Math.max(0, exportTableIndex.value - 1);
  const currentFrac =
    exportRowsTotal.value > 0 ? exportRowsDone.value / exportRowsTotal.value : 0;
  const pct = ((doneTables + currentFrac) / total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
});

const exportTitle = computed(() => {
  if (exportStatus.value !== 'running') return '';
  const idx = exportTableIndex.value || 0;
  const total = exportTotalTables.value || 0;
  if (!exportCurrentTable.value) return `Exporting… (${idx}/${total})`;
  return `Exporting ${idx}/${total}: ${exportCurrentTable.value}`;
});

const exportSubtitle = computed(() => {
  if (exportStatus.value !== 'running') return '';
  if (exportRowsTotal.value > 0) {
    return `Rows: ${exportRowsDone.value}/${exportRowsTotal.value}`;
  }
  return exportPath.value ? `Saving to: ${exportPath.value}` : '';
});

// Export mode modal state
const exportModeVisible = ref(false);
const exportMode = ref<'structure-data' | 'structure' | 'data'>('structure-data');
let pendingExportConnectionId: string | null = null;

// Import dialog state
const importDialogVisible = ref(false);
const importStatus = ref<'idle' | 'running' | 'success' | 'error'>('idle');
const importJobId = ref<string | null>(null);
const importPath = ref<string>('');
const importError = ref<string>('');
const importBytesRead = ref(0);
const importTotalBytes = ref(0);
const importExecuted = ref(0);
const importTotalStatements = ref<number | null>(null);
const importCanceling = ref(false);

const importPercent = computed(() => {
  const totalSt = importTotalStatements.value ?? 0;
  if (totalSt > 0) {
    const pct = (importExecuted.value / totalSt) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }
  const totalBytes = importTotalBytes.value || 0;
  if (totalBytes <= 0) return 0;
  const pct = (importBytesRead.value / totalBytes) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
});

const importTitle = computed(() => {
  if (importStatus.value !== 'running') return '';
  return 'Importing…';
});

const importSubtitle = computed(() => {
  if (importStatus.value !== 'running') return '';
  const parts: string[] = [];
  if (importPath.value) parts.push(`File: ${importPath.value}`);
  if (importTotalStatements.value != null && importTotalStatements.value > 0) {
    parts.push(`Statements: ${importExecuted.value}/${importTotalStatements.value}`);
  } else {
    parts.push(`Executed: ${importExecuted.value}`);
  }
  if (importTotalBytes.value > 0) {
    parts.push(`Read: ${importBytesRead.value}/${importTotalBytes.value} bytes`);
  }
  return parts.join('\n');
});

// Sidebar (blank area) context menu state
const tablesSidebarMenuVisible = ref(false);
const tablesSidebarMenuX = ref(0);
const tablesSidebarMenuY = ref(0);

const filteredTables = computed(() => {
  const q = tableNameFilter.value.trim().toLowerCase();
  if (!q) return tables.value;
  return tables.value.filter(t => t.name.toLowerCase().includes(q));
});
const tabs = ref<Tab[]>([]);
const activeTabId = ref<string>('');
const showDatabaseModal = ref(false);
const contentAreaInnerRef = ref<HTMLElement | null>(null);

// Per-connection view state: tables + tabs + active tab
interface ConnectionViewState {
  tables: Table[];
  tabs: Tab[];
  activeTabId: string;
  activeTableName: string;
}

const connectionViewState = reactive<Record<string, ConnectionViewState>>({});
const lastConnectionId = ref<string | null>(null);

// Ensure we always have a state object for a given connection id
const ensureConnectionViewState = (connectionId: string): ConnectionViewState => {
  if (!connectionViewState[connectionId]) {
    connectionViewState[connectionId] = reactive({
      tables: [],
      tabs: [],
      activeTabId: '',
      activeTableName: '',
    });
  }
  return connectionViewState[connectionId];
};

// When connection changes, switch tables/tabs to that connection's state
watch(
  () => connection.value?.id,
  (newId, oldId) => {
    if (!newId) {
      lastConnectionId.value = null;
      tables.value = [];
      tabs.value = [];
      activeTabId.value = '';
      activeTableName.value = '';
      return;
    }

    // Remember last connection id
    lastConnectionId.value = newId;

    const state = ensureConnectionViewState(newId);

    // Bind refs to this connection's state (share the same arrays)
    tables.value = state.tables;
    tabs.value = state.tabs;
    activeTabId.value = state.activeTabId;
    activeTableName.value = state.activeTableName;
  },
  { immediate: true }
);

// Keep per-connection active tab / table name in sync
watch(activeTabId, (val) => {
  const id = connection.value?.id;
  if (!id || !connectionViewState[id]) return;
  connectionViewState[id].activeTabId = val;
});

watch(activeTableName, (val) => {
  const id = connection.value?.id;
  if (!id || !connectionViewState[id]) return;
  connectionViewState[id].activeTableName = val;
});

// Data table cell sidebar state (per tab, inside content-area)
interface DataSidebarState {
  selectedRowIndex: number | null;
  selectedColumn: string | null;
  modifiedRows: Record<number, Record<string, unknown>>;
  deletedRows: number[];
}
const dataSidebarStateByTab = reactive<Record<string, DataSidebarState>>({});
function getDataSidebarState(tabId: string): DataSidebarState {
  if (!dataSidebarStateByTab[tabId]) {
    dataSidebarStateByTab[tabId] = reactive({
      selectedRowIndex: null,
      selectedColumn: null,
      modifiedRows: {},
      deletedRows: [],
    });
  }
  return dataSidebarStateByTab[tabId];
}
function onDataCellSelect(tabId: string, e: { rowIndex: number; columnKey: string | null }) {
  const s = getDataSidebarState(tabId);
  s.selectedRowIndex = e.rowIndex;
  s.selectedColumn = e.columnKey;
  if (!rowDetailPanelEnabled.value) {
    return;
  }
  if (!dataSidebarOpen.value) {
    connectionStore.toggleDataSidebar();
  }
}
function onDataSidebarClose(tabId: string) {
  const s = getDataSidebarState(tabId);
  s.selectedRowIndex = null;
  s.selectedColumn = null;
  connectionStore.closeDataSidebar();
}
function onDataUpdateField(tabId: string, e: { field: string; value: unknown }) {
  const s = getDataSidebarState(tabId);
  const idx = s.selectedRowIndex;
  if (idx == null) return;

  // Find base row from tab data to compare original value
  const tab = tabs.value.find(t => t.id === tabId);
  const baseRow =
    tab && tab.data && Array.isArray(tab.data.rows) && idx >= 0 && idx < tab.data.rows.length
      ? (tab.data.rows[idx] as Record<string, unknown>)
      : null;

  const original = baseRow ? baseRow[e.field] : undefined;
  const newValue = e.value;

  if (!s.modifiedRows[idx]) s.modifiedRows[idx] = {};
  const rowMods = s.modifiedRows[idx];

  if (areDbValuesEqual(newValue, original)) {
    // revert: remove modification for this field
    if (Object.prototype.hasOwnProperty.call(rowMods, e.field)) {
      delete rowMods[e.field];
    }
  } else {
    rowMods[e.field] = newValue;
  }

  // If row has no more modifications, remove the row entry
  if (Object.keys(rowMods).length === 0) {
    delete s.modifiedRows[idx];
  }
}
function onDataMarkDeleted(tabId: string) {
  const s = getDataSidebarState(tabId);
  if (s.selectedRowIndex != null && !s.deletedRows.includes(s.selectedRowIndex)) {
    s.deletedRows.push(s.selectedRowIndex);
  }
}
function onDataUnmarkDeleted(tabId: string) {
  const s = getDataSidebarState(tabId);
  if (s.selectedRowIndex != null) {
    s.deletedRows = s.deletedRows.filter(i => i !== s.selectedRowIndex);
  }
}
function clearDataSidebarState(tabId: string) {
  const s = getDataSidebarState(tabId);
  s.selectedRowIndex = null;
  s.selectedColumn = null;
  s.modifiedRows = {};
  s.deletedRows = [];
}

type TableDataViewRef = {
  runSave: () => Promise<void>;
  addRow?: () => void;
  hasUnsavedChanges?: () => boolean;
  clearUnsavedChanges?: () => void;
};
const tableDataViewRefs: Record<string, TableDataViewRef | null> = {};
const dataSidebarRef = ref<{ flushEditsFromDom: () => void } | null>(null);

const splitRef = ref<HTMLElement | null>(null);
const sqlPanelHeight = ref(240);
const resizingSqlPanel = ref(false);
let resizeStartY = 0;
let resizeStartHeight = 0;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function onSqlPanelResizeMove(e: MouseEvent) {
  if (!resizingSqlPanel.value) return;
  const root = splitRef.value;
  if (!root) return;
  const max = Math.floor(root.clientHeight * 0.7);
  const min = 120;
  const delta = resizeStartY - e.clientY;
  sqlPanelHeight.value = clamp(resizeStartHeight + delta, min, max);
}

function onSqlPanelResizeUp() {
  if (!resizingSqlPanel.value) return;
  resizingSqlPanel.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  window.removeEventListener('mousemove', onSqlPanelResizeMove);
  window.removeEventListener('mouseup', onSqlPanelResizeUp);
}

function startSqlPanelResize(e: MouseEvent) {
  if (!sqlHistoryPanelOpen.value) return;
  resizingSqlPanel.value = true;
  resizeStartY = e.clientY;
  resizeStartHeight = sqlPanelHeight.value;
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', onSqlPanelResizeMove);
  window.addEventListener('mouseup', onSqlPanelResizeUp);
}

function setTableDataViewRef(tabId: string, el: TableDataViewRef | null) {
  if (el) {
    tableDataViewRefs[tabId] = el;
  } else {
    delete tableDataViewRefs[tabId];
  }
}

async function handleSaveKeydown(e: KeyboardEvent) {
  const key = e.key?.toLowerCase();
  // Ctrl/Cmd + R reload data currently shown in "data" mode
  if ((e.ctrlKey || e.metaKey) && key === 'r') {
    e.preventDefault();
    e.stopPropagation();

    const tab = tabs.value.find(t => t.id === activeTabId.value);
    if (tab && tab.tabType !== 'query' && tab.viewMode === 'data') {
      const page = tab.data?.page ?? 1;
      const perPage = tab.data?.perPage ?? 50;
      const comp = tableDataViewRefs[tab.id];
      const sidebarState = getDataSidebarState(tab.id);
      const hasSidebarChanges =
        Object.keys(sidebarState.modifiedRows ?? {}).length > 0 || sidebarState.deletedRows.length > 0;
      const hasUiChanges = comp?.hasUnsavedChanges ? comp.hasUnsavedChanges() : false;

      if (hasSidebarChanges || hasUiChanges) {
        try {
          await ElMessageBox.confirm(
            'Bạn có thay đổi chưa lưu (bao gồm mark deleted). Reload sẽ hủy thay đổi này. Bạn có chắc không?',
            'Discard & Reload',
            {
              confirmButtonText: 'Reload',
              cancelButtonText: 'Cancel',
              type: 'warning',
              distinguishCancelAndClose: true
            }
          );
        } catch {
          return;
        }

        // Discard UI edits in table view
        comp?.clearUnsavedChanges?.();

        // Discard sidebar mark-deleted + modified fields
        clearDataSidebarState(tab.id);
      }

      try {
        await loadTableData(tab, page, perPage);
        ElMessage.success('Data reloaded');
      } catch {
        ElMessage.error('Reload failed');
      }
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && key === 's') {
    e.preventDefault();
    e.stopPropagation();
    const tab = tabs.value.find(t => t.id === activeTabId.value);
    if (tab && tab.tabType !== 'query' && tab.viewMode === 'data') {
      const comp = tableDataViewRefs[tab.id];
        if (comp?.runSave) {
          const active = document.activeElement as HTMLElement | null;
          if (active && (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            active.blur();
            await nextTick();
          }
          comp.runSave();
        }
    }
  }
}
const activeDataTab = computed(() => {
  const id = activeTabId.value;
  const tab = tabs.value.find(t => t.id === id);
  return tab && tab.tabType !== 'query' && tab.viewMode === 'data' ? tab : null;
});
const dataSidebarVisible = computed(() => {
  return rowDetailPanelEnabled.value && dataSidebarOpen.value && tabs.value.length > 0;
});
const dataSidebarSelectedRow = computed(() => {
  const tab = activeDataTab.value;
  if (!tab?.data?.rows) return null;
  const s = getDataSidebarState(tab.id);
  const idx = s.selectedRowIndex;
  if (idx == null || idx < 0 || idx >= tab.data.rows.length) return null;
  return tab.data.rows[idx] as Record<string, unknown>;
});
const dataSidebarSelectedColumn = computed(() => {
  const tab = activeDataTab.value;
  return tab ? getDataSidebarState(tab.id).selectedColumn : null;
});
const dataSidebarModifiedFields = computed(() => {
  const tab = activeDataTab.value;
  if (!tab) return {};
  const s = getDataSidebarState(tab.id);
  const idx = s.selectedRowIndex;
  return idx != null ? (s.modifiedRows[idx] ?? {}) : {};
});
const dataSidebarIsDeleted = computed(() => {
  const tab = activeDataTab.value;
  if (!tab) return false;
  const s = getDataSidebarState(tab.id);
  return s.selectedRowIndex !== null && s.deletedRows.includes(s.selectedRowIndex);
});

const dataSidebarColumnTypes = computed(() => {
  const tab = activeDataTab.value;
  if (!tab?.structure?.columns?.length) return {};
  return Object.fromEntries(tab.structure.columns.map((c: { name: string; type: string }) => [c.name, c.type]));
});

// Define loadTables function before watch to avoid "Cannot access before initialization" error
const loadTables = async () => {
  if (!connection.value?.id || !connection.value?.database) {
    // Clear current connection's tables in-place to keep per-connection state object
    tables.value.splice(0, tables.value.length);
    return;
  }
  isLoadingTables.value = true;
  try {
    const tableList = await getTables(connection.value.id);
    // Replace tables in-place to preserve reference used by connectionViewState
    tables.value.splice(0, tables.value.length, ...((tableList || []) as Table[]));
  } catch (error) {
    console.error('Failed to load tables:', error);
    tables.value.splice(0, tables.value.length);
  } finally {
    isLoadingTables.value = false;
  }
};

// Watch activeConnections to ensure currentTabId is set
watch(
  activeConnections,
  (newConnections) => {
    if (newConnections.length > 0 && !currentTabId.value) {
      switchToConnection(newConnections[0].tabId);
    }
  },
  { immediate: true, deep: true }
);

// Load tables when connection or database changes
watch(
  () => [connection.value?.id, connection.value?.database],
  async () => {
    selectedTableNames.value = [];
    if (connection.value?.database) {
      // Only load tables if this connection doesn't already have cached tables
      const connId = connection.value.id;
      const state = connId ? connectionViewState[connId] : undefined;
      const hasCachedTables = !!state && state.tables && state.tables.length > 0;

      if (!hasCachedTables) {
        await loadTables();
      }
    } else {
      tables.value.splice(0, tables.value.length);
      activeTableName.value = '';
    }
  },
  { immediate: true }
);

function toggleTableSelection(name: string) {
  const i = selectedTableNames.value.indexOf(name);
  if (i >= 0) {
    selectedTableNames.value = selectedTableNames.value.filter((n) => n !== name);
  } else {
    selectedTableNames.value = [...selectedTableNames.value, name];
  }
}

function selectAllFilteredTables() {
  selectedTableNames.value = filteredTables.value.map((t) => t.name);
}

function onTablesSidebarKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    if (filteredTables.value.length > 0) {
      selectAllFilteredTables();
    }
  }
}

function closeTablesSidebarMenu() {
  tablesSidebarMenuVisible.value = false;
}

function onTablesSidebarContextMenu(e: MouseEvent) {
  // Only for the blank area; table rows stop propagation themselves.
  tablesSidebarMenuX.value = e.clientX;
  tablesSidebarMenuY.value = e.clientY;
  tablesSidebarMenuVisible.value = true;
}

async function handleSidebarMenuExport() {
  closeTablesSidebarMenu();
  const id = connection.value?.id;
  if (!id) return;
  if (tables.value.length === 0) {
    ElMessage.warning('No tables to export');
    return;
  }
  // If nothing selected, export all tables in this connection (not just filtered).
  if (selectedTableNames.value.length === 0) {
    selectedTableNames.value = tables.value.map((t) => t.name);
  }
  pendingExportConnectionId = id;
  exportMode.value = 'structure-data';
  exportModeVisible.value = true;
}

async function handleSidebarMenuImport() {
  closeTablesSidebarMenu();
  const id = connection.value?.id;
  if (!id) return;
  await runImportSql(id);
}

async function handleTableRowClick(e: MouseEvent, table: Table) {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    toggleTableSelection(table.name);
    return;
  }
  selectedTableNames.value = [];
  await handleSelectTable(table);
}

async function onTableMenuCommand(cmd: string, table: Table) {
  const id = connection.value?.id;
  if (!id) return;
  if (cmd === 'export') {
    if (!selectedTableNames.value.includes(table.name)) {
      selectedTableNames.value = [table.name];
    }
    pendingExportConnectionId = id;
    exportMode.value = 'structure-data';
    exportModeVisible.value = true;
  } else if (cmd === 'import') {
    await runImportSql(id);
  } else if (cmd === 'drop') {
    await runDropTable(id, table);
  }
}

async function runDropTable(connectionId: string, table: Table) {
  try {
    await ElMessageBox.confirm(
      `This will permanently remove ${table.type === 'view' ? 'view' : 'table'} "${table.name}". Continue?`,
      `Drop ${table.type === 'view' ? 'View' : 'Table'}`,
      {
        confirmButtonText: 'Drop',
        cancelButtonText: 'Cancel',
        type: 'warning',
        distinguishCancelAndClose: true,
      }
    );
  } catch {
    return;
  }

  const loading = ElMessage({ message: 'Dropping…', type: 'info', duration: 0 });
  try {
    const r = await dropTable(connectionId, table.name, table.type);
    loading.close();
    if (!r.success) {
      ElMessage.error(r.error || 'Drop failed');
      return;
    }
    // Close tabs for this table if open
    const toRemove = tabs.value.filter((t) => t.tableName === table.name).map((t) => t.id);
    toRemove.forEach((id) => handleRemoveTab(id));
    activeTableName.value = '';
    ElMessage.success('Dropped');
    await loadTables();
  } catch (err) {
    loading.close();
    ElMessage.error(err instanceof Error ? err.message : 'Drop failed');
  }
}

async function confirmExportMode() {
  if (!pendingExportConnectionId) return;
  exportModeVisible.value = false;
  await runExportSql(pendingExportConnectionId, exportMode.value);
  pendingExportConnectionId = null;
}

async function runExportSql(connectionId: string, mode: 'structure-data' | 'structure' | 'data') {
  const names = [...selectedTableNames.value];
  if (names.length === 0) {
    ElMessage.warning('Select at least one table');
    return;
  }

  const safe = `${connection.value?.database ?? 'db'}_export.sql`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const picked = await chooseSavePath({
    defaultFilename: safe,
    title: 'Save SQL file',
    extensions: ['sql'],
  });
  if (!picked || !picked.success || picked.canceled || !picked.path) return;

  try {
    // Init dialog
    exportDialogVisible.value = true;
    exportStatus.value = 'running';
    exportCanceling.value = false;
    exportError.value = '';
    exportPath.value = picked.path;
    exportJobId.value = crypto.randomUUID();
    exportTableIndex.value = 0;
    exportTotalTables.value = names.length;
    exportCurrentTable.value = '';
    exportRowsDone.value = 0;
    exportRowsTotal.value = 0;

    const jobId = exportJobId.value;
    const onProgress = (payload: any) => {
      if (!payload || typeof payload !== 'object') return;
      if (payload.jobId && jobId && payload.jobId !== jobId) return;
      if (payload.stage === 'start') {
        exportTotalTables.value = payload.totalTables ?? names.length;
        exportTableIndex.value = 0;
        exportRowsDone.value = 0;
        exportRowsTotal.value = 0;
      } else if (payload.stage === 'table:start') {
        exportTableIndex.value = payload.tableIndex ?? exportTableIndex.value;
        exportTotalTables.value = payload.totalTables ?? exportTotalTables.value;
        exportCurrentTable.value = payload.table ?? '';
        exportRowsDone.value = 0;
        exportRowsTotal.value = 0;
      } else if (payload.stage === 'table:batch') {
        exportTableIndex.value = payload.tableIndex ?? exportTableIndex.value;
        exportTotalTables.value = payload.totalTables ?? exportTotalTables.value;
        exportCurrentTable.value = payload.table ?? exportCurrentTable.value;
        exportRowsDone.value = payload.rowsDone ?? exportRowsDone.value;
        exportRowsTotal.value = payload.rowsTotal ?? exportRowsTotal.value;
      } else if (payload.stage === 'done') {
        exportPath.value = payload.path ?? exportPath.value;
      }
    };

    const handler = (p: unknown) => onProgress(p);
    window.electron?.on?.('export:progress', handler);

    const r = await exportTablesSqlToPathWithJob(connectionId, names, picked.path, exportJobId.value, mode);
    window.electron?.off?.('export:progress', handler);

    if (!r.success) {
      exportStatus.value = 'error';
      exportError.value = r.error || 'Export failed';
      return;
    }
    exportStatus.value = 'success';
  } catch (err) {
    exportStatus.value = 'error';
    exportError.value = err instanceof Error ? err.message : 'Export failed';
  }
}

async function handleCancelExport() {
  if (exportCanceling.value) return;
  const jobId = exportJobId.value;
  if (!jobId) return;
  exportCanceling.value = true;
  try {
    await cancelExport(jobId);
    exportStatus.value = 'error';
    exportError.value = 'Export canceled';
  } finally {
    exportCanceling.value = false;
  }
}

async function handleOpenExportPath() {
  if (!exportPath.value) return;
  await showItemInFolder(exportPath.value);
}

async function runImportSql(connectionId: string) {
  const picked = await chooseOpenSqlPath();
  if (!picked.success || picked.canceled || !picked.path) return;

  importDialogVisible.value = true;
  importStatus.value = 'running';
  importCanceling.value = false;
  importError.value = '';
  importPath.value = picked.path;
  importBytesRead.value = 0;
  importTotalBytes.value = 0;
  importExecuted.value = 0;
  importTotalStatements.value = null;

  const jobId = `imp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  importJobId.value = jobId;

  const handler = (payloadRaw: unknown) => {
    const payload = payloadRaw as
      | { stage: 'start'; jobId: string }
      | {
      stage: 'scan' | 'read' | 'execute';
      jobId: string;
      bytesRead: number;
      totalBytes: number;
      executed: number;
      totalStatements?: number;
    }
      | { stage: 'done'; jobId: string; executed: number; totalBytes: number };
    if (!payload || payload.jobId !== jobId) return;

    if (payload.stage === 'scan' || payload.stage === 'read' || payload.stage === 'execute') {
      importBytesRead.value = payload.bytesRead ?? importBytesRead.value;
      importTotalBytes.value = payload.totalBytes ?? importTotalBytes.value;
      importExecuted.value = payload.executed ?? importExecuted.value;
      if (typeof payload.totalStatements === 'number') {
        importTotalStatements.value = payload.totalStatements;
      }
      return;
    }
    if (payload.stage === 'done') {
      importExecuted.value = payload.executed ?? importExecuted.value;
      importTotalBytes.value = payload.totalBytes ?? importTotalBytes.value;
    }
  };

  window.electron?.on?.('import:progress', handler);
  try {
    const r = await importSqlFromPathWithJob({ connectionId, path: picked.path, jobId });
    if ((r as any)?.canceled) {
      importDialogVisible.value = false;
      importStatus.value = 'idle';
      await loadTables();
      return;
    }
    if (!r?.success) {
      importStatus.value = 'error';
      importError.value = r?.error ?? 'Import failed';
      return;
    }
    importStatus.value = 'success';
    importExecuted.value = r.executed ?? importExecuted.value;
    importTotalBytes.value = r.totalBytes ?? importTotalBytes.value;
    await loadTables();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('canceled')) {
      importDialogVisible.value = false;
      importStatus.value = 'idle';
      await loadTables();
      return;
    }
    importStatus.value = 'error';
    importError.value = err instanceof Error ? err.stack ?? err.message : String(err);
  } finally {
    window.electron?.off?.('import:progress', handler);
  }
}

async function handleCancelImport() {
  if (importStatus.value !== 'running') return;
  const jobId = importJobId.value;

  // UX per request: close dialog immediately, then cancel + reload what was imported so far.
  importDialogVisible.value = false;
  importStatus.value = 'idle';
  importCanceling.value = true;
  try {
    if (jobId) {
      await cancelImport(jobId);
    }
  } finally {
    importCanceling.value = false;
    await loadTables();
  }
}

async function handleCopyImportError() {
  try {
    await navigator.clipboard.writeText(importError.value || '');
    ElMessage.success('Copied');
  } catch {
    ElMessage.error('Copy failed');
  }
}

const handleSelectTable = async (table: Table) => {
  activeTableName.value = table.name;

  // Check if tab already exists
  const existingTab = tabs.value.find(tab => tab.tableName === table.name);
  if (existingTab) {
    activeTabId.value = existingTab.id;
    // Ensure both data and structure are available when opening a tab.
    if (connection.value?.id) {
      const tasks: Promise<void>[] = [];
      if (!existingTab.structure) {
        tasks.push(loadTableStructure(existingTab));
      }
      if (!existingTab.data) {
        tasks.push(loadTableData(existingTab));
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
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

  // Load both data and structure by default to avoid missing column metadata
  // when users start editing immediately after opening a table.
  if (connection.value?.id) {
    await Promise.all([
      loadTableData(newTab),
      loadTableStructure(newTab),
    ]);
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
    const structure = (await getTableStructure(connection.value.id, tab.tableName)) as Partial<TableStructureResult> | null;

    if (structure && structure.columns && Array.isArray(structure.columns)) {
      // Find the tab in the array to ensure we're modifying the reactive object
      const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
      if (tabIndex !== -1) {
        // Modify the reactive object directly
        tabs.value[tabIndex].structure = {
          columns: structure.columns,
          indexes: structure.indexes ?? [],
          rows: structure.rows,
        };
        tabs.value[tabIndex].isLoadingStructure = false;
      } else {
        // Fallback: direct assignment
        tab.structure = {
          columns: structure.columns,
          indexes: structure.indexes ?? [],
          rows: structure.rows,
        };
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
  }
};

// Load table data
async function loadTableData(tab: Tab, page: number = 1, perPage: number = 50) {
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

    // Build WHERE clause
    const whereClause = targetTab.whereClause ? ` WHERE ${targetTab.whereClause}` : '';

    // Build ORDER BY clause from sort state
    let orderClause = '';
    if (targetTab.sortBy && targetTab.sortOrder) {
      let sortColumn = targetTab.sortBy;
      if (connection.value.type === 'postgresql') {
        sortColumn = `"${sortColumn.replace(/"/g, '""')}"`;
      } else if (connection.value.type === 'mysql') {
        sortColumn = `\`${sortColumn.replace(/`/g, '``')}\``;
      }
      const direction = targetTab.sortOrder === 'desc' ? 'DESC' : 'ASC';
      orderClause = ` ORDER BY ${sortColumn} ${direction}`;
    }

    // Get total count first
    const countQuery = `SELECT COUNT(*) as total FROM ${tableName}${whereClause}`;
    const countResult = (await window.electron?.invoke('database:query', {
      connectionId: connection.value.id,
      query: countQuery
    })) as DatabaseQueryResult | undefined;

    const total = countResult?.success && countResult.data?.[0]?.total
      ? parseInt(String(countResult.data[0].total), 10)
      : 0;

    // Get data
    const queryStr = `SELECT * FROM ${tableName}${whereClause}${orderClause} LIMIT ${perPage} OFFSET ${offset}`;
    const result = (await window.electron?.invoke('database:query', {
      connectionId: connection.value.id,
      query: queryStr
    })) as DatabaseQueryResult | undefined;

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
}

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

// Handle add row
const handleAddRow = (tab: Tab) => {
  const comp = tableDataViewRefs[tab.id];
  if (comp?.addRow) {
    comp.addRow();
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

// Handle sort changes from TableDataView (header click)
const handleSortChange = async (
  tab: Tab,
  payload: { prop: string | null; order: 'ascending' | 'descending' | null }
) => {
  const tabIndex = tabs.value.findIndex(t => t.id === tab.id);
  const targetTab = tabIndex !== -1 ? tabs.value[tabIndex] : tab;

  if (!payload.prop || !payload.order) {
    // Clear sort
    targetTab.sortBy = null;
    targetTab.sortOrder = null;
  } else {
    targetTab.sortBy = payload.prop;
    targetTab.sortOrder = payload.order === 'descending' ? 'desc' : 'asc';
  }

  // Reload data from first page with same page size
  const perPage = targetTab.data?.perPage || 50;
  await loadTableData(targetTab, 1, perPage);
};

// Helper: loose equality for DB values so that 22 and "22" are treated as same
function areDbValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  // If both can be parsed as finite numbers, compare numerically
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na === nb;
  }
  return String(a ?? '') === String(b ?? '');
}

// Handle add new query tab
const handleAddQuery = () => {
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
};

// Get column names from data rows
const handleDatabaseSelected = async (databaseName: string) => {
  // Reload tables after database is selected
  await loadTables();
};

// Expose for Workspace so title bar \"Select Database\" can open this modal
const openDatabaseSelectModal = () => {
  showDatabaseModal.value = true;
};

defineExpose({
  handleAddQuery,
  openDatabaseSelectModal,
  currentConnection,
  currentTabId,
});

function handleDataSidebarClickOutside(e: MouseEvent) {
  if (!dataSidebarVisible.value) return;
  if (contentAreaInnerRef.value?.contains(e.target as Node)) return;
  onDataSidebarClose(activeTabId.value);
}

// Debug on mount
onMounted(() => {
  // Central SQL history listener (emitted from preload wrapper)
  connectionStore.attachSqlHistoryListener();
  document.addEventListener('click', handleDataSidebarClickOutside);
  document.addEventListener('keydown', handleSaveKeydown, { capture: true });
});
onUnmounted(() => {
  document.removeEventListener('click', handleDataSidebarClickOutside);
  document.removeEventListener('keydown', handleSaveKeydown, { capture: true });
  onSqlPanelResizeUp();
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
    background-color: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color);
    overflow: hidden;
    flex-shrink: 0;

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
      outline: none;
      scrollbar-width: none;
      -ms-overflow-style: none;
      &::-webkit-scrollbar {
        display: none;
      }

      :deep(.el-dropdown) {
        display: block;
        width: 100%;
      }

      .table-item {
        display: flex;
        align-items: center;
        padding: 6px 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: transparent;
        border: 1px solid transparent;

        &:hover {
          background-color: rgba(64, 158, 255, 0.1);
          .table-name,
          .table-icon {
            color: var(--el-text-color-primary);
          }
          .dark & {
            background-color: rgba(64, 158, 255, 0.18);
            .table-name,
            .table-icon {
              color: var(--el-text-color-primary);
            }
          }
          [data-theme="light"] & {
            background-color: rgba(64, 158, 255, 0.08);
            .table-name,
            .table-icon {
              color: var(--el-text-color-primary);
            }
          }
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

        &.multi-selected {
          background-color: rgba(64, 158, 255, 0.1);
          border-color: rgba(64, 158, 255, 0.35);
          .dark & {
            background-color: rgba(64, 158, 255, 0.14);
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

    // Note: menu is teleported to <body>, so we must style it globally.
    :global(.tables-sidebar-context-overlay) {
      position: fixed;
      inset: 0;
      z-index: 3000;
    }

    :global(.tables-sidebar-context-menu) {
      position: fixed;
      min-width: 190px;
      padding: 6px;
      border-radius: 8px;
      border: 1px solid var(--el-border-color);
      background: var(--el-bg-color);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
    }

    :global(.tables-sidebar-context-title) {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      padding: 4px 8px 6px;
    }

    :global(.tables-sidebar-context-item) {
      width: 100%;
      justify-content: flex-start;
      padding: 6px 8px;
      border-radius: 6px;
      margin-left: 0 !important;
    }

    :global(.tables-sidebar-context-item:hover) {
      background: rgba(64, 158, 255, 0.12);
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
          background-color: var(--el-fill-color);
          border-color: var(--el-border-color-light);
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
            background-color: var(--el-border-color-lighter);
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

    .content-area-inner {
      flex: 1;
      display: flex;
      min-height: 0;
      overflow: hidden;
    }

    .content-split {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .content-split > .content-area-inner {
      flex: 1;
      min-height: 0;
    }

    .splitter-bar {
      height: 6px;
      cursor: row-resize;
      flex: 0 0 auto;
      background: transparent;
      position: relative;
    }

    .splitter-bar::before {
      content: '';
      position: absolute;
      left: 16px;
      right: 16px;
      top: 2px;
      height: 2px;
      border-radius: 2px;
      background-color: var(--el-border-color-light);
      opacity: 0.9;
    }

    .splitter-bar:hover::before {
      background-color: var(--el-color-primary);
      opacity: 0.95;
    }

    .bottom-sql-panel-wrap {
      flex: 0 0 auto;
      min-height: 120px;
      overflow: hidden;
    }

    .tabs-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;

      :deep(.el-tabs) {
        height: 100%;
        display: flex;
        flex-direction: column;

        .el-tabs__header {
          margin: 0;
          padding: 0 16px;
          background-color: var(--el-bg-color);
          border-bottom: 1px solid var(--el-border-color-light);
        }

        .el-tabs__content {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 0;

          .el-tab-pane {
            height: 100%;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
            padding: 20px 20px 24px;

            > .tab-content-wrapper {
              flex: 1;
              min-height: 0;
            }
          }
        }
      }

      .tab-content-wrapper {
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
        background-color: var(--el-bg-color);

        > .tab-footer {
          flex-shrink: 0;
        }
      }

      .tab-main-content {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        background-color: var(--el-bg-color);
        scrollbar-width: none;
        -ms-overflow-style: none;
        &::-webkit-scrollbar {
          display: none;
        }
      }
    }

    .data-detail-sidebar-wrap {
      flex-shrink: 0;
      width: 380px;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border-left: 1px solid var(--el-border-color-lighter);
      background-color: var(--el-bg-color);
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
