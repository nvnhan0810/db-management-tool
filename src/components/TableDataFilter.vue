<template>
  <div class="table-data-filter">
    <!-- Mặc định: chỉ 1 hàng nút Add Filter -->
    <div v-if="!filterPanelOpen" class="filter-row-single">
      <el-button type="primary" size="small" @click="openFilterPanel">
        <el-icon><Plus /></el-icon>
        Add Filter
      </el-button>
    </div>

    <!-- Khi mở: hiện form filter + Apply, Cancel -->
    <template v-else>
      <div class="filter-content">
        <div class="raw-filter-section">
          <el-checkbox v-model="useRawSql" @change="handleRawSqlToggle">
            Use RAW SQL Query
          </el-checkbox>
          <div v-if="useRawSql" class="raw-sql-input">
            <el-input
              v-model="rawSqlQuery"
              type="textarea"
              :rows="3"
              placeholder="Enter SQL WHERE clause (e.g., column1 = 'value' AND column2 > 100)"
              @blur="handleRawSqlChange"
            />
          </div>
        </div>

        <div v-if="!useRawSql" class="filter-rows">
          <div
            v-for="(filter, index) in filters"
            :key="index"
            class="filter-row"
          >
            <el-select
              v-model="filter.column"
              placeholder="Select Column"
              style="width: 200px; margin-right: 10px;"
              filterable
              :disabled="filter.operator === 'RAW SQL'"
            >
              <el-option
                v-for="col in availableColumns"
                :key="col"
                :label="col"
                :value="col"
              />
            </el-select>

            <el-select
              v-model="filter.operator"
              placeholder="Operator"
              style="width: 150px; margin-right: 10px;"
              @change="handleOperatorChange(filter)"
            >
              <el-option label="=" value="=" />
              <el-option label="!=" value="!=" />
              <el-option label=">" value=">" />
              <el-option label=">=" value=">=" />
              <el-option label="<" value="<" />
              <el-option label="<=" value="<=" />
              <el-option label="LIKE" value="LIKE" />
              <el-option label="NOT LIKE" value="NOT LIKE" />
              <el-option label="IN" value="IN" />
              <el-option label="NOT IN" value="NOT IN" />
              <el-option label="IS NULL" value="IS NULL" />
              <el-option label="IS NOT NULL" value="IS NOT NULL" />
              <el-option label="RAW SQL" value="RAW SQL" />
            </el-select>

            <el-input
              v-if="!isNullOperator(filter.operator)"
              v-model="filter.value"
              :placeholder="getValuePlaceholder(filter.operator)"
              style="flex: 1; margin-right: 10px;"
              @keyup.enter="applyFilters"
            />

            <el-button
              type="danger"
              size="small"
              :icon="Delete"
              circle
              @click="removeFilter(index)"
            />
          </div>
        </div>

        <div class="filter-actions">
          <el-button type="primary" size="small" @click="addFilter">
            <el-icon><Plus /></el-icon>
            Add Filter
          </el-button>
          <el-button type="success" size="small" @click="onApply">
            Apply
          </el-button>
          <el-button size="small" @click="onCancel">
            Cancel
          </el-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue';
import { computed, ref } from 'vue';

interface Filter {
  column: string;
  operator: string;
  value: string;
}

interface Props {
  columns: string[];
}

interface Emits {
  (e: 'apply', filters: Filter[] | null, rawSql: string | null): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const filterPanelOpen = ref(false);
const filters = ref<Filter[]>([]);
const useRawSql = ref(false);
const rawSqlQuery = ref('');

const availableColumns = computed(() => props.columns || []);

const hasFilters = computed(() => {
  if (useRawSql.value) {
    return rawSqlQuery.value.trim().length > 0;
  }
  return filters.value.length > 0;
});

const openFilterPanel = () => {
  filterPanelOpen.value = true;
  if (filters.value.length === 0) {
    filters.value.push({
      column: '',
      operator: '=',
      value: ''
    });
  }
};

const addFilter = () => {
  filters.value.push({
    column: '',
    operator: '=',
    value: ''
  });
};

const onApply = () => {
  applyFilters();
};

const onCancel = () => {
  filterPanelOpen.value = false;
  filters.value = [];
  rawSqlQuery.value = '';
  useRawSql.value = false;
  emit('apply', null, null);
};

const removeFilter = (index: number) => {
  filters.value.splice(index, 1);
};

const isNullOperator = (operator: string): boolean => {
  return operator === 'IS NULL' || operator === 'IS NOT NULL';
};

const getValuePlaceholder = (operator: string): string => {
  if (operator === 'LIKE' || operator === 'NOT LIKE') {
    return 'e.g., %value%';
  }
  if (operator === 'IN' || operator === 'NOT IN') {
    return 'e.g., value1,value2,value3';
  }
  return 'Enter value';
};

const handleOperatorChange = (filter: Filter) => {
  if (isNullOperator(filter.operator)) {
    filter.value = '';
  }
};

const handleRawSqlToggle = () => {
  if (!useRawSql.value) {
    rawSqlQuery.value = '';
  }
};

const handleRawSqlChange = () => {
  if (useRawSql.value && rawSqlQuery.value.trim()) {
    applyFilters();
  }
};

const applyFilters = () => {
  if (useRawSql.value) {
    emit('apply', null, rawSqlQuery.value.trim() || null);
  } else {
    // Validate filters
    const validFilters = filters.value.filter(
      f => f.column && f.operator && (isNullOperator(f.operator) || f.value)
    );
    emit('apply', validFilters.length > 0 ? validFilters : null, null);
  }
};

const clearFilters = () => {
  filterPanelOpen.value = false;
  filters.value = [];
  rawSqlQuery.value = '';
  useRawSql.value = false;
  emit('apply', null, null);
};
</script>

<style scoped lang="scss">
.table-data-filter {
  background-color: var(--el-bg-color-page);
  margin-bottom: 20px;

  .dark & {
    background-color: rgba(26, 32, 44, 0.8);
    border-color: rgba(74, 85, 104, 0.5);
  }

  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.9);
    border-color: rgba(226, 232, 240, 0.8);
  }

  .filter-row-single {
    display: flex;
    align-items: center;
  }

  .filter-content {
    .filter-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .raw-filter-section {
      margin-bottom: 16px;
      padding: 12px;
      background-color: var(--el-fill-color-lighter);
      border-radius: 6px;

      .dark & {
        background-color: rgba(45, 55, 72, 0.6);
      }

      .raw-sql-input {
        margin-top: 12px;

        :deep(.el-textarea__inner) {
          font-family: 'Courier New', monospace;
          font-size: 13px;

          .dark & {
            background-color: rgba(26, 32, 44, 0.8);
            color: #e2e8f0;
            border-color: rgba(74, 85, 104, 0.6);
          }
        }
      }
    }

    .filter-rows {
      .filter-row {
        display: flex;
        align-items: center;
        margin-bottom: 12px;
        padding: 12px;
        background-color: var(--el-fill-color-lighter);
        border-radius: 6px;

        .dark & {
          background-color: rgba(45, 55, 72, 0.6);
        }

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }
}
</style>
