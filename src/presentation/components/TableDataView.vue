<template>
  <div class="data-view" ref="viewRef">
    <!-- Filter Section -->
    <TableDataFilter
      v-if="data"
      :columns="displayColumns"
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
          v-if="displayRows.length > 0"
          :data="displayRows"
          border
          style="width: 100%"
          height="100%"
          stripe
          :default-sort="defaultSort"
          @sort-change="handleSortChange"
          @cell-click="handleCellClick"
          @cell-dblclick="handleCellDblclick"
          :row-class-name="tableRowClassName"
          :cell-class-name="tableCellClassName"
        >
          <el-table-column
            v-for="column in displayColumns"
            :key="column"
            :prop="column"
            :label="column"
            min-width="120"
            resizable
            :sortable="pendingNewRows.length > 0 ? false : 'custom'"
          >
            <template #default="{ row, $index }">
              <!-- New row: always show input -->
              <div
                v-if="isNewRow($index)"
                class="cell-add-wrap"
                @click.stop
              >
                <el-input
                  v-if="!isMultilineTextColumn(column)"
                  v-model="(row as Record<string, unknown>)[column]"
                  class="cell-add-input"
                  size="small"
                  placeholder=""
                  @click.stop
                />
                <el-input
                  v-else
                  v-model="(row as Record<string, unknown>)[column]"
                  class="cell-add-input"
                  size="small"
                  placeholder=""
                  @click.stop
                />
              </div>
              <!-- Existing row: edit or display -->
              <template v-else>
                <div
                  v-if="editingCell?.rowIndex === $index && editingCell?.columnKey === column"
                  class="cell-edit-wrap"
                  :class="{
                    'is-multiline-editable': isMultilineTextColumn(column) && isMultilineEditable
                  }"
                  @click.stop
                >
                  <el-input
                    v-if="!isMultilineTextColumn(column)"
                    ref="editInputRef"
                    :model-value="editDraftValue"
                    class="cell-edit-input"
                    @update:model-value="(v: string) => (editDraftValue = v)"
                    @blur="commitCellEdit($index, column)"
                    @keydown.enter.prevent="commitCellEdit($index, column)"
                  />
                  <div
                    v-else
                    :ref="setEditableDivRef"
                    class="cell-edit-input editable-div"
                    contenteditable="true"
                    @input="onEditableInput"
                    @blur="commitCellEdit($index, column)"
                    @keydown.enter.ctrl.prevent="commitCellEdit($index, column)"
                  ></div>
                </div>
                <span
                  v-else
                  class="cell-text"
                  @dblclick.stop="startCellEdit($index, column)"
                >
                  {{ formatCellValue(getDisplayCellValue(row, column, row[column])) || '\u00A0' }}
                </span>
              </template>
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
import TableDataFilter from '@/presentation/components/TableDataFilter.vue';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

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
  /** Column name -> DB type (for contenteditable vs single-line input) */
  columnTypes?: Record<string, string>;
  /** When true, right sidebar panel is open (layout with-sidebar) */
  sidebarPanelOpen?: boolean;
  /** When provided (sidebar in parent), use these; else use internal state */
  sidebarSelectedRowIndex?: number | null;
  sidebarSelectedColumn?: string | null;
  sidebarModifiedRows?: Record<number, Record<string, unknown>>;
  sidebarDeletedRows?: number[];
  /** Current sort column (DB field name), or null for no sort */
  sortBy?: string | null;
  /** Current sort order: 'asc', 'desc', or null for no sort */
  sortOrder?: 'asc' | 'desc' | null;
  /** Column names when table has no rows (from structure) */
  columnsFromStructure?: string[];
}

interface Emits {
  (e: 'filter-apply', whereClause: string | null): void;
  (e: 'refresh'): void;
  (e: 'cell-select', payload: { rowIndex: number; columnKey: string | null }): void;
  (e: 'sidebar-close'): void;
  (e: 'update-field', payload: { field: string; value: unknown }): void;
  (e: 'mark-deleted'): void;
  (e: 'unmark-deleted'): void;
  (e: 'sort-change', payload: { prop: string | null; order: 'ascending' | 'descending' | null }): void;
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
  sortBy: null,
  sortOrder: null,
  columnsFromStructure: () => [],
});

const emit = defineEmits<Emits>();
const viewRef = ref<HTMLElement | null>(null);

const dataRowsLength = computed(() => props.data?.rows?.length ?? 0);
const pendingNewRows = ref<Record<string, unknown>[]>([]);

const displayRows = computed(() => {
  const rows = props.data?.rows ?? [];
  return [...rows, ...pendingNewRows.value];
});

