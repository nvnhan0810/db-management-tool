<template>
  <div class="query-editor-tab">
    <div class="query-editor-header">
      <div class="editor-toolbar">
        <el-button-group class="toolbar-run-group">
          <el-button
            type="primary"
            size="small"
            :loading="isRunning"
            title="Run all statements in the editor (⌘ Enter / Ctrl+Enter)"
            @click="runQuery"
          >
            <el-icon class="toolbar-btn-icon"><VideoPlay /></el-icon>
            Run
          </el-button>
          <el-button
            type="primary"
            plain
            size="small"
            :loading="isRunning"
            :disabled="!hasSelection"
            title="Run only the highlighted SQL"
            @click="runCurrentQuery"
          >
            <el-icon class="toolbar-btn-icon"><Aim /></el-icon>
            Selection
          </el-button>
        </el-button-group>
        <el-button
          class="toolbar-clear-btn"
          text
          size="small"
          title="Clear editor and results"
          @click="clearEditor"
        >
          <el-icon class="toolbar-btn-icon"><Delete /></el-icon>
          Clear
        </el-button>
      </div>
    </div>

    <div class="query-editor-content">
      <div class="editor-section">
        <el-input
          v-model="query"
          type="textarea"
          :rows="12"
          placeholder="Enter your SQL query here..."
          class="query-input"
          @keydown.ctrl.enter="runQuery"
          @keydown.meta.enter="runQuery"
          @mouseup="updateSelection"
          @keyup="updateSelection"
        />
      </div>

      <div v-if="isRunning" class="loading-data">
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

      <div v-else-if="result" class="query-result-pane data-view">
        <template v-if="result.successWithoutResultSet">
          <div class="mutation-success-wrap">
            <span class="mutation-success-text">Execute SQL successfully</span>
          </div>
          <div class="query-result-footer tab-footer mutation-footer">
            <div class="footer-left">
              <span v-if="result.executionTime !== undefined" class="execution-time-chip">
                {{ result.executionTime }} ms
              </span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="data-content-wrapper">
            <div class="data-content">
              <el-table
                v-if="resultRows.length > 0"
                size="small"
                :data="result.rows"
                border
                style="width: 100%"
                height="100%"
              >
                <el-table-column
                  v-for="column in getResultColumns(result.rows)"
                  :key="column"
                  :prop="column"
                  :label="column"
                  min-width="100"
                  resizable
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <span class="cell-text">
                      <span class="cell-text-value">
                        {{ formatCellValue(row[column]) || '\u00A0' }}
                      </span>
                    </span>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else class="no-data">
                <el-empty description="Query executed successfully but returned no rows" :image-size="72" />
              </div>
            </div>
          </div>
          <div class="query-result-footer tab-footer">
            <div class="footer-left">
              <span v-if="result.executionTime !== undefined" class="execution-time-chip">
                {{ result.executionTime }} ms
              </span>
              <span v-if="resultShowingSlice" class="showing-slice">
                Showing {{ result.rows.length }} of {{ resultTotalDisplay.toLocaleString() }}
              </span>
            </div>
            <div class="footer-right">
              <span class="total-records">
                Total: {{ resultTotalDisplay.toLocaleString() }} records
              </span>
              <template v-if="showResultPagination">
                <el-select
                  v-model="perPage"
                  size="small"
                  style="width: 60px; margin: 0 10px;"
                  @change="handlePerPageChange"
                >
                  <el-option label="25" :value="25" />
                  <el-option label="50" :value="50" />
                  <el-option label="100" :value="100" />
                  <el-option label="200" :value="200" />
                </el-select>
                <el-pagination
                  v-model:current-page="currentPage"
                  :page-size="perPage"
                  :total="Number(result.total)"
                  layout="prev, pager, next"
                  size="small"
                  @current-change="handlePageChange"
                />
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Aim, Delete, VideoPlay } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';

interface Props {
  connectionId?: string;
  dbType?: string;
}

interface QueryResult {
  rows: any[];
  total?: number;
  executionTime?: number;
  /** INSERT/UPDATE/DELETE (no row grid): show success message only. */
  successWithoutResultSet?: boolean;
}

