<template>
  <div class="main-content-section">
    <div v-if="displayMode === 'data'" class="data-view">
      <div v-if="tableData.length === 0 && !isLoadingData" class="no-data">
        <div class="no-data-content">
          <el-empty 
            description="This table has no data" 
            :image-size="60"
          />
          <div class="load-data-button">
            <el-button type="primary" @click="loadTableData">
              Refresh
            </el-button>
          </div>
        </div>
      </div>
      <el-table
        v-else
        :data="tableData"
        class="full-height-table"
        border
        v-loading="isLoadingData"
      >
        <el-table-column
          v-for="column in columns"
          :key="column.name"
          :prop="column.name"
          :label="column.name"
          :width="150"
        />
      </el-table>
    </div>
    <div v-else class="structure-view">
      <!-- Columns Structure Table -->
      <div class="structure-section">
        <h4>Table Structure</h4>
        <div v-if="columns.length === 0" class="no-columns">
          <el-empty 
            description="No columns loaded - Database connection may be closed" 
            :image-size="60"
          />
          <div class="error-message">
            <el-alert
              title="Connection Error"
              type="warning"
              description="Unable to load table structure. Please check your database connection."
              show-icon
              :closable="false"
            />
          </div>
        </div>
        <div v-else class="structure-table">
          <el-table :data="columnsWithFullType" border style="width: 100%">
            <el-table-column prop="ordinal_position" label="#" width="60" align="center" />
            <el-table-column prop="name" label="Column Name" min-width="120" />
            <el-table-column prop="fullType" label="Data Type" min-width="100" />
            <el-table-column prop="character_set" label="Character Set" min-width="100" />
            <el-table-column prop="collation" label="Collation" min-width="100" />
            <el-table-column prop="nullable" label="Nullable" width="80" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.nullable ? 'success' : 'danger'" size="small">
                  {{ scope.row.nullable ? 'YES' : 'NO' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="default_value" label="Default" min-width="100" />
            <el-table-column prop="extra" label="Extra" min-width="80" />
            <el-table-column prop="foreign_key" label="Foreign Key" min-width="100" />
            <el-table-column prop="comment" label="Comment" min-width="120" />
          </el-table>
        </div>
      </div>

      <!-- Indexes Section -->
      <div class="indexes-section">
        <h4>Indexes</h4>
        <div v-if="!indexes || indexes.length === 0" class="no-indexes">
          <el-empty description="No indexes found" :image-size="60" />
        </div>
        <div v-else class="indexes-table">
          <el-table :data="indexes" border style="width: 100%">
            <el-table-column prop="name" label="Index Name" min-width="120" />
            <el-table-column prop="algorithm" label="Algorithm" width="100" align="center" />
            <el-table-column prop="is_unique" label="Unique" width="80" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.is_unique ? 'warning' : 'info'" size="small">
                  {{ scope.row.is_unique ? 'YES' : 'NO' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="column_name" label="Column Name" min-width="120" />
          </el-table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  ordinal_position?: number;
  fullType?: string;
  character_set?: string;
  collation?: string;
  default_value?: string;
  extra?: string;
  foreign_key?: string;
  comment?: string;
}

interface TableIndex {
  name: string;
  algorithm?: string;
  is_unique: boolean;
  column_name: string;
}

const props = defineProps<{
  displayMode: 'data' | 'structure';
  columns: TableColumn[];
  tableName: string;
  rows?: number;
  tableData: any[];
  isLoadingData: boolean;
  indexes?: TableIndex[];
}>();

const emit = defineEmits<{
  'refresh-data': [];
}>();

const loadTableData = () => {
  emit('refresh-data');
};

// Computed property để hiển thị full type (type + length)
const columnsWithFullType = computed(() => {
  return props.columns.map(column => ({
    ...column,
    fullType: column.type || 'Unknown'
  }));
});
</script>

<style scoped>
.main-content-section {
  flex: 1; /* Take remaining space */
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
  overflow: hidden; /* Hide overflow, let table handle scroll */
  display: flex;
  flex-direction: column;
  position: relative; /* For absolute positioning if needed */
  flex-grow: 1;
}

.data-view {
  flex: 1;
  overflow: hidden; /* Hide overflow, let table handle scroll */
  display: flex;
  flex-direction: column;
  position: relative; /* For absolute positioning if needed */
}

.data-view .el-table {
  height: 100% !important;
  width: 100% !important;
}

.full-height-table {
  height: 100% !important;
  width: 100% !important;
}

/* Force Element Plus table to full height with high specificity */
.data-view .el-table.full-height-table {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table.full-height-table .el-table__body-wrapper {
  height: calc(100% - 40px) !important; /* Subtract header height */
  overflow-y: auto !important;
}

.data-view .el-table.full-height-table .el-table__inner-wrapper {
  height: 100% !important;
}

/* Override any existing height constraints */
.data-view .el-table {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table .el-table__body-wrapper {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

/* Highest specificity to override Vue scoped CSS */
.data-view .el-table[data-v-11607a55] {
  height: 100% !important;
  width: 100% !important;
}

.data-view .el-table[data-v-11607a55] .el-table__body-wrapper {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

/* Use :deep() to override Vue scoped CSS */
:deep(.data-view .el-table) {
  height: 100% !important;
  width: 100% !important;
}

:deep(.data-view .el-table .el-table__body-wrapper) {
  height: calc(100% - 40px) !important;
  overflow-y: auto !important;
}

.data-view .el-table {
  height: 250px !important;
  overflow: auto;
}

.structure-view {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.table-details {
  margin-bottom: 2rem;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 1.5rem;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--el-border-color-light);
}

.detail-item:last-child {
  border-bottom: none;
}

.columns-section h4 {
  margin: 0 0 1.5rem 0;
  color: var(--el-text-color-primary);
  font-size: 1rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--el-color-primary);
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.column-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background-color: var(--el-bg-color);
  transition: all 0.2s ease;
}

.column-item:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.column-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 0.9rem;
  flex: 2;
}

.column-type {
  color: var(--el-text-color-secondary);
  font-size: 0.85rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  flex: 2;
  text-align: center;
}

.column-nullable {
  color: var(--el-text-color-placeholder);
  font-size: 0.8rem;
  flex: 1;
  text-align: right;
  padding: 0.25rem 0.5rem;
  background-color: var(--el-bg-color-page);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-light);
}

.label {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.value {
  color: var(--el-text-color-secondary);
}

.no-columns {
  text-align: center;
  padding: 2rem 0;
}

.error-message {
  margin-top: 1rem;
}

.no-data {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-data-content {
  text-align: center;
}

.load-data-button {
  margin-top: 1rem;
}

/* Structure View Styling */
.structure-view {
  padding: 1rem;
}

.structure-section,
.indexes-section {
  margin-bottom: 2rem;
}

.structure-section h4,
.indexes-section h4 {
  margin: 0 0 1.5rem 0;
  font-size: 1rem;
  font-weight: 600;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--el-color-primary);
  color: var(--el-text-color-primary);
}

.structure-table,
.indexes-table {
  margin-top: 1rem;
}

.no-indexes {
  text-align: center;
  padding: 2rem 0;
}


</style>