const displayColumns = computed(() => {
  if (displayRows.value.length > 0) {
    return Object.keys(displayRows.value[0] as object);
  }
  return props.columnsFromStructure ?? [];
});

function isNewRow(rowIndex: number): boolean {
  return rowIndex >= dataRowsLength.value;
}

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

// Map Tab's sort state to Element Plus default-sort format
const defaultSort = computed(() => {
  if (!props.sortBy || !props.sortOrder) {
    return {};
  }
  return {
    prop: props.sortBy,
    order: props.sortOrder === 'asc' ? 'ascending' : 'descending',
  } as const;
});

function getColumnType(columnName: string): string {
  const raw = props.columnTypes?.[columnName];
  return typeof raw === 'string' ? raw.toLowerCase().trim() : '';
}

function isMultilineTextColumn(columnName: string): boolean {
  const t = getColumnType(columnName);
  if (!t) return false;

  // Keep VARCHAR/CHAR as single-line input.
  if (t.includes('varchar') || t.includes('character varying') || t.includes('char(')) {
    return false;
  }

  // Use contenteditable only for long/multiline text-like columns.
  return /(text|longtext|mediumtext|tinytext|clob|ntext|json|xml)/.test(t);
}

function isNumericColumn(columnName: string): boolean {
  const t = getColumnType(columnName);
  if (!t) return false;
  return /(int|bigint|smallint|tinyint|numeric|decimal|double|float|real|serial)/.test(t);
}

const editingCell = ref<{ rowIndex: number; columnKey: string } | null>(null);
const editDraftValue = ref('');
const editInputRef = ref<{ focus?: () => void; $el?: HTMLElement } | HTMLElement | null>(null);
const isMultilineEditable = ref(false);

/** Chỉ set 1 lần khi div mount; dùng ref ổn định nên không bị gọi lại mỗi render → không nhảy caret */
function setEditableDivRef(el: unknown) {
  const htmlEl = el as HTMLElement | null;
  if (htmlEl) {
    editInputRef.value = htmlEl;
    htmlEl.innerText = editDraftValue.value;
  } else {
    editInputRef.value = null;
  }
}

function updateEditableMultilineFlag(fromEl?: HTMLElement | null) {
  const rawEl =
    fromEl ??
    (editInputRef.value && '$el' in (editInputRef.value as any)
      ? (editInputRef.value as any).$el
      : editInputRef.value);

  const el = rawEl as HTMLElement | null;
  if (!el) return;

  const hasOverflow = el.scrollHeight - el.clientHeight > 1;
  isMultilineEditable.value = hasOverflow;
}

function onEditableInput(e: Event) {
  const el = e.target as HTMLElement | null;
  // Với contenteditable, DOM là source-of-truth khi đang gõ.
  // Không sync ngược vào editDraftValue để tránh re-render làm nhảy caret.
  updateEditableMultilineFlag(el);
}

function moveCaretToEnd(el: HTMLElement) {
  if (el.getAttribute('contenteditable') === 'true') {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const len = el.value?.length ?? 0;
    el.setSelectionRange(len, len);
  }
}

function focusEditInput() {
  nextTick(() => {
    nextTick(() => {
      const el = editInputRef.value;
      if (!el) return;

      // Nếu ref trỏ trực tiếp tới div contenteditable
      if ((el as HTMLElement).getAttribute?.('contenteditable') === 'true') {
        const editable = el as HTMLElement;
        editable.focus();
        moveCaretToEnd(editable);
      } else {
        // Trường hợp el-input (component)
        const root = (el as { $el?: HTMLElement }).$el ?? null;
        const input = root?.querySelector?.('input') as HTMLInputElement | null;
        if (input) {
          input.focus();
          moveCaretToEnd(input);
        }
      }
      updateEditableMultilineFlag();
    });
  });
}

function startCellEdit(rowIndex: number, columnKey: string) {
  if (!props.data?.rows?.[rowIndex]) return;
  const row = props.data.rows[rowIndex] as Record<string, unknown>;
  const displayVal = getDisplayCellValue(row, columnKey, row[columnKey]);
  editingCell.value = { rowIndex, columnKey };
  editDraftValue.value = formatCellValue(displayVal);
  isMultilineEditable.value = false;
  if (useControlledSidebar.value) {
    emit('cell-select', { rowIndex, columnKey });
  } else {
    internalSelectedRowIndex.value = rowIndex;
    internalSelectedColumn.value = columnKey;
  }
  focusEditInput();
}