/** Shape returned by main process `database:query` IPC. */
interface DatabaseQueryResponse {
  success: boolean;
  data?: unknown[];
  error?: string;
}

const props = withDefaults(defineProps<Props>(), {
  connectionId: undefined,
  dbType: 'postgresql',
});

const query = ref('');
const isRunning = ref(false);
const error = ref<string | null>(null);
const result = ref<QueryResult | null>(null);
const selectedText = ref('');
const currentPage = ref(1);
const perPage = ref(50);
const totalRows = ref(0);
/** Last SELECT in the batch (single statement) used for LIMIT/OFFSET pagination. */
const paginationSourceSql = ref<string | null>(null);

const hasSelection = computed(() => {
  return selectedText.value.trim().length > 0;
});

const resultRows = computed(() => result.value?.rows ?? []);

const resultTotalDisplay = computed(() => {
  const r = result.value;
  if (!r) return 0;
  return r.total !== undefined ? r.total : (r.rows?.length ?? 0);
});

const showResultPagination = computed(() => {
  const r = result.value;
  if (!r || r.total === undefined) return false;
  return r.total > perPage.value;
});

const resultShowingSlice = computed(() => {
  const r = result.value;
  if (!r || r.total === undefined || !r.rows) return false;
  return r.total > r.rows.length;
});

const getResultColumns = (rows: any[]): string[] => {
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]);
};

