<template>
  <div class="table-data-filter">
    <!-- Open state: show form + Apply/Cancel -->
    <div v-if="filterPanelOpen" class="filter-content">
      <div class="filter-rows">
        <div v-for="(filter, index) in filters" :key="index" class="filter-row">
          <el-select v-model="filter.column" placeholder="Select Column" style="width: 200px; margin-right: 10px;"
            filterable :disabled="filter.operator === 'RAW SQL'">
            <el-option v-for="col in availableColumns" :key="col" :label="col" :value="col" />
          </el-select>

          <el-select v-model="filter.operator" placeholder="Operator" style="width: 150px; margin-right: 10px;"
            @change="handleOperatorChange(filter)">
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

          <el-input v-if="!isNullOperator(filter.operator)" v-model="filter.value"
            :placeholder="getValuePlaceholder(filter.operator)" style="flex: 1; margin-right: 10px;"
            @keyup.enter="applyFilters" />

          <el-button type="danger" size="small" :icon="Delete" circle @click="removeFilter(index)" />
        </div>
      </div>

      <div class="filter-actions">
        <el-button type="primary" size="small" @click="addFilter">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
        <el-button class="ml-0" type="success" size="small" @click="onApply">
          Apply
        </el-button>
        <el-button type="danger" class="ml-0" size="small" @click="onCancel">
          Clear
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';

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

const availableColumns = computed(() => props.columns || []);

const hasFilters = computed(() => {
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
  if (operator === 'RAW SQL') {
    return "e.g., (age > 18 AND status = 'active')";
  }
  return 'Enter value';
};

const handleOperatorChange = (filter: Filter) => {
  if (isNullOperator(filter.operator)) {
    filter.value = '';
  }
};

const applyFilters = () => {
  // Validate filters
  const validFilters = filters.value.filter((f) => {
    if (!f.operator) return false;
    if (f.operator === 'RAW SQL') {
      return Boolean(f.value?.trim());
    }
    return Boolean(f.column) && (isNullOperator(f.operator) || Boolean(f.value));
  });
  emit('apply', validFilters.length > 0 ? validFilters : null, null);
};

const clearFilters = () => {
  filterPanelOpen.value = false;
  filters.value = [];
  emit('apply', null, null);
};

function handleKeydown(e: KeyboardEvent) {
  const key = e.key?.toLowerCase();
  if (!key) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  if (key !== 'f') return;
  // Always open filter form on Ctrl/Cmd+F (even if focus is in an input)
  // because this is an in-app shortcut in data mode.
  e.preventDefault();
  e.stopPropagation();
  openFilterPanel();
}

const keydownListenerOptions: AddEventListenerOptions = { capture: true };

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, keydownListenerOptions);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown, keydownListenerOptions);
});
</script>

<style scoped lang="scss">
.table-data-filter {
  background-color: var(--el-bg-color-page);

  .dark & {
    background-color: var(--el-bg-color-overlay);
    border-color: var(--el-border-color-light);
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
    margin-bottom: 20px;

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
        background-color: var(--el-fill-color-light);
      }

      .raw-sql-input {
        margin-top: 12px;

        :deep(.el-textarea__inner) {
          font-family: 'Courier New', monospace;
          font-size: 13px;

          .dark & {
            background-color: var(--el-bg-color-overlay);
            color: var(--el-text-color-primary);
            border-color: var(--el-border-color);
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
          background-color: var(--el-fill-color-light);
        }

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }
}
</style>
