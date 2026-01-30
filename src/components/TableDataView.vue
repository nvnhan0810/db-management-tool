<template>
  <div class="data-view" ref="viewRef">
    <!-- Filter Section -->
    <TableDataFilter
      v-if="data"
      :columns="getDataColumns(data.rows || [])"
      @apply="handleFilterApply"
    />

    <div v-if="isLoading" class="loading-data">
      <el-skeleton :rows="10" animated />
    </div>
    <div v-else-if="error" class="error-message">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
    <div v-else-if="data" class="data-content-wrapper">
      <div class="data-content" :class="{ 'with-sidebar': sidebarVisible }">
        <el-table
          v-if="data.rows && data.rows.length > 0"
          :data="data.rows"
          border
          style="width: 100%"
          max-height="500"
          stripe
          @cell-click="handleCellClick"
          @cell-dblclick="handleCellDblclick"
          :row-class-name="tableRowClassName"
          :cell-class-name="tableCellClassName"
        >
          <el-table-column
            v-for="column in getDataColumns(data.rows)"
            :key="column"
            :prop="column"
            :label="column"
            min-width="120"
            resizable
          >
            <template #default="{ row, $index }">
              <div
                v-if="editingCell?.rowIndex === $index && editingCell?.columnKey === column"
                class="cell-edit-wrap"
                :class="{ 'cell-edit-textarea': isTextColumn(column) }"
                @click.stop
              >
                <el-input
                  v-if="!isTextColumn(column)"
                  ref="editInputRef"
                  :model-value="editDraftValue"
                  size="small"
                  class="cell-edit-input"
                  @update:model-value="(v: string) => (editDraftValue = v)"
                  @blur="commitCellEdit($index, column)"
                  @keydown.enter.prevent="commitCellEdit($index, column)"
                />
                <el-input
                  v-else
                  ref="editInputRef"
                  :model-value="editDraftValue"
                  type="textarea"
                  :rows="2"
                  size="small"
                  class="cell-edit-input cell-edit-textarea-input"
                  @update:model-value="(v: string) => (editDraftValue = v)"
                  @blur="commitCellEdit($index, column)"
                  @keydown.enter.ctrl.prevent="commitCellEdit($index, column)"
                />
              </div>
              <span
                v-else
                class="cell-text"
                @dblclick.stop="startCellEdit($index, column)"
              >
                {{ formatCellValue(getDisplayCellValue(row, column, row[column])) || '\u00A0' }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="no-data">
          <el-empty description="No data found" :image-size="100" />
        </div>
      </div>
    </div>
    <div v-else class="loading-data">
      <el-skeleton :rows="10" animated />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import TableDataFilter from './TableDataFilter.vue';

interface TableData {
  rows: any[];
  total: number;
  page: number;
  perPage: number;
}

interface Filter {
  column: string;
  operator: string;
  value: string;
}

interface Props {
  data?: TableData | null;
  isLoading?: boolean;
  error?: string | null;
  dbType?: string;
  tableName?: string;
  connectionId?: string;
  /** Column name -> DB type (for text area vs single-line input) */
  columnTypes?: Record<string, string>;
  /** When true, right sidebar panel is open (layout with-sidebar) */
  sidebarPanelOpen?: boolean;
  /** When provided (sidebar in parent), use these; else use internal state */
  sidebarSelectedRowIndex?: number | null;
  sidebarSelectedColumn?: string | null;
  sidebarModifiedRows?: Record<number, Record<string, unknown>>;
  sidebarDeletedRows?: number[];
}

interface Emits {
  (e: 'filter-apply', whereClause: string | null): void;
  (e: 'refresh'): void;
  (e: 'cell-select', payload: { rowIndex: number; columnKey: string | null }): void;
  (e: 'sidebar-close'): void;
  (e: 'update-field', payload: { field: string; value: unknown }): void;
  (e: 'mark-deleted'): void;
  (e: 'unmark-deleted'): void;
}

const props = withDefaults(defineProps<Props>(), {
  data: null,
  isLoading: false,
  error: null,
  dbType: 'postgresql',
  tableName: '',
  connectionId: undefined,
  columnTypes: () => ({}),
  sidebarPanelOpen: false,
  sidebarSelectedRowIndex: undefined,
  sidebarSelectedColumn: undefined,
  sidebarModifiedRows: undefined,
  sidebarDeletedRows: undefined,
});

const emit = defineEmits<Emits>();
const viewRef = ref<HTMLElement | null>(null);

const useControlledSidebar = computed(() => props.sidebarSelectedRowIndex !== undefined);
const internalSelectedRowIndex = ref<number | null>(null);
const internalSelectedColumn = ref<string | null>(null);
const internalModifiedRows = ref<Record<number, Record<string, unknown>>>({});
const internalDeletedRows = ref<Set<number>>(new Set());

const selectedRowIndex = computed(() =>
  useControlledSidebar.value ? (props.sidebarSelectedRowIndex ?? null) : internalSelectedRowIndex.value
);
const selectedColumn = computed(() =>
  useControlledSidebar.value ? (props.sidebarSelectedColumn ?? null) : internalSelectedColumn.value
);
const modifiedRows = computed(() =>
  useControlledSidebar.value ? (props.sidebarModifiedRows ?? {}) : internalModifiedRows.value
);
const deletedRows = computed(() => {
  if (useControlledSidebar.value && props.sidebarDeletedRows) {
    return new Set(props.sidebarDeletedRows);
  }
  return internalDeletedRows.value;
});

const sidebarVisible = computed(() =>
  props.sidebarPanelOpen === true || (selectedRowIndex.value !== null && (props.data?.rows?.length ?? 0) > 0)
);

function isTextColumn(columnName: string): boolean {
  const t = props.columnTypes?.[columnName]?.toLowerCase() ?? '';
  return /^(text|varchar|character varying|string|nvarchar|longtext|mediumtext|clob)$/.test(t) || t.includes('text') || t.includes('varchar');
}

const editingCell = ref<{ rowIndex: number; columnKey: string } | null>(null);
const editDraftValue = ref('');
const editInputRef = ref<{ focus?: () => void; $el?: HTMLElement } | null>(null);

function focusEditInput() {
  nextTick(() => {
    nextTick(() => {
      const el = editInputRef.value;
      if (!el) return;
      if (typeof (el as { focus?: () => void }).focus === 'function') {
        (el as { focus: () => void }).focus();
      } else {
        const input = (el as { $el?: HTMLElement }).$el?.querySelector?.('input, textarea');
        if (input instanceof HTMLElement) input.focus();
      }
    });
  });
}

function startCellEdit(rowIndex: number, columnKey: string) {
  if (!props.data?.rows?.[rowIndex]) return;
  const row = props.data.rows[rowIndex] as Record<string, unknown>;
  const displayVal = getDisplayCellValue(row, columnKey, row[columnKey]);
  editingCell.value = { rowIndex, columnKey };
  editDraftValue.value = formatCellValue(displayVal);
  if (useControlledSidebar.value) {
    emit('cell-select', { rowIndex, columnKey });
  } else {
    internalSelectedRowIndex.value = rowIndex;
    internalSelectedColumn.value = columnKey;
  }
  focusEditInput();
}

function parseCellValue(v: string): unknown {
  const s = v.trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s;
}

function commitCellEdit(rowIndex: number, columnKey: string) {
  if (editingCell.value?.rowIndex !== rowIndex || editingCell.value?.columnKey !== columnKey) return;
  const value = parseCellValue(editDraftValue.value);
  if (useControlledSidebar.value) {
    emit('update-field', { field: columnKey, value });
  } else {
    if (!internalModifiedRows.value[rowIndex]) internalModifiedRows.value[rowIndex] = {};
    internalModifiedRows.value[rowIndex][columnKey] = value;
    internalModifiedRows.value = { ...internalModifiedRows.value };
  }
  editingCell.value = null;
}

const selectedRowData = computed(() => {
  const idx = selectedRowIndex.value;
  const rows = props.data?.rows;
  if (idx == null || !rows || idx < 0 || idx >= rows.length) return null;
  return rows[idx] as Record<string, unknown>;
});

const modifiedFieldsForSelectedRow = computed(() => {
  const idx = selectedRowIndex.value;
  if (idx == null) return {};
  return modifiedRows.value[idx] ?? {};
});

function handleCellClick(row: Record<string, unknown>, column: { property?: string }, _cell: unknown, _event: Event) {
  if (!props.data?.rows) return;
  const rowIndex = props.data.rows.indexOf(row as never);
  if (rowIndex < 0) return;
  if (useControlledSidebar.value) {
    emit('cell-select', { rowIndex, columnKey: column?.property ?? null });
  } else {
    internalSelectedRowIndex.value = rowIndex;
    internalSelectedColumn.value = column?.property ?? null;
  }
}

function handleCellDblclick() {
  // Double-click: selection already set by cell-click; sidebar can focus field
}

function tableRowClassName({ rowIndex }: { rowIndex: number }): string {
  return deletedRows.value.has(rowIndex) ? 'row-deleted' : '';
}

function tableCellClassName({ rowIndex, column }: { rowIndex: number; column: { property?: string } }): string {
  const key = column?.property;
  if (!key) return '';
  const mods = modifiedRows.value[rowIndex];
  if (mods && Object.prototype.hasOwnProperty.call(mods, key)) return 'cell-modified';
  return '';
}

function closeSidebar() {
  if (useControlledSidebar.value) {
    emit('sidebar-close');
  } else {
    internalSelectedRowIndex.value = null;
    internalSelectedColumn.value = null;
  }
}

function handleUpdateField(field: string, value: unknown) {
  const idx = selectedRowIndex.value;
  if (idx == null) return;
  if (useControlledSidebar.value) {
    emit('update-field', { field, value });
  } else {
    if (!internalModifiedRows.value[idx]) internalModifiedRows.value[idx] = {};
    internalModifiedRows.value[idx][field] = value;
    internalModifiedRows.value = { ...internalModifiedRows.value };
  }
}

function markRowDeleted() {
  const idx = selectedRowIndex.value;
  if (idx == null) return;
  if (useControlledSidebar.value) {
    emit('mark-deleted');
  } else {
    internalDeletedRows.value.add(idx);
    internalDeletedRows.value = new Set(internalDeletedRows.value);
  }
}

function unmarkRowDeleted() {
  const idx = selectedRowIndex.value;
  if (idx == null) return;
  if (useControlledSidebar.value) {
    emit('unmark-deleted');
  } else {
    internalDeletedRows.value.delete(idx);
    internalDeletedRows.value = new Set(internalDeletedRows.value);
  }
}

function handleClickOutside(e: MouseEvent) {
  if (useControlledSidebar.value) return;
  if (!viewRef.value?.contains(e.target as Node)) closeSidebar();
}

/** When editing a cell, click outside the input should commit and close. */
function handleClickOutsideEdit(e: MouseEvent) {
  if (!editingCell.value) return;
  const el = editInputRef.value;
  const inputEl: Node | null =
    el && typeof (el as { $el?: Node }).$el !== 'undefined'
      ? (el as { $el: Node }).$el
      : el && typeof (el as Node).contains === 'function'
        ? (el as Node)
        : null;
  if (inputEl && inputEl.contains(e.target as Node)) return;
  commitCellEdit(editingCell.value.rowIndex, editingCell.value.columnKey);
}

function escapeIdentifier(name: string): string {
  if (props.dbType === 'mysql') return '`' + name.replace(/`/g, '``') + '`';
  return '"' + name.replace(/"/g, '""') + '"';
}

/** Format value for SQL: datetime as Y-m-d H:i:s, NULL for null. */
function valueToSqlString(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const s = `${val.getUTCFullYear()}-${pad(val.getUTCMonth() + 1)}-${pad(val.getUTCDate())} ${pad(val.getUTCHours())}:${pad(val.getUTCMinutes())}:${pad(val.getUTCSeconds())}`;
    return "'" + s.replace(/'/g, "''") + "'";
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}([T\s]\d|$)/.test(s)) return "'" + s.slice(0, 19).replace(/'/g, "''") + "'";
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatted = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      return "'" + formatted.replace(/'/g, "''") + "'";
    }
    return "'" + s.replace(/'/g, "''") + "'";
  }
  const s = String(val).replace(/'/g, "''");
  return "'" + s + "'";
}

function escapeValue(val: unknown): string {
  return valueToSqlString(val);
}

function buildWhereFromRow(row: Record<string, unknown>, columns: string[]): string {
  const parts = columns.map(col => {
    const v = row[col];
    const ident = escapeIdentifier(col);
    if (v === null || v === undefined) return `${ident} IS NULL`;
    return `${ident} = ${escapeValue(v)}`;
  });
  return parts.join(' AND ');
}

async function runSave() {
  if (!props.tableName || !props.connectionId || !props.data?.rows) {
    ElMessage.warning('Table name or connection not available');
    return;
  }
  const rows = props.data.rows as Record<string, unknown>[];
  const columns = getDataColumns(props.data.rows);
  const dbType = props.dbType || 'postgresql';
  const tableNameEsc = dbType === 'mysql' ? '`' + props.tableName.replace(/`/g, '``') + '`' : '"' + props.tableName.replace(/"/g, '""') + '"';
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (deletedRows.value.has(i)) {
      statements.push(`DELETE FROM ${tableNameEsc} WHERE ${buildWhereFromRow(rows[i], columns)}`);
    } else {
      const mods = modifiedRows.value[i];
      if (mods && Object.keys(mods).length > 0) {
        const sets = Object.entries(mods).map(([k, v]) => `${escapeIdentifier(k)} = ${escapeValue(v)}`);
        statements.push(`UPDATE ${tableNameEsc} SET ${sets.join(', ')} WHERE ${buildWhereFromRow(rows[i], columns)}`);
      }
    }
  }
  if (statements.length === 0) {
    ElMessage.info('No changes to save');
    return;
  }
  try {
    for (const sql of statements) {
      const result = await window.electron.invoke('database:query', {
        connectionId: props.connectionId,
        query: sql,
      });
      if (result && !result.success) throw new Error(result.error || 'Query failed');
    }
    ElMessage.success('Saved');
    if (!useControlledSidebar.value) {
      internalModifiedRows.value = {};
      internalDeletedRows.value = new Set();
      internalSelectedRowIndex.value = null;
      internalSelectedColumn.value = null;
    }
    emit('refresh');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Save failed');
  }
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    runSave();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('mousedown', handleClickOutsideEdit);
  document.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('mousedown', handleClickOutsideEdit);
  document.removeEventListener('keydown', handleKeydown);
});

function getDisplayCellValue(row: unknown, columnKey: string | undefined, originalValue: unknown): unknown {
  if (!columnKey || !props.data?.rows) return originalValue;
  const rowIndex = props.data.rows.indexOf(row as never);
  if (rowIndex < 0) return originalValue;
  const mods = modifiedRows.value[rowIndex];
  if (mods && Object.prototype.hasOwnProperty.call(mods, columnKey)) return mods[columnKey];
  return originalValue;
}

const getDataColumns = (rows: any[]): string[] => {
  if (rows && rows.length > 0) {
    return Object.keys(rows[0]);
  }
  // If no rows but we have data structure, try to get columns from previous data
  if (props.data?.rows && props.data.rows.length > 0) {
    return Object.keys(props.data.rows[0]);
  }
  return [];
};

/** Format cell for display: datetime as Y-m-d H:i:s, raw from DB (no locale/timezone conversion). */
function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    // Already Y-m-d H:i:s or Y-m-d (MySQL, PGSQL raw)
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?$/.test(s)) {
      return s.replace(/\s+/g, ' ').slice(0, 19);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00:00';
    // ISO: 2025-01-29T10:30:00.000Z -> Y-m-d H:i:s (giữ nguyên, không đổi timezone)
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?(?:Z)?$/i);
    if (iso) {
      const [, date, h, m, sec] = iso;
      const pad = (n: string) => n.padStart(2, '0');
      return `${date} ${pad(h)}:${pad(m)}:${pad(sec ?? '0')}`;
    }
    return s;
  }
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Only treat as timestamp: seconds (10 digits) or milliseconds (13 digits), not IDs/counts/years
    const asMs = value > 1e12 ? value : value > 1e9 && value < 1e11 ? value * 1000 : NaN;
    if (!Number.isNaN(asMs)) {
      const d = new Date(asMs);
      if (!Number.isNaN(d.getTime())) return formatCellValue(d);
    }
    return String(value);
  }
  return String(value);
}