/** Align with TableDataView cell display (dates, null → empty + nbsp in template). */
function formatCellValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?(\.\d+)?$/.test(s)) {
      return s.replace(/\s+/g, ' ').slice(0, 19);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
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
    const asMs = value > 1e12 ? value : value > 1e9 && value < 1e11 ? value * 1000 : NaN;
    if (!Number.isNaN(asMs)) {
      const d = new Date(asMs);
      if (!Number.isNaN(d.getTime())) return formatCellValue(d);
    }
    return String(value);
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

const getSelectedQuery = (): string => {
  return selectedText.value;
};

/** Strip trailing semicolons so appended LIMIT/OFFSET and subquery wrappers stay valid SQL. */
function stripTrailingStatementTerminators(sql: string): string {
  let s = sql.trimEnd();
  while (s.endsWith(';')) {
    s = s.slice(0, -1).trimEnd();
  }
  return s.trim();
}

/**
 * Split script into statements on `;` outside of single- and double-quoted strings.
 * (Does not handle PostgreSQL dollar-quoted strings.)
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (!inDouble && c === "'" && !inSingle) {
      inSingle = true;
      current += c;
    } else if (inSingle && c === "'") {
      if (next === "'") {
        current += "''";
        i++;
      } else {
        inSingle = false;
        current += c;
      }
    } else if (!inSingle && c === '"' && !inDouble) {
      inDouble = true;
      current += c;
    } else if (inDouble && c === '"') {
      if (next === '"') {
        current += '""';
        i++;
      } else {
        inDouble = false;
        current += c;
      }
    } else if (!inSingle && !inDouble && c === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
    } else {
      current += c;
    }
  }

  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

function isPaginatedSelectSql(sql: string): boolean {
  const u = sql.trim().toUpperCase();
  return u.startsWith('SELECT') || u.startsWith('WITH');
}

function queryResultWithExecutionTime(state: QueryResult, executionTime: number): QueryResult {
  return {
    rows: state.rows,
    total: state.total,
    executionTime,
    successWithoutResultSet: state.successWithoutResultSet,
  };
}

const updateSelection = () => {
  // Use nextTick to ensure DOM is updated
  setTimeout(() => {
    const textarea = document.querySelector('.query-input textarea') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) {
        selectedText.value = query.value.substring(start, end);
      } else {
        selectedText.value = '';
      }
    }
  }, 0);
};

const runQuery = async () => {
  if (!props.connectionId) {
    error.value = 'No connection available';
    return;
  }

  const queryToRun = query.value.trim();
  if (!queryToRun) {
    error.value = 'Please enter a SQL query';
    return;
  }

  // Reset to first page when running new query
  currentPage.value = 1;
  await executeSqlInput(queryToRun, 1, perPage.value);
};

const runCurrentQuery = async () => {
  if (!props.connectionId) {
    error.value = 'No connection available';
    return;
  }

  const selectedQuery = getSelectedQuery();
  if (!selectedQuery.trim()) {
    error.value = 'Please select a query to run';
    return;
  }

  // Reset to first page when running selected query
  currentPage.value = 1;
  await executeSqlInput(selectedQuery, 1, perPage.value);
};

const handlePageChange = async (page: number) => {
  if (!props.connectionId) return;
  currentPage.value = page;

  if (paginationSourceSql.value) {
    isRunning.value = true;
    error.value = null;
    try {
      const r = await runPaginatedSelectStatement(paginationSourceSql.value, page, perPage.value);
      if (!r.success) {
        error.value = r.error ?? 'Query execution failed';
        result.value = null;
      }
    } catch (err) {
      console.error('Query execution error:', err);
      error.value = err instanceof Error ? err.message : 'Failed to execute query';
    } finally {
      isRunning.value = false;
    }
    return;
  }

  const queryToRun = query.value.trim();
  if (queryToRun) {
    await executeSqlInput(queryToRun, page, perPage.value);
  }
};

const handlePerPageChange = async (newPerPage: number) => {
  if (!props.connectionId) return;
  perPage.value = newPerPage;
  currentPage.value = 1;

  if (paginationSourceSql.value) {
    isRunning.value = true;
    error.value = null;
    try {
      const r = await runPaginatedSelectStatement(paginationSourceSql.value, 1, newPerPage);
      if (!r.success) {
        error.value = r.error ?? 'Query execution failed';
        result.value = null;
      }
    } catch (err) {
      console.error('Query execution error:', err);
      error.value = err instanceof Error ? err.message : 'Failed to execute query';
    } finally {
      isRunning.value = false;
    }
    return;
  }

  const queryToRun = query.value.trim();
  if (queryToRun) {
    await executeSqlInput(queryToRun, 1, newPerPage);
  }
};

async function runPaginatedSelectStatement(
  sql: string,
  page: number,
  limit: number
): Promise<{ success: boolean; error?: string; executionTime: number }> {
  const startTime = Date.now();
  const baseQuery = stripTrailingStatementTerminators(
    sql
      .replace(/ORDER\s+BY\s+[^;]+/gi, '')
      .replace(/LIMIT\s+\d+/gi, '')
      .replace(/OFFSET\s+\d+/gi, '')
      .trim()
  );

  const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as subquery`;
  const offset = (page - 1) * limit;
  const finalQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;

  try {
    try {
      const countResult = (await window.electron?.invoke('database:query', {
        connectionId: props.connectionId,
        query: countQuery,
      })) as DatabaseQueryResponse | undefined;
      const countRow = countResult?.data?.[0] as { total?: unknown } | undefined;
      if (countResult?.success && countRow && countRow.total !== undefined) {
        totalRows.value = parseInt(String(countRow.total), 10);
      } else {
        totalRows.value = 0;
      }
    } catch (countErr) {
      console.warn('Failed to get count, continuing without pagination info:', countErr);
      totalRows.value = 0;
    }

    const queryResult = (await window.electron?.invoke('database:query', {
      connectionId: props.connectionId,
      query: finalQuery,
    })) as DatabaseQueryResponse | undefined;
    const executionTime = Date.now() - startTime;

    if (queryResult?.success) {
      result.value = {
        rows: Array.isArray(queryResult.data) ? queryResult.data : [],
        total: totalRows.value,
        executionTime,
        successWithoutResultSet: false,
      };
      return { success: true, executionTime };
    }
    return {
      success: false,
      error: queryResult?.error || 'Query execution failed',
      executionTime,
    };
  } catch (err) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to execute query',
      executionTime,
    };
  }
}

async function runNonSelectStatement(
  sql: string
): Promise<{ success: boolean; error?: string; executionTime: number }> {
  const stmt = stripTrailingStatementTerminators(sql.trim());
  const startTime = Date.now();
  try {
    const queryResult = (await window.electron?.invoke('database:query', {
      connectionId: props.connectionId,
      query: stmt,
    })) as DatabaseQueryResponse | undefined;
    const executionTime = Date.now() - startTime;
    if (queryResult?.success) {
      const rows = Array.isArray(queryResult.data) ? queryResult.data : [];
      result.value = {
        rows,
        total: undefined,
        executionTime,
        successWithoutResultSet: rows.length === 0,
      };
      return { success: true, executionTime };
    }
    return {
      success: false,
      error: queryResult?.error || 'Query execution failed',
      executionTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to execute query',
      executionTime: Date.now() - startTime,
    };
  }
}

/** Split input into statements, run each in order; last statement drives the result panel. */
const executeSqlInput = async (rawSql: string, page: number = 1, limit: number = 50) => {
  if (!props.connectionId) {
    error.value = 'No connection available';
    return;
  }

  isRunning.value = true;
  error.value = null;
  result.value = null;
  paginationSourceSql.value = null;
  currentPage.value = page;

  const statements = splitSqlStatements(rawSql)
    .map((s) => stripTrailingStatementTerminators(s.trim()))
    .filter((s) => s.length > 0);

  if (statements.length === 0) {
    error.value = 'Please enter a SQL query';
    isRunning.value = false;
    return;
  }

  try {
    let batchExecutionTime = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const isLast = i === statements.length - 1;
      const pageForStmt = isLast ? page : 1;

      if (isPaginatedSelectSql(stmt)) {
        const r = await runPaginatedSelectStatement(stmt, pageForStmt, limit);
        batchExecutionTime += r.executionTime;
        if (!r.success) {
          error.value = r.error ?? 'Query execution failed';
          result.value = null;
          paginationSourceSql.value = null;
          return;
        }
        if (isLast) {
          paginationSourceSql.value = stmt;
          if (result.value) {
            result.value = queryResultWithExecutionTime(result.value, batchExecutionTime);
          }
        }
      } else {
        const r = await runNonSelectStatement(stmt);
        batchExecutionTime += r.executionTime;
        if (!r.success) {
          error.value = r.error ?? 'Query execution failed';
          result.value = null;
          paginationSourceSql.value = null;
          return;
        }
        if (isLast) {
          paginationSourceSql.value = null;
          if (result.value) {
            result.value = queryResultWithExecutionTime(result.value, batchExecutionTime);
          }
        }
      }
    }
  } catch (err) {
    console.error('Query execution error:', err);
    error.value = err instanceof Error ? err.message : 'Failed to execute query';
    paginationSourceSql.value = null;
  } finally {
    isRunning.value = false;
  }
};