watch(editDraftValue, () => {
  nextTick(() => updateEditableMultilineFlag());
});

function parseCellValue(v: string): unknown {
  const s = v.trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;

  // Try to parse numeric strings so that "22" becomes 22 and equals original number 22
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const num = Number(s);
    if (!Number.isNaN(num)) return num;
  }

  return s;
}

function commitCellEdit(rowIndex: number, columnKey: string) {
  if (editingCell.value?.rowIndex !== rowIndex || editingCell.value?.columnKey !== columnKey) return;

  // Lấy raw value tuỳ theo loại cột
  let raw = editDraftValue.value;
  if (isMultilineTextColumn(columnKey)) {
    const el = editInputRef.value as HTMLElement | null;
    raw = el?.innerText ?? '';
  }
  const trimmed = raw.trim();

  // Nếu là cột numeric (int/bigint/decimal...) thì chặn giá trị không phải số
  if (isNumericColumn(columnKey)) {
    const isNullLike = trimmed === '' || trimmed.toUpperCase() === 'NULL';
    const isNumeric = /^-?\d+(\.\d+)?$/.test(trimmed);
    if (!isNullLike && !isNumeric) {
      ElMessage.error('Invalid numeric value for this column');
      return; // giữ nguyên editing để user sửa lại
    }
  }

  const value = parseCellValue(raw);

  // Determine original value for comparison
  const original =
    props.data?.rows && props.data.rows[rowIndex]
      ? (props.data.rows[rowIndex] as Record<string, unknown>)[columnKey]
      : undefined;

  if (useControlledSidebar.value) {
    // In controlled mode, always emit update-field; parent can decide how to treat "no-op" edits
    emit('update-field', { field: columnKey, value });
  } else {
    // Internal mode: only keep modified state if value is actually different from original
    const rowMods = internalModifiedRows.value[rowIndex] || {};

    if (value === original) {
      // Revert: remove modification for this field
      if (Object.prototype.hasOwnProperty.call(rowMods, columnKey)) {
        delete rowMods[columnKey];
      }
    } else {
      rowMods[columnKey] = value;
    }

    // If row has no more modified fields, remove the row entry
    if (Object.keys(rowMods).length === 0) {
      const { [rowIndex]: _removed, ...rest } = internalModifiedRows.value;
      internalModifiedRows.value = { ...rest };
    } else {
      internalModifiedRows.value = {
        ...internalModifiedRows.value,
        [rowIndex]: rowMods,
      };
    }
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
  const rowIndex = displayRows.value.indexOf(row as never);
  if (rowIndex < 0) return;
  if (isNewRow(rowIndex)) return;
  if (!props.data?.rows) return;
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
  const classes: string[] = [];
  if (isNewRow(rowIndex)) {
    classes.push('row-new');
  }
  if (deletedRows.value.has(rowIndex)) {
    classes.push('row-deleted');
  }
  if (rowIndex === selectedRowIndex.value) {
    classes.push('row-selected');
  }
  return classes.join(' ');
}

function tableCellClassName({ rowIndex, column }: { rowIndex: number; column: { property?: string } }): string {
  const key = column?.property;
  if (!key) return '';

  if (isNewRow(rowIndex)) return 'cell-new';

  // While editing this cell: mark as editing to allow custom layout/padding
  if (editingCell.value && editingCell.value.rowIndex === rowIndex && editingCell.value.columnKey === key) {
    return 'cell-editing';
  }

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

/** When editing a cell, click outside the edited td should commit and close. */
function handleClickOutsideEdit(e: MouseEvent) {
  if (!editingCell.value) return;
  const tableRoot = viewRef.value;
  if (!tableRoot) return;

  const cellEl = tableRoot.querySelector('.cell-editing') as HTMLElement | null;
  if (cellEl && cellEl.contains(e.target as Node)) {
    // Click vẫn ở bên trong ô đang edit → không commit
    return;
  }

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

function isLargeTextColumn(col: string): boolean {
  const t = props.columnTypes?.[col]?.toLowerCase() ?? '';
  return t === 'text' || t.includes('text') || t === 'blob' || t.includes('blob') || t === 'longtext' || t === 'mediumtext' || t === 'clob';
}

function buildWhereFromRow(row: Record<string, unknown>, columns: string[]): string {
  // Strategy: prefer single `id` column → simplest and most reliable WHERE
  const idCol = columns.find(c => c.toLowerCase() === 'id');
  if (idCol !== undefined && row[idCol] !== null && row[idCol] !== undefined) {
    return `${escapeIdentifier(idCol)} = ${escapeValue(row[idCol])}`;
  }

  // Fallback: exclude large text/blob columns to avoid multiline comparison issues
  const safeCols = columns.filter(col => !isLargeTextColumn(col));
  const useCols = safeCols.length > 0 ? safeCols : columns;

  const parts = useCols.map(col => {
    const v = row[col];
    const ident = escapeIdentifier(col);
    if (v === null || v === undefined) return `${ident} IS NULL`;
    return `${ident} = ${escapeValue(v)}`;
  });
  return parts.join(' AND ');
}

async function runSave() {
  if (editingCell.value) {
    const { rowIndex, columnKey } = editingCell.value;
    commitCellEdit(rowIndex, columnKey);
  }

  if (!props.tableName || !props.connectionId) {
    ElMessage.warning('Table name or connection not available');
    return;
  }

  const columns = displayColumns.value;
  const dbType = props.dbType || 'postgresql';
  const tableNameEsc = dbType === 'mysql' ? '`' + props.tableName.replace(/`/g, '``') + '`' : '"' + props.tableName.replace(/"/g, '""') + '"';
  const statements: string[] = [];

  const rows = props.data?.rows as Record<string, unknown>[] | undefined;
  if (rows) {
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
  }

  for (const newRow of pendingNewRows.value) {
    const cols: string[] = [];
    const vals: string[] = [];
    for (const col of columns) {
      const v = newRow[col];
      const s = typeof v === 'string' ? v.trim() : v;
      if (s === '' || s === null || s === undefined) {
        cols.push(escapeIdentifier(col));
        vals.push('NULL');
      } else {
        cols.push(escapeIdentifier(col));
        vals.push(escapeValue(s));
      }
    }
    if (cols.length > 0) {
      statements.push(`INSERT INTO ${tableNameEsc} (${cols.join(', ')}) VALUES (${vals.join(', ')})`);
    }
  }

  if (statements.length === 0) {
    ElMessage.info('No changes to save');
    return;
  }
  try {
    for (const sql of statements) {
      const result = (await window.electron.invoke('database:query', {
        connectionId: props.connectionId,
        query: sql,
      })) as { success?: boolean; error?: string } | null;
      if (result && !result.success) throw new Error(result.error || 'Query failed');
    }
    ElMessage.success('Saved');
    if (!useControlledSidebar.value) {
      internalModifiedRows.value = {};
      internalDeletedRows.value = new Set();
      internalSelectedRowIndex.value = null;
      internalSelectedColumn.value = null;
    }
    pendingNewRows.value = [];
    emit('refresh');
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : 'Save failed');
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('mousedown', handleClickOutsideEdit);
});
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('mousedown', handleClickOutsideEdit);
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
    if (filter.operator === 'RAW SQL') {
      return `(${filter.value})`;
    }

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

// Forward Element Plus sort-change to parent so it can reload data with ORDER BY
function handleSortChange(params: { column: any; prop: string | undefined; order: 'ascending' | 'descending' | null }) {
  const prop = params.prop ?? null;
  emit('sort-change', { prop, order: params.order });
}

function addRow() {
  const columns = displayColumns.value;
  if (columns.length === 0) {
    ElMessage.warning('No columns available. Load table structure first.');
    return;
  }
  const newRow = reactive(
    Object.fromEntries(columns.map((c) => [c, '']))
  ) as Record<string, unknown>;
  pendingNewRows.value.push(newRow);
  nextTick(() => {
    scrollTableToBottom();
  });
}

function scrollTableToBottom() {
  nextTick(() => {
    const root = viewRef.value;
    if (!root) return;
    const bodyWrapper = root.querySelector('.el-table__body-wrapper');
    if (bodyWrapper) {
      bodyWrapper.scrollTop = bodyWrapper.scrollHeight;
    }
  });
}

function hasUnsavedChanges(): boolean {
  if (editingCell.value) return true;
  if (pendingNewRows.value.length > 0) return true;
  if (Object.keys(modifiedRows.value ?? {}).length > 0) return true;
  return deletedRows.value.size > 0;
}

function clearUnsavedChanges() {
  // Discard UI editing state
  editingCell.value = null;
  editDraftValue.value = '';
  isMultilineEditable.value = false;

  // Discard new rows draft
  pendingNewRows.value = [];

  // Discard internal sidebar state when uncontrolled
  internalModifiedRows.value = {};
  internalDeletedRows.value = new Set();
  internalSelectedRowIndex.value = null;
  internalSelectedColumn.value = null;
}

defineExpose({ runSave, addRow, hasUnsavedChanges, clearUnsavedChanges });
</script>

<style scoped lang="scss">
.data-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
    background-color: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
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
      color: var(--el-text-color-primary);
    }

    .el-table__header {
      background-color: var(--el-fill-color-lighter);

      th .cell {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dark & {
        background-color: var(--el-fill-color-light);
        color: var(--el-text-color-primary);
      }

      th {
        .dark & {
          background-color: var(--el-fill-color-light) !important;
          color: var(--el-text-color-primary) !important;
          border-bottom-color: var(--el-border-color-darker) !important;
        }
      }
    }

    .el-table__body {
      .dark & {
        color: var(--el-text-color-primary);
      }

      tr {
        .dark & {
          background-color: var(--el-bg-color);
          color: var(--el-text-color-primary);
        }

        &:hover > td {
          background-color: rgba(64, 158, 255, 0.10) !important;

          .dark & {
            background-color: rgba(64, 158, 255, 0.25) !important;
          }
        }

        &.el-table__row--striped {
          background-color: var(--el-fill-color-lighter);

          .dark & {
            background-color: var(--el-fill-color-lighter) !important;
          }
        }

        td {
          .dark & {
            background-color: var(--el-bg-color);
            color: var(--el-text-color-primary);
            border-bottom-color: var(--el-border-color-darker) !important;
          }
        }
      }
    }
  }

  :deep(.row-new) {
    background-color: rgba(103, 194, 58, 0.12) !important;
    td {
      background-color: rgba(103, 194, 58, 0.08) !important;
    }
  }

  :deep(.cell-new) {
    padding: 0 !important;
  }

  :deep(.cell-new .cell) {
    padding: 0 !important;
  }

  .cell-add-wrap {
    padding: 0 4px;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .cell-add-input {
    width: 100%;
  }

  .cell-add-input :deep(.el-input__wrapper) {
    border: none !important;
    box-shadow: none !important;
    background-color: var(--el-fill-color-light) !important;
    padding: 0 8px !important;
  }

  :deep(.row-deleted) {
    background-color: rgba(245, 108, 108, 0.2) !important;
    td {
      background-color: rgba(245, 108, 108, 0.15) !important;
      border-color: var(--el-border-color-darker);
    }
  }

  :deep(.row-selected) {
    & > td {
      background-color: rgba(64, 158, 255, 0.16) !important;

      .dark & {
        background-color: rgba(64, 158, 255, 0.25) !important;
      }
    }
  }

  :deep(.cell-modified) {
    background-color: rgba(230, 162, 60, 0.25) !important;
    border-color: var(--el-border-color-darker);
  }

  .cell-edit-wrap {
    padding: 0 4px;
    min-width: 0;
    display: flex;
    align-items: center; /* default: single-line centered vertically */
    height: 100%;
  }

  .cell-edit-input {
    width: 100%;
  }

  .cell-edit-input :deep(.el-input__wrapper) {
    padding: 0 8px;
  }

  .editable-div {
    width: 100%;
    height: 42px;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    display: block;
    padding: 0 8px;
    overflow-y: auto;
    line-height: 42px; /* 1 dòng: căn giữa dọc */
  }

  .cell-edit-wrap.is-multiline-editable {
    align-items: stretch;
  }

  .cell-edit-wrap.is-multiline-editable .editable-div {
    align-items: flex-start;
    line-height: 1.5; /* nhiều dòng: bình thường */
  }

  .cell-text {
    display: block;
    min-height: 1em;
  cursor: text;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Editing cell: make input fill full td, remove inner padding/border so td border is used */
  :deep(.cell-editing) {
    padding: 0 !important;
  }

  :deep(.cell-editing .cell) {
    padding: 0 !important;
  }

  :deep(.cell-editing .cell-edit-wrap) {
    padding: 0 !important;
    height: 100%;
  }

  :deep(.cell-editing .cell-edit-input .el-input__wrapper) {
    border: none !important;
    box-shadow: none !important;
    background-color: var(--el-bg-color-overlay) !important;
    color: var(--el-text-color-primary) !important;
    padding: 0 8px !important;
    height: 100% !important;
  }

  :deep(.cell-editing .cell-edit-input.editable-div) {
    border: none !important;
    box-shadow: none !important;
    background-color: var(--el-bg-color-overlay) !important;
    color: var(--el-text-color-primary) !important;
  }

  :deep(.cell-editing .cell-edit-input .el-input__wrapper) {
    display: flex;
    align-items: center;
  }

  :deep(.cell-editing .cell-edit-input .el-input__inner) {
    height: 38px !important;
  }
}
</style>
