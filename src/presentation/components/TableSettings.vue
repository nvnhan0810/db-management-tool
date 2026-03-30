<template>
  <div class="settings-section">
    <div class="display-mode">
      <el-radio-group v-model="displayMode" size="small" @change="handleDisplayModeChange">
        <el-radio-button value="data">Data</el-radio-button>
        <el-radio-button value="structure">Structure</el-radio-button>
      </el-radio-group>
    </div>
    <div v-if="displayMode === 'data'" class="pagination-controls">
      <span class="records-info">
        Records per page:
        <el-select v-model="recordsPerPage" size="small" style="width: 80px; margin: 0 8px;" @change="handleRecordsPerPageChange">
          <el-option :value="10">10</el-option>
          <el-option :value="25">25</el-option>
          <el-option :value="50">50</el-option>
          <el-option :value="100">100</el-option>
        </el-select>
      </span>
      <span class="page-info">
        Page 
        <el-input-number 
          v-model="currentPage" 
          :min="1" 
          :max="totalPages"
          size="small"
          style="width: 80px; margin: 0 8px;"
          @change="handlePageChange"
        />
        of {{ totalPages }}
      </span>
    </div>
    

  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  displayMode: 'data' | 'structure';
  recordsPerPage: number;
  currentPage: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  'update:displayMode': [mode: 'data' | 'structure'];
  'update:recordsPerPage': [records: number];
  'update:currentPage': [page: number];
  'load-data': []; // Add load data event
}>();

const displayMode = ref(props.displayMode);
const recordsPerPage = ref(props.recordsPerPage);
const currentPage = ref(props.currentPage);

const handleDisplayModeChange = (mode: 'data' | 'structure') => {
  emit('update:displayMode', mode);
};

const handleRecordsPerPageChange = (records: number) => {
  emit('update:recordsPerPage', records);
  // Load data with new records per page
  emit('load-data');
};

const handlePageChange = (page: number) => {
  emit('update:currentPage', page);
  // Load data with new page
  emit('load-data');
};

// Watch for prop changes
watch(() => props.displayMode, (newMode) => {
  displayMode.value = newMode;
});

watch(() => props.recordsPerPage, (newRecords) => {
  recordsPerPage.value = newRecords;
});

watch(() => props.currentPage, (newPage) => {
  currentPage.value = newPage;
});
</script>

<style scoped>
.settings-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
  min-height: 50px; /* Reduce height */
}

.display-mode {
  display: flex;
  align-items: center;
}

.pagination-controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
}

.records-info, .page-info {
  display: flex;
  align-items: center;
}

/* Dark mode fixes for radio buttons */
:deep(.el-radio-button__inner) {
  color: var(--el-text-color-primary) !important;
}

:deep(.el-radio-button__original-radio:not(:checked) + .el-radio-button__inner) {
  color: var(--el-text-color-regular) !important;
  background-color: var(--el-bg-color-page) !important;
  border-color: var(--el-border-color) !important;
}

:deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: var(--el-color-white) !important;
  background-color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

:deep(.el-radio-button__inner:hover) {
  color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

/* Dark mode specific overrides */
.dark :deep(.el-radio-button__inner) {
  color: var(--el-text-color-primary) !important;
}

.dark :deep(.el-radio-button__original-radio:not(:checked) + .el-radio-button__inner) {
  color: var(--el-text-color-regular) !important;
  background-color: var(--el-bg-color-page) !important;
  border-color: var(--el-border-color) !important;
}

.dark :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: var(--el-color-white) !important;
  background-color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

.dark :deep(.el-radio-button__inner:hover) {
  color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}
</style>