const clearEditor = () => {
  query.value = '';
  error.value = null;
  result.value = null;
  paginationSourceSql.value = null;
};

</script>

<style scoped lang="scss">
.query-editor-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--el-bg-color);
}

.query-editor-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-page);

  .dark & {
    background-color: var(--el-bg-color-overlay);
    border-bottom-color: var(--el-border-color-light);
  }

  .editor-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 14px;
  }

  .toolbar-run-group {
    display: inline-flex;

    :deep(.el-button--primary.is-plain) {
      --el-button-hover-text-color: var(--el-color-primary);
      --el-button-hover-bg-color: var(--el-color-primary-light-9);
    }

    /* Separator between Run (solid) and Selection (plain) — group default removes inner borders */
    :deep(> .el-button + .el-button) {
      margin-left: 0;
      border-left: 1px solid var(--el-color-primary-light-3);
    }

    :deep(> .el-button + .el-button.is-plain) {
      border-left-color: var(--el-color-primary-light-5);
    }

    .dark & {
      :deep(> .el-button + .el-button) {
        border-left-color: rgba(255, 255, 255, 0.28);
      }

      :deep(> .el-button + .el-button.is-plain) {
        border-left-color: var(--el-color-primary-light-3);
      }
    }
  }

  .toolbar-btn-icon {
    margin-right: 4px;
    font-size: 15px;
    vertical-align: middle;
  }

  .toolbar-clear-btn {
    color: var(--el-text-color-regular);

    &:hover {
      color: var(--el-color-danger);
    }

    .dark & {
      color: var(--el-text-color-secondary);

      &:hover {
        color: var(--el-color-danger-light-3);
      }
    }
  }
}

