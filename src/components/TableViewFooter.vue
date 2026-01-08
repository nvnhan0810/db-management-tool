<template>
  <div class="tab-footer">
    <div class="footer-left">
      <el-radio-group :model-value="viewMode" @update:model-value="handleViewModeChange">
        <el-radio-button value="structure">Structure</el-radio-button>
        <el-radio-button value="data">Data</el-radio-button>
      </el-radio-group>
    </div>
    <div v-if="viewMode === 'data' && data" class="footer-right">
      <span class="total-records">Total: {{ data.total.toLocaleString() }} records</span>
      <el-select :model-value="data.perPage" @update:model-value="handlePerPageChange" style="width: 100px; margin: 0 10px;">
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
        @current-change="handlePageChange"
        small
      />
    </div>
  </div>
</template>

<script setup lang="ts">
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
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-page);
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);

  .dark & {
    background-color: rgba(26, 32, 44, 0.95);
    border-top-color: rgba(74, 85, 104, 0.6);
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
  }

  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.95);
    border-top-color: rgba(226, 232, 240, 0.8);
  }

  .footer-left {
    display: flex;
    align-items: center;

    :deep(.el-radio-group) {
      .el-radio-button {
        .el-radio-button__inner {
          border-radius: 6px;
          padding: 8px 16px;
          transition: all 0.2s ease;

          .dark & {
            background-color: rgba(45, 55, 72, 0.8);
            border-color: rgba(74, 85, 104, 0.6);
            color: #e2e8f0;
          }
        }

        &.is-active {
          .el-radio-button__inner {
            background-color: var(--el-color-primary);
            border-color: var(--el-color-primary);
            box-shadow: 0 2px 4px rgba(64, 158, 255, 0.3);

            .dark & {
              background-color: #409eff;
              border-color: #409eff;
              color: #ffffff;
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
        background-color: rgba(45, 55, 72, 0.8);
        color: #cbd5e0;
        border: 1px solid rgba(74, 85, 104, 0.5);
      }
    }

    :deep(.el-select) {
      .el-input__inner {
        border-radius: 6px;
      }

      .dark & {
        .el-input__wrapper {
          background-color: rgba(26, 32, 44, 0.8) !important;
          border-color: rgba(74, 85, 104, 0.6) !important;
        }

        .el-input__inner {
          color: #e2e8f0 !important;
        }
      }
    }

    :deep(.el-pagination) {
      .el-pager li {
        border-radius: 4px;
        margin: 0 2px;

        .dark & {
          background-color: rgba(45, 55, 72, 0.8);
          color: #e2e8f0;
          border-color: rgba(74, 85, 104, 0.6);

          &.is-active {
            background-color: #409eff;
            color: #ffffff;
          }
        }
      }

      .btn-prev,
      .btn-next {
        border-radius: 4px;

        .dark & {
          background-color: rgba(45, 55, 72, 0.8);
          color: #e2e8f0;
          border-color: rgba(74, 85, 104, 0.6);
        }
      }
    }
  }
}
</style>
