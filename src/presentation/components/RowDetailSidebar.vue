<template>
  <div class="row-detail-sidebar" :class="{ 'sidebar-visible': visible }">
    <div class="sidebar-header">
      <h3>Row Details</h3>
      <el-button size="small" class="close-btn" @click="$emit('close')">
        <el-icon>
          <Close />
        </el-icon>
      </el-button>
    </div>
    
    <div class="sidebar-content">
      <div v-if="selectedRow" class="row-details">
        <div v-for="(value, key) in selectedRow" :key="key" class="detail-item">
          <div class="detail-label">{{ key }}</div>
          <div class="detail-value">
            <el-input
              :model-value="formatValue(value)"
              type="textarea"
              :rows="2"
              @update:model-value="(newValue: string) => updateField(key, newValue)"
              @keydown.escape.prevent="cancelEdit"
              placeholder="Enter value..."
              class="editable-input"
            />
          </div>
        </div>
      </div>
      
      <div v-else class="no-selection">
        <el-empty description="Select a row to view details" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue';
import { watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  selectedRow: Record<string, any> | null;
}>();

const emit = defineEmits<{
  'close': [];
  'update-row': [rowData: Record<string, any>, field: string, newValue: any];
}>();

const formatValue = (value: any): string => {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const updateField = (field: string, newValue: string) => {
  if (props.selectedRow) {
    const updatedRow = { ...props.selectedRow };
    updatedRow[field] = newValue;
    
    emit('update-row', updatedRow, field, newValue);
  }
};

const saveField = (field: string) => {
  // Save is now handled by updateField on every change
  // This method is kept for keyboard shortcuts
  console.log(`Field ${field} saved`);
};

const cancelEdit = () => {
  // Cancel functionality can be implemented if needed
  console.log('Edit cancelled');
};

// Watch for changes in selectedRow
watch(() => props.selectedRow, () => {
  // Reset any editing state if needed
});
</script>

<style scoped>
.row-detail-sidebar {
  position: fixed;
  top: 32px; /* Below title bar */
  right: -400px;
  width: 400px;
  height: calc(100vh - 32px);
  background-color: var(--el-bg-color);
  border-left: 1px solid var(--el-border-color);
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  transition: right 0.3s ease;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.sidebar-visible {
  right: 0;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--el-text-color-primary);
}

.close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.row-details {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-label {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  min-height: 40px;
}

.editable-input {
  width: 100%;
}

.editable-input :deep(.el-textarea__inner) {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  line-height: 1.4;
  resize: vertical;
  min-height: 40px;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* Dark mode styles */
.dark .row-detail-sidebar {
  background-color: #1a202c;
  border-left-color: #4a5568;
}

.dark .sidebar-header {
  background-color: #2d3748;
  border-bottom-color: #4a5568;
}

.dark .sidebar-header h3 {
  color: var(--el-text-color-primary);
}

.dark .detail-label {
  color: var(--el-text-color-primary);
}

/* Input styles for dark mode */
.dark :deep(.el-textarea__inner) {
  background-color: #2d3748;
  border-color: #4a5568;
  color: var(--el-text-color-primary);
}

.dark :deep(.el-textarea__inner:focus) {
  border-color: #409eff;
  background-color: #2d3748;
}
</style>
