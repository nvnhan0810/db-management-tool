<template>
  <div class="database-tables">
    <div class="tables-header">
      <div class="header-content">
        <h3>Tables</h3>
        <span v-if="!isLoading && tables.length > 0" class="tables-count">{{ tables.length }}</span>
      </div>
    </div>
    
    <div v-if="isLoading" class="loading">
      <el-skeleton :rows="5" animated />
    </div>
    
    <div v-else-if="tables.length > 0" class="tables-list">
      <div 
        v-for="table in tables" 
        :key="table.name"
        class="table-item"
        :class="{ active: activeTableName === table.name }"
        @click="$emit('select-table', table)"
      >
        <span class="table-name">{{ table.name }}</span>
      </div>
    </div>
    
    <div v-else class="no-tables">
      <el-empty description="No tables found" />
    </div>
  </div>
</template>

<script setup lang="ts">

interface Table {
  name: string;
  type?: string;
}

defineProps<{
  tables: Table[];
  isLoading: boolean;
  activeTableName?: string;
}>();

defineEmits<{
  'select-table': [table: Table];
}>();
</script>

<style scoped>
.database-tables {
  width: 100%;
  height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
}

.tables-header {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tables-header h3 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 0.875rem;
  font-weight: 600;
}

.tables-count {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  background-color: var(--el-color-primary-light-9);
  padding: 0.125rem 0.375rem;
  border-radius: 12px;
  font-weight: 500;
}

.loading {
  flex: 1;
  padding: 1rem;
}

.tables-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem;
  height: calc(100vh - 32px - 35.5px); /* Full remaining height */
}

.table-item {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  /* margin-bottom: 0.125rem; */
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.table-item:hover {
  background-color: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}

.table-item.active {
  background-color: var(--el-color-primary-light-8);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

/* Dark mode active table styles */
.dark .table-item.active {
  background-color: rgba(64, 158, 255, 0.2);
  border-color: #409eff;
  color: #409eff;
}

.dark .table-item:hover {
  background-color: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.dark .table-item {
  background-color: transparent;
  border-color: transparent;
  color: var(--el-text-color-primary);
}

.table-item:hover {
  background-color: var(--el-color-primary-light-9);
}

.table-name {
  font-size: 0.875rem;
  color: var(--el-text-color-primary);
}

.no-tables {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
</style>
