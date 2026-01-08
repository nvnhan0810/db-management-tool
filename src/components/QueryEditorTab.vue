<template>
  <div class="query-editor-tab">
    <div class="query-editor-header">
      <div class="editor-toolbar">
        <el-button type="primary" size="small" @click="runQuery" :loading="isRunning">
          <el-icon><VideoPlay /></el-icon>
          Run
        </el-button>
        <el-button type="success" size="small" @click="runCurrentQuery" :loading="isRunning" :disabled="!hasSelection">
          <el-icon><CaretRight /></el-icon>
          Run Current
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
              @current-change="handlePageChange"
              small
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
  await executeQuery(queryToRun, 1, perPage.value);
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
  await executeQuery(selectedQuery, 1, perPage.value);
};

const handlePageChange = async (page: number) => {
  const queryToRun = query.value.trim();
  if (queryToRun) {
    await executeQuery(queryToRun, page, perPage.value);
  }
};

const handlePerPageChange = async (newPerPage: number) => {
  perPage.value = newPerPage;
  const queryToRun = query.value.trim();
  if (queryToRun) {
    await executeQuery(queryToRun, 1, newPerPage);
  }
};

const executeQuery = async (sql: string, page: number = 1, limit: number = 50) => {
  isRunning.value = true;
  error.value = null;
  result.value = null;
  currentPage.value = page;

  try {
    const startTime = Date.now();

    // Check if query is a SELECT statement
    const trimmedSql = sql.trim().toUpperCase();
    const isSelectQuery = trimmedSql.startsWith('SELECT');

    let finalQuery = sql;
    let countQuery = '';

    if (isSelectQuery) {
      // Try to extract the base query for counting
      // Remove ORDER BY, LIMIT, OFFSET clauses for count query
      const baseQuery = sql.replace(/ORDER\s+BY\s+[^;]+/gi, '')
                           .replace(/LIMIT\s+\d+/gi, '')
                           .replace(/OFFSET\s+\d+/gi, '')
                           .trim();

      // Build count query
      countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as subquery`;

      // Build paginated query
      const offset = (page - 1) * limit;
      if (props.dbType === 'postgresql') {
        finalQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
      } else if (props.dbType === 'mysql') {
        finalQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
      } else {
        // SQLite
        finalQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
      }
    }

    // Execute count query first if it's a SELECT
    if (isSelectQuery && countQuery) {
      try {
        const countResult = await window.electron?.invoke('database:query', {
          connectionId: props.connectionId,
          query: countQuery
        });

        if (countResult?.success && countResult.data?.[0]?.total !== undefined) {
          totalRows.value = parseInt(String(countResult.data[0].total), 10);
        }
      } catch (countErr) {
        console.warn('Failed to get count, continuing without pagination info:', countErr);
        totalRows.value = 0;
      }
    }

    // Execute main query
    const queryResult = await window.electron?.invoke('database:query', {
      connectionId: props.connectionId,
      query: finalQuery
    });

    const executionTime = Date.now() - startTime;

    if (queryResult?.success) {
      result.value = {
        rows: Array.isArray(queryResult.data) ? queryResult.data : [],
        total: totalRows.value,
        executionTime
      };
    } else {
      error.value = queryResult?.error || 'Query execution failed';
    }
  } catch (err) {
    console.error('Query execution error:', err);
    error.value = err instanceof Error ? err.message : 'Failed to execute query';
  } finally {
    isRunning.value = false;
  }
};

const clearEditor = () => {
  query.value = '';
  error.value = null;
  result.value = null;
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
    background-color: rgba(26, 32, 44, 0.8);
    border-bottom-color: rgba(74, 85, 104, 0.5);
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
        background-color: rgba(26, 32, 44, 0.8);
        color: #e2e8f0;
        border-color: rgba(74, 85, 104, 0.6);
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
    background-color: rgba(26, 32, 44, 0.8);
    border-color: rgba(74, 85, 104, 0.5);
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
      background-color: rgba(45, 55, 72, 0.6);
      border-bottom-color: rgba(74, 85, 104, 0.5);
    }

    .result-info {
      font-size: 14px;
      color: var(--el-text-color-regular);

      .dark & {
        color: #cbd5e0;
      }

      strong {
        color: var(--el-color-primary);

        .dark & {
          color: #66b1ff;
        }
      }

      .execution-time {
        margin-left: 8px;
        font-size: 12px;
        color: var(--el-text-color-secondary);

        .dark & {
          color: #a0aec0;
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
            background-color: rgba(26, 32, 44, 0.8) !important;
            border-color: rgba(74, 85, 104, 0.6) !important;
          }

          .el-input__inner {
            .dark & {
              color: #e2e8f0 !important;
            }
          }
        }
      }

      :deep(.el-pagination) {
        .el-pager li {
          .dark & {
            background-color: rgba(45, 55, 72, 0.8);
            color: #e2e8f0;
            border-color: rgba(74, 85, 104, 0.6);

            &.is-active {
              background-color: #409eff;
              color: #ffffff;
            }
          }
        }

        .btn-prev,
        .btn-next {
          .dark & {
            background-color: rgba(45, 55, 72, 0.8);
            color: #e2e8f0;
            border-color: rgba(74, 85, 104, 0.6);
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
        color: #e2e8f0;
      }

      .el-table__header {
        background-color: var(--el-fill-color-lighter);

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
