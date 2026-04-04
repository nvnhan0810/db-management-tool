<template>
  <div class="query-editor-tab">
    <div class="query-editor-header">
      <div class="editor-toolbar">
        <el-button type="primary" size="small" @click="runQuery" :loading="isRunning">
          <el-icon><VideoPlay /></el-icon>
          Run all
        </el-button>
        <el-button type="success" size="small" @click="runCurrentQuery" :loading="isRunning" :disabled="!hasSelection">
          <el-icon><CaretRight /></el-icon>
          Run selection
        </el-button>
        <el-button size="small" @click="clearEditor">
          <el-icon><Delete /></el-icon>
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

      <div v-if="isRunning" class="loading-section">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="error" class="error-section">
        <el-alert
          :title="error"
          type="error"
          :closable="false"
          show-icon
        />
      </div>

      <div v-else-if="result" class="result-section">
        <div class="result-header">
          <span class="result-info">
            <strong>{{ result.total !== undefined ? result.total : result.rows?.length || 0 }}</strong> row(s) total
            <span v-if="result.rows?.length !== undefined && result.total !== undefined && result.total > result.rows.length">
              (showing {{ result.rows.length }} of {{ result.total }})
            </span>
            <span v-else-if="result.rows?.length">
              (showing {{ result.rows.length }})
            </span>
            <span v-if="result.executionTime !== undefined" class="execution-time">
              ({{ result.executionTime }}ms)
            </span>
          </span>
          <div v-if="result.total !== undefined && result.total > perPage" class="pagination-controls">
            <el-select v-model="perPage" @change="handlePerPageChange" style="width: 100px; margin-right: 10px;">
              <el-option label="25" :value="25" />
              <el-option label="50" :value="50" />
              <el-option label="100" :value="100" />
              <el-option label="200" :value="200" />
            </el-select>
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="perPage"
              :total="result.total"
              layout="prev, pager, next"
              size="small"
              @current-change="handlePageChange"
            />
          </div>
        </div>
        <div class="result-content">
          <el-table
            v-if="result.rows && result.rows.length > 0"
            :data="result.rows"
            border
            style="width: 100%"
            max-height="400"
            stripe
          >
            <el-table-column
              v-for="column in getResultColumns(result.rows)"
              :key="column"
              :prop="column"
              :label="column"
              min-width="120"
              show-overflow-tooltip
            />
          </el-table>
          <div v-else class="no-result">
            <el-empty description="Query executed successfully but returned no rows" :image-size="80" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CaretRight, Delete, VideoPlay } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';

interface Props {
  connectionId?: string;
  dbType?: string;
}

interface QueryResult {
  rows: any[];
  total?: number;
  executionTime?: number;
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

const getResultColumns = (rows: any[]): string[] => {
  if (!rows || rows.length === 0) return [];
  return Object.keys(rows[0]);
};

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
  return { rows: state.rows, total: state.total, executionTime };
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
    gap: 8px;
  }
}

.query-editor-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  gap: 16px;
}

.editor-section {
  flex-shrink: 0;

  .query-input {
    :deep(.el-textarea__inner) {
      font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;

      .dark & {
        background-color: var(--el-bg-color-overlay);
        color: var(--el-text-color-primary);
        border-color: var(--el-border-color);
      }
    }
  }
}

.loading-section {
  flex: 1;
  padding: 20px;
}

.error-section {
  flex-shrink: 0;
}

.result-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--el-bg-color-page);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-light);

  .dark & {
    background-color: var(--el-bg-color-overlay);
    border-color: var(--el-border-color-light);
  }

  .result-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--el-border-color-light);
    background-color: var(--el-fill-color-lighter);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;

    .dark & {
      background-color: var(--el-fill-color-light);
      border-bottom-color: var(--el-border-color-light);
    }

    .result-info {
      font-size: 14px;
      color: var(--el-text-color-regular);

      .dark & {
        color: var(--el-text-color-regular);
      }

      strong {
        color: var(--el-color-primary);

        .dark & {
          color: var(--el-color-primary-light-3);
        }
      }

      .execution-time {
        margin-left: 8px;
        font-size: 12px;
        color: var(--el-text-color-secondary);

        .dark & {
          color: var(--el-text-color-secondary);
        }
      }
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 8px;

      :deep(.el-select) {
        .el-input__wrapper {
          .dark & {
            background-color: var(--el-bg-color-overlay) !important;
            border-color: var(--el-border-color) !important;
          }

          .el-input__inner {
            .dark & {
              color: var(--el-text-color-primary) !important;
            }
          }
        }
      }

      :deep(.el-pagination) {
        .el-pager li {
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
          .dark & {
            background-color: var(--el-fill-color);
            color: var(--el-text-color-primary);
            border-color: var(--el-border-color);
          }
        }
      }
    }
  }

  .result-content {
    flex: 1;
    overflow: auto;
    padding: 16px;

    :deep(.el-table) {
      background-color: transparent;

      .dark & {
        background-color: transparent;
        color: var(--el-text-color-primary);
      }

      .el-table__header {
        background-color: var(--el-fill-color-lighter);

        .dark & {
          background-color: var(--el-fill-color);
          color: var(--el-text-color-primary);
        }

        th {
          .dark & {
            background-color: var(--el-fill-color) !important;
            color: var(--el-text-color-primary) !important;
            border-bottom-color: var(--el-border-color) !important;
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
            background-color: var(--el-fill-color-light);

            .dark & {
              background-color: var(--el-fill-color-light) !important;
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
              background-color: transparent !important;
              color: var(--el-text-color-primary) !important;
              border-bottom-color: var(--el-border-color-lighter) !important;
            }
          }
        }
      }
    }
  }

  .no-result {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    padding: 40px;
  }
}
</style>
