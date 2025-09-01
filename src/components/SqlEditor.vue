<template>
  <div class="sql-editor">
    <!-- SQL Editor Section -->
    <div class="editor-section">
      <div class="editor-header">
        <h3>SQL Editor</h3>
        <div class="editor-actions">
          <el-button 
            size="small" 
            type="primary" 
            @click="executeSelectedQuery"
            :disabled="!hasSelection"
          >
            Run Selected
          </el-button>
          <el-button 
            size="small" 
            type="success" 
            @click="executeAllQueries"
          >
            Run All
          </el-button>
          <el-button 
            size="small" 
            @click="clearEditor"
          >
            Clear
          </el-button>
        </div>
      </div>
      
      <div class="editor-content">
        <el-input
          v-model="sqlQuery"
          type="textarea"
          :rows="12"
          placeholder="Enter your SQL queries here...&#10;You can select specific text to run only that part, or run all queries at once."
          resize="none"
          @select="handleTextSelection"
          ref="editorRef"
        />
      </div>
    </div>

    <!-- Results Section -->
    <div class="results-section" v-if="queryResult">
      <div class="results-header">
        <h3>Query Results</h3>
        <div class="result-info">
          <span v-if="queryResult.executionTime" class="execution-time">
            Execution time: {{ queryResult.executionTime }}ms
          </span>
          <span v-if="queryResult.rowCount !== undefined" class="row-count">
            Rows: {{ queryResult.rowCount }}
          </span>
        </div>
      </div>
      
      <div class="results-content">
        <!-- Success Results -->
        <div v-if="queryResult.success" class="success-results">
          <!-- Data Table -->
          <div v-if="queryResult.data && queryResult.data.length > 0" class="data-table">
            <el-table
              :data="queryResult.data"
              style="width: 100%"
              height="400"
              border
              stripe
            >
              <el-table-column
                v-for="field in queryResult.fields"
                :key="field.name"
                :prop="field.name"
                :label="field.name"
                show-overflow-tooltip
              />
            </el-table>
          </div>
          
          <!-- Message Results (for EXPLAIN, SHOW, etc.) -->
          <div v-else-if="queryResult.message" class="message-results">
            <el-alert
              :title="queryResult.message"
              type="success"
              :closable="false"
              show-icon
            />
          </div>
          
          <!-- Empty Results -->
          <div v-else class="empty-results">
            <el-empty description="Query executed successfully but returned no data" />
          </div>
        </div>
        
        <!-- Error Results -->
        <div v-else class="error-results">
          <el-alert
            :title="queryResult.error || 'Query failed'"
            type="error"
            :closable="false"
            show-icon
          />
        </div>
      </div>
    </div>

    <!-- Executed Queries Section -->
    <div class="executed-queries-section">
      <div class="section-header">
        <h3>Executed Queries History</h3>
        <el-button 
          size="small" 
          @click="clearHistory"
        >
          Clear History
        </el-button>
      </div>
      
      <div class="queries-list">
        <div 
          v-for="(query, index) in executedQueries" 
          :key="index"
          class="query-item"
          :class="{ 
            'success': query.success, 
            'error': !query.success 
          }"
        >
          <div class="query-header">
            <span class="query-sql">{{ query.sql }}</span>
            <div class="query-meta">
              <span class="timestamp">{{ formatTimestamp(query.timestamp) }}</span>
              <span v-if="query.executionTime" class="execution-time">
                {{ query.executionTime }}ms
              </span>
            </div>
          </div>
          
          <div v-if="query.error" class="query-error">
            {{ query.error }}
          </div>
          
          <div class="query-status">
            <el-tag 
              :type="query.success ? 'success' : 'danger'"
              size="small"
            >
              {{ query.success ? 'Success' : 'Error' }}
            </el-tag>
          </div>
        </div>
        
        <div v-if="executedQueries.length === 0" class="no-queries">
          <el-empty description="No queries executed yet" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTableStore } from '../stores/tableStore';

const props = defineProps<{
  connectionId?: string;
}>();

const emit = defineEmits<{
  'query-executed': [result: any];
}>();

// Store
const tableStore = useTableStore();

// Local state
const sqlQuery = ref('');
const queryResult = ref<any>(null);
const selectedText = ref('');
const hasSelection = ref(false);

// Refs
const editorRef = ref();

// Computed
const executedQueries = computed(() => tableStore.executedQueries);

// Methods
const handleTextSelection = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  
  if (start !== end) {
    selectedText.value = target.value.substring(start, end).trim();
    hasSelection.value = true;
  } else {
    selectedText.value = '';
    hasSelection.value = false;
  }
};

const executeSelectedQuery = async () => {
  if (!selectedText.value.trim()) return;
  
  const result = await tableStore.executeQuery(
    selectedText.value, 
    props.connectionId,
    true
  );
  
  if (result) {
    queryResult.value = result;
    emit('query-executed', result);
  }
};

const executeAllQueries = async () => {
  if (!sqlQuery.value.trim()) return;
  
  const result = await tableStore.executeQuery(
    sqlQuery.value, 
    props.connectionId,
    false
  );
  
  if (result) {
    queryResult.value = result;
    emit('query-executed', result);
  }
};

const clearEditor = () => {
  sqlQuery.value = '';
  queryResult.value = null;
  selectedText.value = '';
  hasSelection.value = false;
};

const clearHistory = () => {
  // Clear executed queries from store
  tableStore.executedQueries = [];
};

const formatTimestamp = (timestamp: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(timestamp);
};

// Lifecycle
onMounted(() => {
  // Focus editor on mount
  if (editorRef.value) {
    editorRef.value.focus();
  }
});
</script>

<style scoped>
.sql-editor {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
  padding: 1rem;
}

.editor-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
}

.editor-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.editor-actions {
  display: flex;
  gap: 0.5rem;
}

.editor-content {
  padding: 1rem;
}

.editor-content :deep(.el-textarea__inner) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.results-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
}

.results-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.result-info {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--el-text-color-secondary);
}

.results-content {
  padding: 1rem;
}

.data-table {
  margin-bottom: 1rem;
}

.message-results {
  margin-bottom: 1rem;
}

.empty-results {
  text-align: center;
  padding: 2rem;
}

.executed-queries-section {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  overflow: hidden;
  flex: 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color-page);
}

.section-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.queries-list {
  padding: 1rem;
  max-height: 300px;
  overflow-y: auto;
}

.query-item {
  padding: 1rem;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 0.75rem;
  background: var(--el-bg-color-page);
}

.query-item.success {
  border-left: 4px solid var(--el-color-success);
}

.query-item.error {
  border-left: 4px solid var(--el-color-danger);
}

.query-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.query-sql {
  flex: 1;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.query-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  margin-left: 1rem;
  flex-shrink: 0;
}

.timestamp {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.execution-time {
  font-size: 0.75rem;
  color: var(--el-color-primary);
  font-weight: 500;
}

.query-error {
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: var(--el-color-danger-light-9);
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--el-color-danger);
}

.query-status {
  display: flex;
  justify-content: flex-end;
}

.no-queries {
  text-align: center;
  padding: 2rem;
  color: var(--el-text-color-secondary);
}

/* Dark mode adjustments */
:deep(.dark) .editor-content .el-textarea__inner {
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

:deep(.dark) .query-item {
  background: var(--el-bg-color-page);
}
</style>
