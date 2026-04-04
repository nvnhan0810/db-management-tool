<template>
  <div class="data-view" ref="viewRef">
    <!-- Filter Section -->
    <TableDataFilter v-if="data" :columns="displayColumns" :preset-filters="presetFilters"
      :preset-nonce="props.filterPresetNonce" @apply="handleFilterApply" />

    <div v-if="isLoading" class="loading-data">
      <el-skeleton :rows="10" animated />
    </div>
    <div v-else-if="error" class="error-message">
      <el-alert :title="error" type="error" :closable="false" show-icon />
    </div>
    <div v-else-if="data" class="data-content-wrapper">
      <div class="data-content" :class="{ 'with-sidebar': sidebarVisible }">
        <el-table v-if="displayColumns.length > 0" size="small" :data="displayRows" :row-key="getTableRowKey" border
          style="width: 100%" height="100%" :default-sort="defaultSort" @sort-change="handleSortChange"
          @cell-click="handleCellClick" @cell-dblclick="handleCellDblclick" :row-class-name="tableRowClassName"
          :cell-class-name="tableCellClassName">
          <el-table-column v-for="column in displayColumns" :key="column" :prop="column" :label="column" min-width="100"
            resizable :sortable="pendingNewRows.length > 0 ? false : 'custom'">
            <template #default="{ row, $index }">
              <!-- New row: always show input -->
              <div v-if="isNewRow($index)" class="cell-add-wrap" @click.stop>
                <el-input
                  v-if="!isMultilineTextColumn(column)"
                  class="cell-add-input"
                  size="small"
                  placeholder=""
                  :model-value="newRowCellDisplay(row as Record<string, unknown>, column)"
                  @update:model-value="(v: string) => onNewRowCellUpdate(row as Record<string, unknown>, column, v)"
                  @click.stop
                />
                <el-input
                  v-else
                  class="cell-add-input"
                  size="small"
                  placeholder=""
                  :model-value="newRowCellDisplay(row as Record<string, unknown>, column)"
                  @update:model-value="(v: string) => onNewRowCellUpdate(row as Record<string, unknown>, column, v)"
                  @click.stop
                />
              </div>
              <!-- Existing row: edit or display -->
              <template v-else>
                <div v-if="editingCell?.rowIndex === $index && editingCell?.columnKey === column" class="cell-edit-wrap"
                  :class="{
                    'is-multiline-editable': isMultilineTextColumn(column) && isMultilineEditable
                  }" @click.stop>
                  <el-input v-if="!isMultilineTextColumn(column)" ref="editInputRef" size="small"
                    :model-value="editDraftValue" class="cell-edit-input"
                    @update:model-value="(v: string) => (editDraftValue = v)" @blur="commitCellEdit($index, column)"
                    @keydown.enter.prevent="commitCellEdit($index, column)" />
                  <div v-else :ref="setEditableDivRef" class="cell-edit-input editable-div" contenteditable="true"
                    @input="onEditableInput" @blur="commitCellEdit($index, column)"
                    @keydown.enter.ctrl.prevent="commitCellEdit($index, column)"></div>
                </div>
                <span v-else class="cell-text" @dblclick.stop="startCellEdit($index, column)">
                  <span class="cell-text-value">
                    {{ formatCellValue(getDisplayCellValue(row, column, row[column])) || '\u00A0' }}
                  </span>
                  <button
                    v-if="getForeignKeyTarget(column) && row[column] !== null && row[column] !== undefined && row[column] !== ''"
                    class="cell-fk-btn" type="button" title="Open related"
                    @click.stop="openRelated(column, row[column])">
                    →
                  </button>
                </span>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="no-data">
          <el-empty description="No columns loaded — open Structure or wait for the table to load" :image-size="72" />
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
import {
  formatDbCellDisplayValue as formatCellValue,
  isTemporalSqlType,
} from '@/presentation/utils/dbCellDisplayFormat';
import { showErrorDialog, showSqlErrorDialog } from '@/presentation/utils/errorDialogs';
import { ElMessage } from 'element-plus';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue';

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
  /** Column name -> nullable (from structure); drives NULL vs empty string when editing / new rows */
  columnNullable?: Record<string, boolean>;
  /**
   * Foreign keys mapping: columnName -> "refTable.refColumn"
   * Example: { user_id: "users.id" }
   */
  foreignKeys?: Record<string, string>;
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
  /** Ordered PRIMARY KEY column names from information_schema (empty = infer) */
  primaryKeyColumns?: string[];
  /** When set (e.g. jumping via FK), auto-populate filter UI */
  filterPreset?: { column: string; operator: string; value: string } | null;
  /** Increment to re-apply preset even if same values */
  filterPresetNonce?: number;
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
  (e: 'open-related', payload: { refTable: string; refColumn: string; value: unknown }): void;
}

