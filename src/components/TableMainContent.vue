<template>
  <div class="main-content-section">
    <div v-if="displayMode === 'data'" class="data-view">
      <div v-if="tableData.length === 0 && !isLoadingData" class="no-data">
        <div class="no-data-content">
          <el-empty 
            description="This table has no data" 
            :image-size="60"
          />
          <div class="load-data-button">
            <el-button type="primary" @click="loadTableData">
              Refresh
            </el-button>
          </div>
        </div>
      </div>
      <el-table
        v-else
        :data="tableData"
        class="full-height-table"
        border
        v-loading="isLoadingData"
        @row-click="handleRowClick"
        highlight-current-row
        :row-class-name="getRowClassName"
      >
        <el-table-column
          v-for="column in columns"
          :key="column.name"
          :prop="column.name"
          :label="column.name"
          :width="150"
          :min-width="100"
          :resizable="true"
          show-overflow-tooltip
        >
          <template #default="scope">
            <div 
              class="cell-content" 
              :class="{ 
                'modified-cell': isCellModified(scope.row, column.name),
                'deleted-row': isRowDeleted(scope.row)
              }"
              @dblclick="startEditCell(scope.row, column.name, scope.row[column.name])"
            >
              <span v-if="editingCell && editingCell.row === scope.row && editingCell.field === column.name">
                <el-input
                  v-model="editingCell.value"
                  size="small"
                  @blur="saveCell(scope.row, column.name)"
                  @keydown.escape.prevent="editingCell = null"
                  ref="cellInput"
                />
              </span>
              <span v-else class="truncated-text">
                {{ truncateText(scope.row[column.name]) }}
              </span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div v-else class="structure-view">
      <!-- Columns Structure Table -->
      <div class="structure-section">
        <h4>Table Structure</h4>
        <div v-if="columns.length === 0" class="no-columns">
          <el-empty 
            description="No columns loaded - Database connection may be closed" 
            :image-size="60"
          />
          <div class="error-message">
            <el-alert
              title="Connection Error"
              type="warning"
              description="Unable to load table structure. Please check your database connection."
              show-icon
              :closable="false"
            />
          </div>
        </div>
        <div v-else class="structure-table">
          <el-table :data="columnsWithFullType" border style="width: 100%">
            <el-table-column prop="ordinal_position" label="#" width="60" align="center" />
            <el-table-column prop="name" label="Column Name" min-width="120" />
            <el-table-column prop="fullType" label="Data Type" min-width="100" />
            <el-table-column prop="character_set" label="Character Set" min-width="100" />
            <el-table-column prop="collation" label="Collation" min-width="100" />
            <el-table-column prop="nullable" label="Nullable" width="80" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.nullable ? 'success' : 'danger'" size="small">
                  {{ scope.row.nullable ? 'YES' : 'NO' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="default_value" label="Default" min-width="100" />
            <el-table-column prop="extra" label="Extra" min-width="80" />
            <el-table-column prop="foreign_key" label="Foreign Key" min-width="100" />
            <el-table-column prop="comment" label="Comment" min-width="120" />
          </el-table>
        </div>
      </div>

      <!-- Indexes Section -->
      <div class="indexes-section">
        <h4>Indexes</h4>
        <div v-if="!indexes || indexes.length === 0" class="no-indexes">
          <el-empty description="No indexes found" :image-size="60" />
        </div>
        <div v-else class="indexes-table">
          <el-table :data="indexes" border style="width: 100%">
            <el-table-column prop="name" label="Index Name" min-width="120" />
            <el-table-column prop="algorithm" label="Algorithm" width="100" align="center" />
            <el-table-column prop="is_unique" label="Unique" width="80" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.is_unique ? 'warning' : 'info'" size="small">
                  {{ scope.row.is_unique ? 'YES' : 'NO' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="column_name" label="Column Name" min-width="120" />
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  ordinal_position?: number;
  fullType?: string;
  character_set?: string;
  collation?: string;
  default_value?: string;
  extra?: string;
  foreign_key?: string;
  comment?: string;
}

interface TableIndex {
  name: string;
  algorithm?: string;
  is_unique: boolean;
  column_name: string;
}

const props = defineProps<{
  displayMode: 'data' | 'structure';
  columns: TableColumn[];
  tableName: string;
  rows?: number;
  tableData: any[];
  isLoadingData: boolean;
  indexes?: TableIndex[];
}>();

const emit = defineEmits<{
  'refresh-data': [];
  'row-selected': [row: any];
  'row-updated': [row: any, field: string, newValue: any];
  'row-deleted': [row: any];
}>();

const editingCell = ref<{
  row: any;
  field: string;
  value: string;
} | null>(null);

const cellInput = ref();
const modifiedCells = ref<Set<string>>(new Set()); // Track modified cells
const selectedRow = ref<any>(null); // Track selected row
const deletedRows = ref<Set<any>>(new Set()); // Track deleted rows

const loadTableData = () => {
  emit('refresh-data');
};

const handleRowClick = (row: any) => {
  selectedRow.value = row;
  emit('row-selected', row);
};

const truncateText = (text: any): string => {
  if (text === null || text === undefined) {
    return 'NULL';
  }
  const str = String(text);
  return str.length > 50 ? str.substring(0, 50) + '...' : str;
};

const startEditCell = async (row: any, field: string, value: any) => {
  editingCell.value = {
    row,
    field,
    value: String(value || '')
  };
  
  await nextTick();
  if (cellInput.value) {
    // Handle both single element and array of elements
    const inputElement = Array.isArray(cellInput.value) ? cellInput.value[0] : cellInput.value;
    if (inputElement && typeof inputElement.focus === 'function') {
      inputElement.focus();
    }
  }
};

const saveCell = (row: any, field: string) => {
  if (editingCell.value && editingCell.value.row === row && editingCell.value.field === field) {
    const newValue = editingCell.value.value;
    const cellKey = `${row.id || JSON.stringify(row)}_${field}`;
    modifiedCells.value.add(cellKey);
    emit('row-updated', row, field, newValue);
    editingCell.value = null;
  }
};

// Handle delete row
const handleDeleteRow = (row: any) => {
  if (selectedRow.value === row) {
    deletedRows.value.add(row);
    console.log('Row marked for deletion:', row);
  }
};

// Handle save delete
const handleSaveDelete = () => {
  if (selectedRow.value && deletedRows.value.has(selectedRow.value)) {
    console.log('Deleting row:', selectedRow.value);
    emit('row-deleted', selectedRow.value);
    deletedRows.value.delete(selectedRow.value);
    selectedRow.value = null;
  }
};

// Check if cell is modified
const isCellModified = (row: any, field: string) => {
  const cellKey = `${row.id || JSON.stringify(row)}_${field}`;
  return modifiedCells.value.has(cellKey);
};

// Check if row is deleted
const isRowDeleted = (row: any) => {
  return deletedRows.value.has(row);
};

// Get row class name for styling
const getRowClassName = ({ row }: { row: any }) => {
  if (isRowDeleted(row)) {
    return 'deleted-row';
  }
  return '';
};

// Keyboard event handler
const handleKeydown = (event: KeyboardEvent) => {
  // Handle Delete key
  if (event.key === 'Delete' && selectedRow.value) {
    handleDeleteRow(selectedRow.value);
    event.preventDefault();
    return;
  }
  
  // Handle Ctrl/Cmd + S only when we have pending changes
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    const hasPendingChanges = editingCell.value || (selectedRow.value && deletedRows.value.has(selectedRow.value));
    
    if (hasPendingChanges) {
      // Handle save for editing cell
      if (editingCell.value) {
        saveCell(editingCell.value.row, editingCell.value.field);
        event.preventDefault();
        return;
      }
      
      // Handle save for deleted row
      if (selectedRow.value && deletedRows.value.has(selectedRow.value)) {
        handleSaveDelete();
        event.preventDefault();
        return;
      }
    }
  }
};

// Computed property để hiển thị full type (type + length)
const columnsWithFullType = computed(() => {
  return props.columns.map(column => ({
    ...column,
    fullType: column.type || 'Unknown'
  }));
});

// Check if there are unsaved changes
const hasUnsavedChanges = () => {
  return editingCell.value !== null || 
         modifiedCells.value.size > 0 || 
         deletedRows.value.size > 0;
};

// Clear all unsaved changes
const clearUnsavedChanges = () => {
  editingCell.value = null;
  modifiedCells.value.clear();
  deletedRows.value.clear();
  selectedRow.value = null;
};

// Expose methods for parent component
defineExpose({
  hasUnsavedChanges,
  clearUnsavedChanges
});

// Lifecycle hooks
onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.main-content-section {
  flex: 1; /* Take remaining space */
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
  overflow: hidden; /* Hide overflow, let table handle scroll */
  display: flex;
  flex-direction: column;
  position: relative; /* For absolute positioning if needed */
  flex-grow: 1;
}

.data-view {
  flex: 1;
  overflow: hidden; /* Hide overflow, let table handle scroll */
  display: flex;
  flex-direction: column;
  position: relative; /* For absolute positioning if needed */
}

.data-view .el-table {
  height: 100% !important;
  width: 100% !important;
}

.full-height-table {
  height: 100% !important;
  width: 100% !important;
}

/* Force Element Plus table to full height with high specificity */
.data-view .el-table.full-height-table {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table.full-height-table .el-table__body-wrapper {
  height: calc(100% - 40px) !important; /* Subtract header height */
  overflow-y: auto !important;
}

.data-view .el-table.full-height-table .el-table__inner-wrapper {
  height: 100% !important;
}

/* Override any existing height constraints */
.data-view .el-table {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table .el-table__body-wrapper {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

/* Highest specificity to override Vue scoped CSS */
.data-view .el-table[data-v-11607a55] {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table[data-v-11607a55] .el-table__body-wrapper {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

/* Use :deep() to override Vue scoped CSS */
:deep(.data-view .el-table) {
  height: 100% !important;
  width: 100% !important;
}

:deep(.data-view .el-table .el-table__body-wrapper) {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

.data-view .el-table {
  height: 250px !important;
  overflow: auto;
}

.structure-view {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.table-details {
  margin-bottom: 2rem;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 1.5rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--el-border-color-light);
}

.detail-item:last-child {
  border-bottom: none;
}

.columns-section h4 {
  margin: 0 0 1.5rem 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--el-color-primary);
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.column-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background-color: var(--el-bg-color);
  transition: all 0.2s ease;
}

.column-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.column-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 0.9rem;
  flex: 2;
}

.column-type {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  flex: 2;
  text-align: center;
}

.column-nullable {
  color: var(--el-text-color-placeholder);
  font-size: 0.8rem;
  flex: 1;
  text-align: right;
  padding: 0.25rem 0.5rem;
  background-color: var(--el-bg-color-page);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}

.label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.value {
  color: var(--el-text-color-secondary);
}

.no-columns {
  text-align: center;
  padding: 2rem 0;
}

.error-message {
  margin-top: 1rem;
}

.no-data {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-data-content {
  text-align: center;
}

.load-data-button {
  margin-top: 1rem;
}

/* Structure View Styling */
.structure-view {
  padding: 1rem;
}

.structure-section,
.indexes-section {
  margin-bottom: 2rem;
}

.structure-section h4,
.indexes-section h4 {
  margin: 0 0 1.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--el-color-primary);
  color: var(--el-text-color-primary);
}

.structure-table,
.indexes-table {
  margin-top: 1rem;
}

.no-indexes {
  text-align: center;
  padding: 2rem 0;
}

/* Cell content styles */
.cell-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 8px 12px;
  transition: all 0.2s ease;
}

.truncated-text {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  padding: 4px 0;
  color: var(--el-text-color-primary);
  transition: color 0.2s ease;
}

.truncated-text:hover {
  color: var(--el-color-primary);
}

/* Modified cell styling */
.modified-cell {
  background-color: var(--el-color-warning-light-9) !important;
  border-left: 3px solid var(--el-color-warning) !important;
}

.modified-cell .truncated-text {
  color: var(--el-color-warning-dark-2);
  font-weight: 500;
}

/* Deleted row styling */
.deleted-row {
  background-color: var(--el-color-danger-light-9) !important;
  opacity: 0.7;
}

.deleted-row .cell-content {
  background-color: var(--el-color-danger-light-9) !important;
  border-left: 3px solid var(--el-color-danger) !important;
}

.deleted-row .truncated-text {
  color: var(--el-color-danger-dark-2);
  text-decoration: line-through;
}

/* Dark mode styles for modified cells */
.dark .modified-cell {
  background-color: rgba(230, 162, 60, 0.1) !important;
  border-left-color: #e6a23c !important;
}

.dark .modified-cell .truncated-text {
  color: #e6a23c;
}

/* Dark mode styles for deleted rows */
.dark .deleted-row {
  background-color: rgba(245, 108, 108, 0.1) !important;
}

.dark .deleted-row .cell-content {
  background-color: rgba(245, 108, 108, 0.1) !important;
  border-left-color: #f56c6c !important;
}

.dark .deleted-row .truncated-text {
  color: #f56c6c;
}

/* Table row hover effects */
:deep(.el-table__row:hover) {
  background-color: var(--el-color-primary-light-9) !important;
}

:deep(.el-table__row:hover .cell-content) {
  background-color: transparent;
}

:deep(.el-table__row:hover .truncated-text) {
  color: var(--el-color-primary);
}

/* Current row highlighting */
:deep(.el-table__row.current-row) {
  background-color: var(--el-color-primary-light-8) !important;
}

:deep(.el-table__row.current-row .cell-content) {
  background-color: transparent;
}

:deep(.el-table__row.current-row .truncated-text) {
  color: var(--el-color-primary);
  font-weight: 500;
}

/* Dark mode specific styles */
.dark :deep(.el-table__row:hover) {
  background-color: rgba(64, 158, 255, 0.1) !important;
}

.dark :deep(.el-table__row.current-row) {
  background-color: rgba(64, 158, 255, 0.15) !important;
}

.dark .truncated-text {
  color: var(--el-text-color-primary);
}

.dark .truncated-text:hover {
  color: #409eff;
}

/* Table header styles */
:deep(.el-table__header-wrapper) {
  background-color: var(--el-bg-color-page);
}

:deep(.el-table__header th) {
  background-color: var(--el-bg-color-page) !important;
  color: var(--el-text-color-primary) !important;
  border-bottom: 1px solid var(--el-border-color);
}

/* Table body styles */
:deep(.el-table__body-wrapper) {
  background-color: var(--el-bg-color);
}

:deep(.el-table__body td) {
  background-color: var(--el-bg-color) !important;
  color: var(--el-text-color-primary) !important;
  border-bottom: 1px solid var(--el-border-color-light);
}

/* Dark mode table styles */
.dark :deep(.el-table__header-wrapper) {
  background-color: #2d3748;
}

.dark :deep(.el-table__header th) {
  background-color: #2d3748 !important;
  color: var(--el-text-color-primary) !important;
  border-bottom-color: #4a5568;
}

.dark :deep(.el-table__body-wrapper) {
  background-color: #1a202c;
}

.dark :deep(.el-table__body td) {
  background-color: #1a202c !important;
  color: var(--el-text-color-primary) !important;
  border-bottom-color: #4a5568;
}

</style>