const buildWhereClause = (filters: Filter[] | null, rawSql: string | null): string | null => {
  const dbType = props.dbType || 'postgresql';
  if (rawSql) {
    return rawSql;
  }

  if (!filters || filters.length === 0) {
    return null;
  }

  const conditions = filters.map(filter => {
    const column = dbType === 'postgresql' ? `"${filter.column}"` :
                   dbType === 'mysql' ? `\`${filter.column}\`` :
                   filter.column;

    if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
      return `${column} ${filter.operator}`;
    }

    if (filter.operator === 'IN' || filter.operator === 'NOT IN') {
      const values = filter.value.split(',').map(v => {
        const trimmed = v.trim();
        // Try to detect if it's a number
        if (/^\d+$/.test(trimmed)) {
          return trimmed;
        }
        return `'${trimmed.replace(/'/g, "''")}'`;
      }).join(', ');
      return `${column} ${filter.operator} (${values})`;
    }

    if (filter.operator === 'LIKE' || filter.operator === 'NOT LIKE') {
      return `${column} ${filter.operator} '${filter.value.replace(/'/g, "''")}'`;
    }

    // For =, !=, >, <, >=, <=
    // Try to detect if value is a number
    const isNumeric = /^-?\d+(\.\d+)?$/.test(filter.value.trim());
    const value = isNumeric ? filter.value.trim() : `'${filter.value.replace(/'/g, "''")}'`;
    return `${column} ${filter.operator} ${value}`;
  });

  return conditions.join(' AND ');
};

