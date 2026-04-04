<template>
  <transition name="sql-history-slide">
    <div v-if="open" class="sql-history-panel">
      <div class="panel-header">
        <span class="title">SQL History</span>
        <div class="actions">
          <el-button
            size="small"
            :disabled="queries.length === 0"
            title="Clear history"
            @click="clearHistory"
          >
            <el-icon>
              <Delete />
            </el-icon>
          </el-button>
          <el-button size="small" @click="close">
            <el-icon>
              <Close />
            </el-icon>
          </el-button>
        </div>
      </div>

      <div class="panel-body">
        <div v-if="queries.length === 0" class="empty">
          <el-empty description="No SQL queries executed yet" :image-size="60" />
        </div>

        <div v-else class="list">
          <div v-for="(q, idx) in queries" :key="idx" class="item">
            <div :class="['meta', { 'meta-success': q.success, 'meta-error': !q.success }]">
              <span class="time">{{ formatTime(q.timestamp) }}</span>
              <span v-if="q.executionTime" class="exec">
                {{ formatExecutionTime(q.executionTime) }}
              </span>
              <span v-if="q.executionTime && q.executionTime >= 200" class="exec-slow">
                - SLOW SQL
              </span>
            </div>
            <pre class="sql">{{ q.sql }}</pre>
            <div v-if="!q.success && q.error" class="error">
              {{ q.error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { Close, Delete } from '@element-plus/icons-vue';
import { computed } from 'vue';

const connectionStore = useConnectionStore();

const open = computed(() => connectionStore.sqlHistoryPanelOpen);

const queries = computed(() => connectionStore.sqlHistory);

const close = () => connectionStore.closeSqlHistoryPanel();

const clearHistory = () => connectionStore.clearSqlHistory();

function formatTime(ts: Date): string {
  const d = new Date(ts);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatExecutionTime(executionTime: number): string {
  if (executionTime < 1000) return `${executionTime}ms`;
  if (executionTime < 60000) return `${(executionTime / 1000).toFixed(2)}s`;
  return `${(executionTime / 60000).toFixed(2)}m`;
}
</script>

<style scoped lang="scss">
.sql-history-panel {
  border-top: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color);
  padding: 8px 12px 10px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  margin-bottom: 4px;

  .title {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    button {
      margin-left: 0;
    }
  }
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.item {
  border-radius: 6px;
  background-color: var(--el-bg-color);
}

.meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;

  &.meta-success {
    color: var(--el-color-success);
  }

  &.meta-error {
    color: var(--el-color-danger);
  }
}

.time {
  font-size: 12px;
}

.exec {
  font-size: 12px;
}

.exec-slow {
  font-size: 12px;
  color: var(--el-color-danger);
  font-weight: bold;
}

.sql {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.35;
}

.error {
  margin-top: 4px;
  margin-bottom: 12px;
  color: var(--el-color-danger);
}

.sql-history-slide-enter-active,
.sql-history-slide-leave-active {
  transition: transform 0.18s ease-out, opacity 0.18s ease-out;
}

.sql-history-slide-enter-from,
.sql-history-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>