const props = withDefaults(defineProps<Props>(), {
  data: null,
  isLoading: false,
  error: null,
  dbType: 'postgresql',
  tableName: '',
  connectionId: undefined,
  columnTypes: () => ({}),
  columnNullable: () => ({}),
  foreignKeys: () => ({}),
  sidebarPanelOpen: false,
  sidebarSelectedRowIndex: undefined,
  sidebarSelectedColumn: undefined,
  sidebarModifiedRows: undefined,
  sidebarDeletedRows: undefined,
  sortBy: null,
  sortOrder: null,
  columnsFromStructure: () => [],
  primaryKeyColumns: () => [],
  filterPreset: null,
  filterPresetNonce: 0,
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

/** Without stable row-key, el-table reuses inputs and add-row cells can show/bind wrong columns. */
const TABLE_DRAFT_ROW_KEY = Symbol('tableDraftRowKey');
const dataRowStableIds = new WeakMap<object, string>();

function getTableRowKey(row: Record<string, unknown>): string {
  if (!row || typeof row !== 'object') return '';
  const draftId = (row as unknown as { [k: symbol]: string | undefined })[TABLE_DRAFT_ROW_KEY];
  if (typeof draftId === 'string' && draftId !== '') return `draft:${draftId}`;

  const pkCols = props.primaryKeyColumns ?? [];
  if (pkCols.length > 0) {
    const hasAny = pkCols.some((c) => row[c] != null && row[c] !== '');
    if (hasAny) {
      return `pk:${pkCols.map((c) => `${c}:${String(row[c])}`).join('|')}`;
    }
  }

  const raw = (toRaw(row) ?? row) as object;
  let stable = dataRowStableIds.get(raw);
  if (!stable) {
    stable =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `r${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    dataRowStableIds.set(raw, stable);
  }
  return `row:${stable}`;
}

const presetFilters = computed(() => {
  const p = props.filterPreset;
  if (!p || !p.column) return null;
  return [
    {
      column: p.column,
      operator: p.operator || '=',
      value: p.value ?? '',
    },
  ] as Array<{ column: string; operator: string; value: string }>;
});

function getForeignKeyTarget(columnName: string): { refTable: string; refColumn: string } | null {
  const raw = props.foreignKeys?.[columnName];
  if (!raw || typeof raw !== 'string') return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const refTable = raw.slice(0, idx).trim();
  const refColumn = raw.slice(idx + 1).trim();
  if (!refTable || !refColumn) return null;
  return { refTable, refColumn };
}

function openRelated(columnName: string, value: unknown) {
  const t = getForeignKeyTarget(columnName);
  if (!t) return;
  emit('open-related', { refTable: t.refTable, refColumn: t.refColumn, value });
}

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

function isJsonColumn(columnName: string): boolean {
  const t = getColumnType(columnName);
  if (!t) return false;
  return /\bjsonb?\b/i.test(t);
}

/** From structure; missing key treated as nullable so empty/NULL still maps to SQL NULL. */
function isColumnNullable(columnKey: string): boolean {
  return props.columnNullable?.[columnKey] !== false;
}

/** New row: nullable → null; NOT NULL → empty string (no prefilled test values). */
function initialValueForNewColumn(column: string): unknown {
  return isColumnNullable(column) ? null : '';
}

function newRowCellDisplay(row: Record<string, unknown>, column: string): string {
  const v = row[column];
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  }
  if (v instanceof Date) return formatCellValue(v);
  return String(v);
}

function onNewRowCellUpdate(row: Record<string, unknown>, column: string, raw: string) {
  row[column] = parseCellValue(raw, column);
}

function isDateTimeColumn(columnName: string): boolean {
  const t = getColumnType(columnName);
  if (!t) return false;
  return isTemporalSqlType(t);
}

/** Compare committed edit to DB row: Date vs formatted string must not count as modified. */
function valuesEqualAfterEdit(columnKey: string, value: unknown, original: unknown): boolean {
  if (value === original) return true;
  if (value == null && original == null) return true;
  if (value == null || original == null) return false;

  if (isNumericColumn(columnKey)) {
    const nv = typeof value === 'number' ? value : Number(String(value).trim());
    const no = typeof original === 'number' ? original : Number(String(original).trim());
    if (!Number.isNaN(nv) && !Number.isNaN(no) && nv === no) return true;
  }

  if (isDateTimeColumn(columnKey) || original instanceof Date || value instanceof Date) {
    return formatCellValue(value).trim() === formatCellValue(original).trim();
  }

  return String(value) === String(original);
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

function parseCellValue(v: string, columnKey: string): unknown {
  const s = v.trim();
  if (s === '' || s.toUpperCase() === 'NULL') {
    return isColumnNullable(columnKey) ? null : '';
  }

  if (isJsonColumn(columnKey) && (s.startsWith('{') || s.startsWith('['))) {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return s;
    }
  }

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
      showErrorDialog({
        title: 'Invalid value',
        message: 'Invalid numeric value for this column',
      });
      return; // giữ nguyên editing để user sửa lại
    }
  }

  const value = parseCellValue(raw, columnKey);

  // Determine original value for comparison
  const original =
    props.data?.rows && props.data.rows[rowIndex]
      ? (props.data.rows[rowIndex] as Record<string, unknown>)[columnKey]
      : undefined;

  if (useControlledSidebar.value) {
    if (!valuesEqualAfterEdit(columnKey, value, original)) {
      emit('update-field', { field: columnKey, value });
    }
  } else {
    // Internal mode: only keep modified state if value is actually different from original
    const rowMods = internalModifiedRows.value[rowIndex] || {};

    if (valuesEqualAfterEdit(columnKey, value, original)) {
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
  if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
    try {
      const json = JSON.stringify(val);
      return "'" + json.replace(/'/g, "''") + "'";
    } catch {
      return 'NULL';
    }
  }
  const s = String(val).replace(/'/g, "''");
  return "'" + s + "'";
}

function escapeValue(val: unknown): string {
  return valueToSqlString(val);
}

/**
 * WHERE clause values: numeric columns must not treat digit-like date strings as timestamps
 * (avoids `id = '2001-01-31...'` when `id` is bigint).
 */
function escapeValueForWhere(column: string, val: unknown): string {
  if (isNumericColumn(column)) {
    if (typeof val === 'number' && Number.isFinite(val)) return String(val);
    if (typeof val === 'bigint') return String(val);
    if (typeof val === 'string') {
      const s = val.trim();
      if (/^-?\d+$/.test(s)) return s;
      if (/^-?\d*\.\d+$/.test(s)) return s;
      return "'" + s.replace(/'/g, "''") + "'";
    }
  }
  return valueToSqlString(val);
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}([T\s]\d|$)/;

function looksLikeDatetimeValue(val: unknown): boolean {
  if (val instanceof Date) return true;
  if (typeof val === 'string') {
    const s = val.trim();
    if (ISO_DATE_PREFIX.test(s)) return true;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return !Number.isNaN(d.getTime());
    }
  }
  return false;
}

function isLikelyScalarRowId(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number' && Number.isFinite(val)) return true;
  if (typeof val === 'bigint') return true;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return false;
    if (looksLikeDatetimeValue(val)) return false;
    if (/^-?\d+$/.test(s)) return true;
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/** Parse JSON text in new-row cells so INSERT sends proper JSON literals for json/jsonb columns. */
function normalizeJsonInputForSql(columnKey: string, raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  if (!isJsonColumn(columnKey)) return raw;
  const t = raw.trim();
  if (t === '') return raw;
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function isLargeTextColumn(col: string): boolean {
  const t = props.columnTypes?.[col]?.toLowerCase() ?? '';
  return t === 'text' || t.includes('text') || t === 'blob' || t.includes('blob') || t === 'longtext' || t === 'mediumtext' || t === 'clob';
}

function buildWhereFromRow(
  row: Record<string, unknown>,
  columns: string[],
  pkCols: string[]
): string {
  const orderedPk = pkCols.filter((c) => columns.includes(c));
  if (orderedPk.length > 0 && orderedPk.length === pkCols.length) {
    return orderedPk
      .map((col) => {
        const v = row[col];
        const ident = escapeIdentifier(col);
        if (v === null || v === undefined) return `${ident} IS NULL`;
        return `${ident} = ${escapeValueForWhere(col, v)}`;
      })
      .join(' AND ');
  }

  const idCol = columns.find((c) => c.toLowerCase() === 'id');
  if (
    idCol !== undefined &&
    row[idCol] !== null &&
    row[idCol] !== undefined &&
    isLikelyScalarRowId(row[idCol])
  ) {
    return `${escapeIdentifier(idCol)} = ${escapeValueForWhere(idCol, row[idCol])}`;
  }

  const safeCols = columns.filter((col) => !isLargeTextColumn(col) && !isJsonColumn(col));
  const useCols = safeCols.length > 0 ? safeCols : columns;

  const parts = useCols.map((col) => {
    const v = row[col];
    const ident = escapeIdentifier(col);
    if (v === null || v === undefined) return `${ident} IS NULL`;
    return `${ident} = ${escapeValueForWhere(col, v)}`;
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
        statements.push(
          `DELETE FROM ${tableNameEsc} WHERE ${buildWhereFromRow(rows[i], columns, props.primaryKeyColumns)}`
        );
      } else {
        const mods = modifiedRows.value[i];
        if (mods && Object.keys(mods).length > 0) {
          const sets = Object.entries(mods).map(([k, v]) => `${escapeIdentifier(k)} = ${escapeValue(v)}`);
          statements.push(
            `UPDATE ${tableNameEsc} SET ${sets.join(', ')} WHERE ${buildWhereFromRow(rows[i], columns, props.primaryKeyColumns)}`
          );
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
      const nullLike =
        s === null ||
        s === undefined ||
        s === '' ||
        (typeof s === 'string' && s.trim().toUpperCase() === 'NULL');
      if (nullLike) {
        cols.push(escapeIdentifier(col));
        vals.push('NULL');
      } else {
        cols.push(escapeIdentifier(col));
        const normalized = normalizeJsonInputForSql(col, s);
        vals.push(escapeValueForWhere(col, normalized));
      }
    }
    if (cols.length > 0) {
      statements.push(`INSERT INTO ${tableNameEsc} (${cols.join(', ')}) VALUES (${vals.join(', ')})`);
    }
  }

  if (statements.length === 0) {
    // keep as info toast? requirement says remove error toasts; keep this minimal info.
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
    if (!useControlledSidebar.value) {
      internalModifiedRows.value = {};
      internalDeletedRows.value = new Set();
      internalSelectedRowIndex.value = null;
      internalSelectedColumn.value = null;
    }
    pendingNewRows.value = [];
    emit('refresh');
  } catch (err) {
    await showSqlErrorDialog('Save failed', err);
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
    Object.fromEntries(columns.map((c) => [c, initialValueForNewColumn(c)]))
  ) as Record<string, unknown>;
  Object.defineProperty(newRow, TABLE_DRAFT_ROW_KEY, {
    value:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `d${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    enumerable: false,
    configurable: true,
  });
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
  padding: 12px 16px;
}

.error-message {
  padding: 12px 16px;

  :deep(.el-alert) {
    padding: 8px 12px;
  }

  :deep(.el-alert__title) {
    font-size: 13px;
    line-height: 1.4;
  }
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

  :deep(.el-table) {
    background-color: transparent;
    font-size: 12px;

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

        &:hover {
          &.row-selected>td {
            background-color: rgba(0, 128, 255, 0.4) !important;
          }

          &.row-deleted>td {
            background-color: rgba(245, 108, 108, 0.2) !important;
          }

          &.row-new>td {
            background-color: rgba(103, 194, 58, 0.12) !important;
          }

          &.row-modified>td {
            background-color: rgba(230, 162, 60, 0.25) !important;
          }

          >td {
            background-color: rgba(64, 158, 255, 0.25) !important;
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
    padding: 0 8px !important;
    background-color: transparent !important;
  }

  :deep(.row-selected) {
    &>td {
      background-color: rgba(0, 128, 255, 0.4) !important;

      &.cell-modified {
        background-color: rgba(230, 162, 60, 0.25) !important;
      }
    }
  }

  :deep(.row-deleted) {
    background-color: rgba(245, 108, 108, 0.2) !important;

    td {
      background-color: rgba(245, 108, 108, 0.15) !important;
      border-color: var(--el-border-color-darker);
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
    align-items: center;
    /* default: single-line centered vertically */
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
    height: 32px;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    display: block;
    padding: 0 6px;
    overflow-y: auto;
    line-height: 32px;
    /* align with small table row */
  }

  .cell-edit-wrap.is-multiline-editable {
    align-items: stretch;
  }

  .cell-edit-wrap.is-multiline-editable .editable-div {
    align-items: flex-start;
    line-height: 1.5;
    /* nhiều dòng: bình thường */
  }

  .cell-text {
    display: block;
    min-height: 1em;
    cursor: text;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    position: relative;
  }

  .cell-text-value {
    display: block;
    padding-right: 16px;
    /* reserve space for right-arrow */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .cell-fk-btn {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    padding: 0;
    width: 12px;
    height: 12px;
    line-height: 12px;
    font-size: 11px;
    border: none;
    background: none;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    opacity: 1.0;
  }

  .cell-fk-btn:hover {
    color: var(--el-text-color-primary);
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
    // background-color: var(--el-bg-color-overlay) !important;
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
    height: 32px !important;
    font-size: 12px;
  }
}
</style>
