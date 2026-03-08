<template>
  <div class="filter-section">
    <div class="filter-rows">
      <div
        v-for="(filter, index) in filterRows"
        :key="index"
        class="filter-row"
      >
        <el-checkbox
          v-model="filter.apply"
          size="small"
        />
        <el-select
          v-model="filter.column"
          placeholder="Select column"
          size="small"
          style="width: 120px;"
        >
          <el-option
            v-for="column in columns"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name }}
          </el-option>
        </el-select>
        <el-select
          v-model="filter.operator"
          placeholder="Operator"
          size="small"
          style="width: 100px;"
        >
          <el-option value="=">=</el-option>
          <el-option value="!=">!=</el-option>
          <el-option value=">">></el-option>
          <el-option value="<"><</el-option>
          <el-option value=">=">>=</el-option>
          <el-option value="<="><=</el-option>
          <el-option value="LIKE">LIKE</el-option>
          <el-option value="IN">IN</el-option>
        </el-select>
        <el-input
          v-model="filter.value"
          placeholder="Value"
          size="small"
          style="flex: 1;"
        />
        <el-button
          size="small"
          type="danger"
          @click="removeFilterRow(index)"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="filter-actions">
      <el-button size="small" @click="addFilterRow">
        <el-icon><Plus /></el-icon>
        Add Filter
      </el-button>
      <el-button
        v-if="filterRows.length > 0"
        size="small"
        type="primary"
        @click="applyFilters"
      >
        Apply Filters
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Close, Plus } from '@element-plus/icons-vue';
import { ref, watch } from 'vue';

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
}

interface FilterRow {
  apply: boolean;
  column: string;
  operator: string;
  value: string;
}

const props = defineProps<{
  columns: TableColumn[];
}>();

const emit = defineEmits<{
  'update:filters': [filters: FilterRow[]];
  'apply-filters': [filters: FilterRow[]];
}>();

const filterRows = ref<FilterRow[]>([]);

const addFilterRow = () => {
  filterRows.value.push({
    apply: true,
    column: '',
    operator: '=',
    value: ''
  });
};

const removeFilterRow = (index: number) => {
  filterRows.value.splice(index, 1);
};

const applyFilters = () => {
  const activeFilters = filterRows.value.filter(f => f.apply && f.column && f.operator && f.value);
  emit('apply-filters', activeFilters);
};

// Watch for changes and emit to parent
watch(filterRows, (newFilters) => {
  emit('update:filters', newFilters);
}, { deep: true });
</script>

<style scoped>
.filter-section {
  border: 1px solid var(--el-border-color);
  padding: 1rem;
  background-color: var(--el-bg-color-page);
}

.filter-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filter-rows:empty {
  margin-bottom: 0;
}

.filter-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}

.filter-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-start;
}
</style>
