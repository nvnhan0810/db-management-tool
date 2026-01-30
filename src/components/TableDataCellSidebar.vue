<template>
  <div class="cell-detail-sidebar" :class="{ 'sidebar-visible': visible }">
    <div class="sidebar-header">
      <h3>Cell / Row</h3>
      <div class="header-actions">
        <el-button
          v-if="selectedRow && !isDeleted"
          type="danger"
          size="small"
          @click="$emit('mark-deleted')"
        >
          Mark deleted
        </el-button>
        <el-button
          v-if="selectedRow && isDeleted"
          size="small"
          @click="$emit('unmark-deleted')"
        >
          Undo delete
        </el-button>
        <el-button size="small" class="close-btn" @click="$emit('close')">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>
    <div class="sidebar-content">
      <div v-if="selectedRow" class="row-details">
        <div
          v-for="(value, key) in displayRow"
          :key="key"
          class="detail-item"
          :class="{ 'is-selected-cell': selectedColumn === key, 'is-modified': isFieldModified(key) }"
        >
          <div class="detail-label">
            {{ key }}
            <el-tag v-if="isFieldModified(key)" type="warning" size="small">modified</el-tag>
          </div>
          <div class="detail-value">
            <el-select
              v-if="isEnumColumn(key)"
              :model-value="formatValue(value)"
              clearable
              placeholder="NULL or value..."
              class="editable-select"
              @update:model-value="(v: string | null) => updateField(key, v ?? '')"
            >
              <el-option
                v-for="opt in getEnumValues(key)"
                :key="opt"
                :label="opt"
                :value="opt"
              />
            </el-select>
            <div
              v-else
              :ref="(el) => setCellRef(key, el as HTMLDivElement)"
              class="editable-div"
              contenteditable="true"
              data-placeholder="NULL or value..."
              @input="(e: Event) => onCellInput(e, key)"
              @paste="onPaste"
            />
          </div>
        </div>
        <div v-if="isDeleted" class="row-status deleted">
          <el-icon><Delete /></el-icon>
          Row marked for delete (Ctrl+S to apply)
        </div>
        <div v-else-if="hasModifications" class="row-status modified">
          <el-icon><Edit /></el-icon>
          Modified (Ctrl+S to apply)
        </div>
      </div>
      <div v-else class="no-selection">
        <el-empty description="Click a cell to view details" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, Delete, Edit } from '@element-plus/icons-vue';
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    visible: boolean;
    selectedRow: Record<string, unknown> | null;
    selectedColumn: string | null;
    modifiedFields: Record<string, unknown>;
    isDeleted: boolean;
    /** Column name -> DB type (e.g. 'text', 'integer'). Used to show textarea for text types. */
    columnTypes?: Record<string, string>;
  }>(),
  {
    selectedColumn: null,
    modifiedFields: () => ({}),
    isDeleted: false,
    columnTypes: () => ({}),
  }
);

/** True if column type is text-like → use textarea. */
function isTextColumn(columnName: string): boolean {
  const t = props.columnTypes?.[columnName]?.toLowerCase() ?? '';
  return /^(text|varchar|character varying|string|nvarchar|longtext|mediumtext|clob)$/.test(t) || t.includes('text') || t.includes('varchar');
}

/** True if column type is enum. */
function isEnumColumn(columnName: string): boolean {
  const t = props.columnTypes?.[columnName] ?? '';
  return /^enum\s*\(/i.test(t);
}

/** Parse enum values from type string, e.g. enum('a','b','c') → ['a','b','c']. */
function getEnumValues(columnName: string): string[] {
  const t = props.columnTypes?.[columnName] ?? '';
  const match = t.match(/^enum\s*\(\s*([^)]+)\s*\)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const emit = defineEmits<{
  close: [];
  'update-field': [field: string, value: unknown];
  'mark-deleted': [];
  'unmark-deleted': [];
}>();

const displayRow = computed(() => {
  if (!props.selectedRow) return {};
  return { ...props.selectedRow, ...props.modifiedFields };
});

const cellRefs = ref<Record<string, HTMLDivElement>>({});

function setCellRef(key: string, el: HTMLDivElement | null) {
  if (el) {
    cellRefs.value[key] = el;
    el.textContent = formatValue(displayRow.value[key]);
  } else {
    delete cellRefs.value[key];
  }
}

watch(
  displayRow,
  (row) => {
    for (const key of Object.keys(cellRefs.value)) {
      const div = cellRefs.value[key];
      if (!div || div.contains(document.activeElement)) continue;
      const val = row[key];
      div.textContent = formatValue(val);
    }
  },
  { deep: true }
);

function onCellInput(e: Event, field: string) {
  const el = e.target as HTMLDivElement;
  const text = el?.textContent ?? '';
  updateField(field, text);
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain') ?? '';
  document.execCommand('insertText', false, text);
}

const hasModifications = computed(
  () => Object.keys(props.modifiedFields).length > 0
);

function isFieldModified(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(props.modifiedFields, key);
}

/** Format value for display: datetime as Y-m-d H:i:s. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?$/.test(s)) return s.replace(/\s+/g, ' ').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + ' 00:00:00';
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?(?:Z)?$/i);
    if (iso) {
      const [, date, h, m, sec] = iso;
      const pad = (n: string) => n.padStart(2, '0');
      return `${date} ${pad(h)}:${pad(m)}:${pad(sec ?? '0')}`;
    }
    // Only parse as date if it looks like an ISO or date string, not a plain number string
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
      }
    }
    return s;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Only treat as timestamp: seconds (10 digits) or milliseconds (13 digits), not IDs/counts/years
    const asMs = value > 1e12 ? value : value > 1e9 && value < 1e11 ? value * 1000 : NaN;
    if (!Number.isNaN(asMs)) {
      const d = new Date(asMs);
      if (!Number.isNaN(d.getTime())) return formatValue(d);
    }
    return String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function updateField(field: string, newValue: string) {
  const v = newValue.trim() === '' || newValue.toUpperCase() === 'NULL' ? null : newValue;
  emit('update-field', field, v);
}
</script>

<style scoped lang="scss">
.cell-detail-sidebar {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color-page);
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.row-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid transparent;

  &.is-selected-cell {
    border-color: var(--el-color-primary-light-5);
    background-color: var(--el-color-primary-light-9);
  }

  &.is-modified {
    background-color: rgba(230, 162, 60, 0.12);
    border-color: rgba(230, 162, 60, 0.4);
  }
}

.detail-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-value {
  min-height: 36px;
  min-width: 0; /* allow shrink so editable-div doesn't overflow */
}

.editable-select {
  width: 100%;
}

/* Editable div: 1 line default, wrap when long, style like el-input default */
.editable-div {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 32px;
  padding: 5px 11px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-input-border-radius, 4px);
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
  overflow: visible;
  font-size: 14px;
  line-height: 1.5;
  /* Same as el-input: bg and text color for contrast */
  color: var(--el-text-color-primary);
  background-color: var(--el-bg-color);
  font-family: inherit;

  &:focus {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 1px var(--el-color-primary);
  }

  &:empty::before {
    content: attr(data-placeholder);
    color: var(--el-text-color-placeholder);
  }
}

.row-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
  margin-top: 8px;

  &.modified {
    background-color: rgba(230, 162, 60, 0.15);
    color: #b8860b;
  }

  &.deleted {
    background-color: rgba(245, 108, 108, 0.15);
    color: var(--el-color-danger);
  }
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
</style>
