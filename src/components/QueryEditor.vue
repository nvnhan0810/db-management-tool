<template>
  <div class="query-editor">
    <div class="editor-toolbar">
      <el-button-group>
        <el-button type="primary" @click="executeQuery" :disabled="!isConnected">
          Execute
        </el-button>
        <el-button @click="clearQuery">Clear</el-button>
      </el-button-group>
    </div>
    <div class="editor-container">
      <el-input
        v-model="query"
        type="textarea"
        :rows="10"
        placeholder="Enter your SQL query here..."
        resize="none"
      />
    </div>
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    <div v-if="queryResult" class="query-results">
      <el-table
        v-if="queryResult.success && queryResult.results"
        :data="queryResult.results"
        style="width: 100%"
        height="400"
        border
      >
        <el-table-column
          v-for="field in queryResult.fields"
          :key="field.name"
          :prop="field.name"
          :label="field.name"
        />
      </el-table>
      <div v-else-if="!queryResult.success" class="error-message">
        {{ queryResult.error }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDatabase } from '../composables/useDatabase';

const query = ref('');
const { isConnected, queryResult, error, executeQuery: runQuery } = useDatabase();

const executeQuery = async () => {
  if (!query.value.trim()) return;
  await runQuery(query.value);
};

const clearQuery = () => {
  query.value = '';
};
</script>

<style scoped>
.query-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.editor-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 0.5rem;
}

.editor-container {
  flex: 1;
}

.error-message {
  color: var(--el-color-danger);
  padding: 0.5rem;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
}

.query-results {
  margin-top: 1rem;
}
</style> 