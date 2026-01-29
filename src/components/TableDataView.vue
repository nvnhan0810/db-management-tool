<template>
  <div class="data-view">
    <!-- Filter Section -->
    <TableDataFilter
      v-if="data"
      :columns="getDataColumns(data.rows || [])"
      @apply="handleFilterApply"
    />

    <div v-if="isLoading" class="loading-data">
      <el-skeleton :rows="10" animated />
    </div>
    <div v-else-if="error" class="error-message">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
    </div>
    <div v-else-if="data" class="data-content">
      <el-table v-if="data.rows && data.rows.length > 0" :data="data.rows" border style="width: 100%" max-height="500" stripe>
        <el-table-column
          v-for="column in getDataColumns(data.rows)"
          :key="column"
          :prop="column"
          :label="column"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
      <div v-else class="no-data">
        <el-empty description="No data found" :image-size="100" />
      </div>
    </div>
    <div v-else class="loading-data">
      <el-skeleton :rows="10" animated />
    </div>
  </div>
</template>

<script setup lang="ts">
import TableDataFilter from './TableDataFilter.vue';

interface TableData {
  rows: any[];
  total: number;
  page: number;
  perPage: number;
}

interface Filter {
  column: string;
  operator: string;
  value: string;
}

interface Props {
  data?: TableData | null;
  isLoading?: boolean;
  error?: string | null;
  dbType?: string;
}

interface Emits {
  (e: 'filter-apply', whereClause: string | null): void;
}

const props = withDefaults(defineProps<Props>(), {
  data: null,
  isLoading: false,
  error: null,
  dbType: 'postgresql',
});

const emit = defineEmits<Emits>();

const getDataColumns = (rows: any[]): string[] => {
  if (rows && rows.length > 0) {
    return Object.keys(rows[0]);
  }
  // If no rows but we have data structure, try to get columns from previous data
  if (props.data?.rows && props.data.rows.length > 0) {
    return Object.keys(props.data.rows[0]);
  }
  return [];
};

const buildWhereClause = (filters: Filter[] | null, rawSql: string | null): string | null => {
  const dbType = props.dbType || 'postgresql';
  if (rawSql) {
    return rawSql;
  }

  if (!filters || filters.length === 0) {
    return null;
  }

  const conditions = filters.map(filter => {
    const column = dbType === 'postgresql' ? `"${filter.column}"` :
                   dbType === 'mysql' ? `\`${filter.column}\`` :
                   filter.column;

    if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
      return `${column} ${filter.operator}`;
    }

    if (filter.operator === 'IN' || filter.operator === 'NOT IN') {
      const values = filter.value.split(',').map(v => {
        const trimmed = v.trim();
        // Try to detect if it's a number
        if (/^\d+$/.test(trimmed)) {
          return trimmed;
        }
        return `'${trimmed.replace(/'/g, "''")}'`;
      }).join(', ');
      return `${column} ${filter.operator} (${values})`;
    }

    if (filter.operator === 'LIKE' || filter.operator === 'NOT LIKE') {
      return `${column} ${filter.operator} '${filter.value.replace(/'/g, "''")}'`;
    }

    // For =, !=, >, <, >=, <=
    // Try to detect if value is a number
    const isNumeric = /^-?\d+(\.\d+)?$/.test(filter.value.trim());
    const value = isNumeric ? filter.value.trim() : `'${filter.value.replace(/'/g, "''")}'`;
    return `${column} ${filter.operator} ${value}`;
  });

  return conditions.join(' AND ');
};

const handleFilterApply = (filters: Filter[] | null, rawSql: string | null) => {
  // Build WHERE clause from filters or use raw SQL
  const whereClause = buildWhereClause(filters, rawSql);
  emit('filter-apply', whereClause);
};

const handleFilterClear = () => {
  // Clear filter means apply null whereClause to reload data without filters
  emit('filter-apply', null);
};
</script>

<style scoped lang="scss">
.data-view {
  height: 100%;
  min-height: 400px;
}

.loading-data {
  padding: 20px;
}

.error-message {
  padding: 20px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px;
}

.data-content {
  background-color: var(--el-bg-color-page);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

  .dark & {
    background-color: rgba(26, 32, 44, 0.8);
    border: 1px solid rgba(74, 85, 104, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  :deep(.el-table) {
    background-color: transparent;

    .dark & {
      background-color: transparent;
      color: #e2e8f0;
    }

    .el-table__header {
      background-color: var(--el-fill-color-lighter);

      .dark & {
        background-color: rgba(45, 55, 72, 0.8);
        color: #e2e8f0;
      }

      th {
        .dark & {
          background-color: rgba(45, 55, 72, 0.8) !important;
          color: #e2e8f0 !important;
          border-bottom-color: rgba(74, 85, 104, 0.6) !important;
        }
      }
    }

    .el-table__body {
      .dark & {
        color: #e2e8f0;
      }

      tr {
        .dark & {
          background-color: rgba(26, 32, 44, 0.6);
          color: #e2e8f0;
        }

        &:hover {
          background-color: var(--el-fill-color-light);

          .dark & {
            background-color: rgba(45, 55, 72, 0.6) !important;
          }
        }

        &.el-table__row--striped {
          background-color: var(--el-fill-color-lighter);

          .dark & {
            background-color: rgba(45, 55, 72, 0.4) !important;
          }
        }

        td {
          .dark & {
            background-color: transparent !important;
            color: #e2e8f0 !important;
            border-bottom-color: rgba(74, 85, 104, 0.4) !important;
          }
        }
      }
    }
  }
}
</style>
