<template>
  <div v-if="tables.length > 0" class="tables-list-wrapper">
    <div class="tables-filter">
      <el-input v-model="tableNameFilter" placeholder="Filter by table name..." clearable size="small"
        class="table-filter-input">
        <template #prefix>
          <el-icon>
            <Search />
          </el-icon>
        </template>
      </el-input>
    </div>
    <div class="tables-list">
      <template v-if="filteredTables.length > 0">
        <div v-for="table in filteredTables" :key="table.name" class="table-item"
          :class="{ active: activeTableName === table.name }" @click="onSelectTable(table)">
          <el-icon class="table-icon">
            <Document />
          </el-icon>
          <span class="table-name">{{ table.name }}</span>
        </div>
      </template>
      <div v-else class="no-match">
        <span>No tables match "{{ tableNameFilter }}"</span>
      </div>
    </div>
  </div>

  <!-- No Tables -->
  <div v-else class="no-tables">
    <el-empty description="No tables found" :image-size="80" />
  </div>
</template>

<script setup lang="ts">
import { Table } from '@/stores/tableStore';
import { computed, ref } from 'vue';

const props = defineProps<{
  tables: Table[];
  activeTableName: string;
}>();

const emit = defineEmits<{
  (e: 'select-table', table: Table): void;
}>();

const tableNameFilter = ref('');

const tables = props.tables;

const filteredTables = computed(() => {
  const q = tableNameFilter.value.trim().toLowerCase();
  if (!q) return tables;
  return tables.filter(t => t.name.toLowerCase().includes(q));
});

const onSelectTable = (table: Table) => {
  emit('select-table', table);
};
</script>


<style scoped lang="scss">
.tables-list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  .tables-filter {
    flex-shrink: 0;
    padding: 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .table-filter-input {
    width: 100%;
  }

  .tables-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    scrollbar-width: none;
    -ms-overflow-style: none;

    &::-webkit-scrollbar {
      display: none;
    }

    .table-item {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      background-color: transparent;
      border: 1px solid transparent;

      &:hover {
        background-color: rgba(64, 158, 255, 0.1);

        .table-name,
        .table-icon {
          color: #303133;
        }

        .dark & {
          background-color: rgba(64, 158, 255, 0.18);

          .table-name,
          .table-icon {
            color: #e5e7eb;
          }
        }

        [data-theme="light"] & {
          background-color: rgba(64, 158, 255, 0.08);

          .table-name,
          .table-icon {
            color: #303133;
          }
        }
      }

      &.active {
        background-color: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary);

        .dark & {
          background-color: rgba(64, 158, 255, 0.2);
          border-color: rgba(64, 158, 255, 0.5);
        }

        [data-theme="light"] & {
          background-color: rgba(64, 158, 255, 0.1);
          border-color: rgba(64, 158, 255, 0.3);
        }

        .table-name {
          color: var(--el-color-primary);
          font-weight: 600;
        }
      }

      .table-icon {
        font-size: 16px;
        color: var(--el-text-color-regular);
        margin-right: 8px;
      }

      .table-name {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }
    }
  }
}
</style>
