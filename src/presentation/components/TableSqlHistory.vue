<template>
  <div class="sql-section">
    <div class="sql-header">
      <h4>Executed SQL Queries</h4>
      <el-button 
        size="small" 
        :type="showContent ? 'primary' : 'default'"
        @click="toggleContent"
      >
        <el-icon style="margin-right: 4px;">
          <component :is="showContent ? 'View' : 'Hide'" />
        </el-icon>
        {{ showContent ? 'Hide' : 'Show' }}
      </el-button>
    </div>
    <div v-show="showContent" class="sql-content">
      <div v-if="executedQueries.length === 0" class="no-queries">
        <el-empty description="No SQL queries executed yet" :image-size="60" />
      </div>
      <div v-else class="queries-list">
        <div 
          v-for="(query, index) in executedQueries" 
          :key="index"
          class="query-item"
        >
          <div class="query-header">
            <div class="query-info">
              <span class="query-time">{{ formatQueryTime(query.timestamp) }}</span>
              <span v-if="query.executionTime" class="execution-time">
                {{ formatExecutionTime(query.executionTime) }}
              </span>
            </div>
            <span class="query-status" :class="query.success ? 'success' : 'error'">
              {{ query.success ? 'Success' : 'Error' }}
            </span>
          </div>
          <div class="query-sql">{{ query.sql }}</div>
          <div v-if="!query.success && query.error" class="query-error">
            {{ query.error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface ExecutedQuery {
  sql: string;
  timestamp: Date;
  success: boolean;
  error?: string;
  executionTime?: number; // Execution time in milliseconds
}

const props = defineProps<{
  executedQueries: ExecutedQuery[];
}>();

// Debug: Watch for changes in executedQueries
import { watch } from 'vue';

watch(() => props.executedQueries, (newQueries) => {
  console.log('TableSqlHistory: executedQueries changed:', newQueries);
  if (newQueries.length > 0) {
    console.log('TableSqlHistory: Last query:', newQueries[0]);
  }
}, { deep: true });

const showContent = ref(true);

const toggleContent = () => {
  showContent.value = !showContent.value;
};

const formatQueryTime = (timestamp: Date): string => {
  const date = new Date(timestamp);
  
  // Format: "DD/MM/YYYY HH:MM:SS"
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

const formatExecutionTime = (executionTime: number): string => {
  if (executionTime < 1000) {
    return `${executionTime}ms`;
  } else if (executionTime < 60000) {
    return `${(executionTime / 1000).toFixed(2)}s`;
  } else {
    return `${(executionTime / 60000).toFixed(2)}m`;
  }
};
</script>

<style scoped>
.sql-section {
  border: 1px solid var(--el-border-color);
  /* border-radius: 6px; */
  padding: 1rem;
  background-color: var(--el-bg-color-page);
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  gap: 1rem;
}

.sql-header h4 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  font-weight: 600;
}

.sql-content {
  height: calc(400px - 40px);
  overflow-y: auto;
}

.no-queries {
  padding: 2rem 0;
  text-align: center;
}

.queries-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.query-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 0.75rem;
  background-color: var(--el-bg-color);
  margin-bottom: 0.5rem;
}

.query-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.query-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.query-time {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
}

.execution-time {
  font-size: 0.7rem;
  color: var(--el-text-color-placeholder);
  font-style: italic;
}

.query-status {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-weight: 400;
  border: 1px solid transparent;
}

.query-status.success {
  background-color: var(--el-color-success-light-9);
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-7);
}

.query-status.error {
  background-color: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border-color: var(--el-color-danger-light-7);
}

.query-sql {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.8rem;
  color: var(--el-text-color-primary);
  background-color: var(--el-bg-color-page);
  padding: 0.5rem;
  border-radius: 3px;
  border: 1px solid var(--el-border-color-light);
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 0.5rem;
  line-height: 1.4;
}

.query-error {
  font-size: 0.8rem;
  color: var(--el-color-danger);
  background-color: var(--el-color-danger-light-9);
  padding: 0.4rem 0.5rem;
  border-radius: 3px;
  border-left: 2px solid var(--el-color-danger);
}
</style>