.query-editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-section {
  flex-shrink: 0;
  border-bottom: 1px solid var(--el-border-color-light);

  .query-input {
    :deep(.el-textarea__inner) {
      font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
      border: none;
      box-shadow: none;

      &:focus {
        border: none;
        box-shadow: none;
      }

      .dark & {
        background-color: var(--el-bg-color-overlay);
        color: var(--el-text-color-primary);
        border: none;
        box-shadow: none;
        border-radius: 0;
      }
    }
  }
}

.loading-data {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
}

.error-message {
  flex-shrink: 0;
  padding: 12px 16px;

  :deep(.el-alert) {
    padding: 8px 12px;
  }

  :deep(.el-alert__title) {
    font-size: 13px;
    line-height: 1.4;
  }
}

/* Match TableDataView + TableViewFooter layout */
.query-result-pane.data-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.mutation-success-wrap {
  flex: 1;
  min-height: 0;
  padding: 12px 16px;
}

.mutation-success-text {
  font-size: 14px;
  color: var(--el-color-success);
  line-height: 1.5;
}

.query-result-footer.mutation-footer {
  justify-content: flex-start;
}

.data-content-wrapper {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.query-result-pane .data-content {
  flex: 1;
  min-width: 0;
  background-color: var(--el-bg-color-page);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

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
          &.row-selected > td {
            background-color: rgba(0, 128, 255, 0.4) !important;
          }
          &.row-deleted > td {
            background-color: rgba(245, 108, 108, 0.2) !important;
          }
          &.row-new > td {
            background-color: rgba(103, 194, 58, 0.12) !important;
          }
          &.row-modified > td {
            background-color: rgba(230, 162, 60, 0.25) !important;
          }
          > td {
            background-color: rgba(0, 128, 255, 0.4) !important;
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

  .cell-text {
    display: block;
    min-height: 1em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    position: relative;
  }

  .cell-text-value {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 40px;
}

.query-result-footer.tab-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding: 16px 16px 16px 16px;
  margin-top: 0;
  margin-bottom: 0;
  border-top: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-page);
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);

  .dark & {
    background-color: var(--el-bg-color-overlay);
    border-top-color: var(--el-border-color);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .execution-time-chip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    padding: 4px 10px;
    border-radius: 6px;
    background-color: var(--el-fill-color-lighter);

    .dark & {
      background-color: var(--el-fill-color);
      color: var(--el-text-color-regular);
    }
  }

  .showing-slice {
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .total-records {
    font-size: 14px;
    color: var(--el-text-color-regular);
    font-weight: 500;
    padding: 6px 12px;
    background-color: var(--el-fill-color-lighter);
    border-radius: 6px;

    .dark & {
      background-color: var(--el-fill-color);
      color: var(--el-text-color-regular);
      border: 1px solid var(--el-border-color-light);
    }
  }

  :deep(.el-select) {
    .el-input__inner {
      border-radius: 6px;
    }

    .dark & {
      .el-input__wrapper {
        background-color: var(--el-bg-color-overlay) !important;
        border-color: var(--el-border-color) !important;
      }

      .el-input__inner {
        color: var(--el-text-color-primary) !important;
      }
    }
  }

  :deep(.el-pagination) {
    .el-pager li {
      border-radius: 4px;
      margin: 0 2px;

      .dark & {
        background-color: var(--el-fill-color);
        color: var(--el-text-color-primary);
        border-color: var(--el-border-color);

        &.is-active {
          background-color: var(--el-color-primary);
          color: var(--el-color-white);
        }
      }
    }

    .btn-prev,
    .btn-next {
      border-radius: 4px;

      .dark & {
        background-color: var(--el-fill-color);
        color: var(--el-text-color-primary);
        border-color: var(--el-border-color);
      }
    }
  }
}
</style>