const handleFilterApply = (filters: Filter[] | null, rawSql: string | null) => {
  // Build WHERE clause from filters or use raw SQL
  const whereClause = buildWhereClause(filters, rawSql);
  emit('filter-apply', whereClause);
};

const handleFilterClear = () => {
  // Clear filter means apply null whereClause to reload data without filters
  emit('filter-apply', null);
};
</script>

<style scoped lang="scss">
.data-view {
  height: 100%;
  min-height: 400px;
}

.loading-data {
  padding: 20px;
}

.error-message {
  padding: 20px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px;
}

.data-content-wrapper {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.data-content {
  flex: 1;
  min-width: 0;
  background-color: var(--el-bg-color-page);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

  &.with-sidebar {
    margin-right: 0;
  }

  .dark & {
    background-color: rgba(26, 32, 44, 0.8);
    border: 1px solid rgba(74, 85, 104, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  :deep(.el-table) {
    background-color: transparent;

    .el-table__body-wrapper {
      scrollbar-width: none;
      -ms-overflow-style: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }

    .dark & {
      background-color: transparent;
      color: #e2e8f0;
    }

    .el-table__header {
      background-color: var(--el-fill-color-lighter);

      th .cell {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dark & {
        background-color: rgba(45, 55, 72, 0.8);
        color: #e2e8f0;
      }

      th {
        .dark & {
          background-color: rgba(45, 55, 72, 0.8) !important;
          color: #e2e8f0 !important;
          border-bottom-color: rgba(74, 85, 104, 0.6) !important;
        }
      }
    }

    .el-table__body {
      .dark & {
        color: #e2e8f0;
      }

      tr {
        .dark & {
          background-color: rgba(26, 32, 44, 0.6);
          color: #e2e8f0;
        }

        &:hover {
          background-color: var(--el-fill-color-light);

          .dark & {
            background-color: rgba(45, 55, 72, 0.6) !important;
          }
        }

        &.el-table__row--striped {
          background-color: var(--el-fill-color-lighter);

          .dark & {
            background-color: rgba(45, 55, 72, 0.4) !important;
          }
        }

        td {
          .dark & {
            background-color: transparent !important;
            color: #e2e8f0 !important;
            border-bottom-color: rgba(74, 85, 104, 0.4) !important;
          }
        }
      }
    }
  }

  :deep(.row-deleted) {
    background-color: rgba(245, 108, 108, 0.2) !important;
    td {
      background-color: rgba(245, 108, 108, 0.15) !important;
      border-color: rgba(245, 108, 108, 0.4);
    }
  }

  :deep(.cell-modified) {
    background-color: rgba(230, 162, 60, 0.25) !important;
    border-color: rgba(230, 162, 60, 0.5);
  }

  .cell-edit-wrap {
    padding: 0 4px;
    min-width: 0;
  }

  .cell-edit-input {
    width: 100%;
  }

  .cell-edit-input :deep(.el-input__wrapper) {
    padding: 0 8px;
  }

  .cell-edit-textarea-input :deep(.el-textarea__inner) {
    min-height: 52px;
    resize: vertical;
  }

  .cell-text {
    display: block;
    min-height: 1em;
    cursor: cell;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
