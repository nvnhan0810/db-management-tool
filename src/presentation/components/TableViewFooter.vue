<template>
  <div class="tab-footer">
    <div class="footer-left">
      <el-radio-group size="small" :model-value="viewMode" @update:model-value="handleViewModeChange">
        <el-radio-button value="structure">Structure</el-radio-button>
        <el-radio-button value="data">Data</el-radio-button>
      </el-radio-group>
      <el-button
        v-if="viewMode === 'data'"
        type="success"
        size="small"
        class="add-row-btn"
        @click="emit('add-row')"
      >
        <el-icon><Plus /></el-icon>
        Add Row
      </el-button>
    </div>
    <div v-if="viewMode === 'data' && data" class="footer-right">
      <span class="total-records">Total: {{ data.total.toLocaleString() }} records</span>
      <el-select
        size="small"
        :model-value="data.perPage"
        style="width: 60px; margin: 0 10px;"
        @update:model-value="handlePerPageChange"
      >
        <el-option label="25" :value="25" />
        <el-option label="50" :value="50" />
        <el-option label="100" :value="100" />
        <el-option label="200" :value="200" />
      </el-select>
      <el-pagination
        :current-page="data.page"
        :page-size="data.perPage"
        :total="data.total"
        layout="prev, pager, next"
        size="small"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';

interface TableData {
  rows: any[];
  total: number;
  page: number;
  perPage: number;
}

interface Props {
  viewMode: 'structure' | 'data';
  data?: TableData | null;
}

interface Emits {
  (e: 'update:viewMode', value: 'structure' | 'data'): void;
  (e: 'page-change', page: number): void;
  (e: 'per-page-change', perPage: number): void;
  (e: 'add-row'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const handleViewModeChange = (value: string) => {
  emit('update:viewMode', value as 'structure' | 'data');
};

const handlePageChange = (page: number) => {
  emit('page-change', page);
};

const handlePerPageChange = (perPage: number) => {
  emit('per-page-change', perPage);
};
</script>

<style scoped lang="scss">
.tab-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-top: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-page);
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);

  .dark & {
    background-color: var(--el-bg-color-overlay);
    border-top-color: var(--el-border-color);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
  }

  .footer-left {
    display: flex;
    align-items: center;
    gap: 12px;

    .add-row-btn {
      margin-left: 4px;
    }

    :deep(.el-radio-group) {
      .el-radio-button {
        &:first-child .el-radio-button__inner {
          border-radius: 6px 0 0 6px;
        }
        &:last-child .el-radio-button__inner {
          border-radius: 0 6px 6px 0;
        }
        .el-radio-button__inner {
          padding: 8px 16px;
          transition: all 0.2s ease;

          .dark & {
            background-color: var(--el-fill-color);
            border-color: var(--el-border-color);
            color: var(--el-text-color-primary);
          }
        }

        &.is-active {
          .el-radio-button__inner {
            background-color: var(--el-color-primary);
            border-color: var(--el-color-primary);
            box-shadow: 0 2px 4px rgba(64, 158, 255, 0.3);

            .dark & {
              background-color: var(--el-color-primary);
              border-color: var(--el-color-primary);
              color: var(--el-color-white);
              box-shadow: 0 2px 4px rgba(64, 158, 255, 0.4);
            }
          }
        }
      }
    }
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 12px;

    .total-records {
      font-size: 14px;
      color: var(--el-text-color-regular);
      font-weight: 500;
      padding: 6px 12px;
      background-color: var(--el-fill-color-lighter);
      border-radius: 6px;

      .dark & {
        background-color: var(--el-fill-color);
        color: var(--el-text-color-regular);
        border: 1px solid var(--el-border-color-light);
      }
    }

    :deep(.el-select) {
      .el-input__inner {
        border-radius: 6px;
      }

      .dark & {
        .el-input__wrapper {
          background-color: var(--el-bg-color-overlay) !important;
          border-color: var(--el-border-color) !important;
        }

        .el-input__inner {
          color: var(--el-text-color-primary) !important;
        }
      }
    }

    :deep(.el-pagination) {
      .el-pager li {
        border-radius: 4px;
        margin: 0 2px;

        .dark & {
          background-color: var(--el-fill-color);
          color: var(--el-text-color-primary);
          border-color: var(--el-border-color);

          &.is-active {
            background-color: var(--el-color-primary);
            color: var(--el-color-white);
          }
        }
      }

      .btn-prev,
      .btn-next {
        border-radius: 4px;

        .dark & {
          background-color: var(--el-fill-color);
          color: var(--el-text-color-primary);
          border-color: var(--el-border-color);
        }
      }
    }
  }
}
</style>
