<template>
  <div class="structure-view">
    <div v-if="isLoading" class="loading-structure">
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
    <div v-else-if="structure && structure.columns" class="structure-content">
      <!-- Columns Table -->
      <div class="structure-section">
        <h4>Columns</h4>
        <div v-if="!structure.columns || structure.columns.length === 0" class="no-columns">
          <el-empty description="No columns found" :image-size="64" />
        </div>
        <el-table
          v-else
          size="small"
          :data="structure.columns"
          border
          style="width: 100%"
          max-height="400"
        >
          <el-table-column prop="ordinal_position" label="#" width="60" align="center" />
          <el-table-column prop="name" label="Column Name" min-width="150" />
          <el-table-column prop="type" label="Data Type" min-width="120" />
          <el-table-column prop="nullable" label="Nullable" width="80" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.nullable ? 'success' : 'danger'" size="small">
                {{ scope.row.nullable ? 'YES' : 'NO' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="default_value" label="Default" min-width="120" />
          <el-table-column prop="extra" label="Extra" min-width="100" />
          <el-table-column prop="foreign_key" label="Foreign Key" min-width="150" />
          <el-table-column prop="comment" label="Comment" min-width="150" />
        </el-table>
      </div>

      <!-- Indexes Section -->
      <div v-if="structure.indexes && structure.indexes.length > 0" class="structure-section">
        <h4>Indexes</h4>
        <el-table size="small" :data="structure.indexes" border style="width: 100%">
          <el-table-column prop="name" label="Index Name" min-width="150" />
          <el-table-column prop="column_name" label="Column" min-width="120" />
          <el-table-column prop="is_unique" label="Unique" width="80" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.is_unique ? 'warning' : 'info'" size="small">
                {{ scope.row.is_unique ? 'YES' : 'NO' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="algorithm" label="Algorithm" min-width="100" />
        </el-table>
      </div>

      <!-- Table Info -->
      <div v-if="structure.rows !== undefined" class="table-info-footer">
        <span>Total Rows: <strong>{{ structure.rows.toLocaleString() }}</strong></span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  ordinal_position?: number;
  default_value?: string;
  extra?: string;
  foreign_key?: string;
  comment?: string;
}

interface TableIndex {
  name: string;
  column_name: string;
  is_unique: boolean;
  algorithm?: string;
}

interface TableStructure {
  columns: TableColumn[];
  indexes?: TableIndex[];
  rows?: number;
}

interface Props {
  structure?: TableStructure | null;
  isLoading?: boolean;
  error?: string | null;
}

withDefaults(defineProps<Props>(), {
  structure: null,
  isLoading: false,
  error: null,
});
</script>

<style scoped lang="scss">
.structure-view {
  height: 100%;
  min-height: 400px;
}

.loading-structure {
  padding: 12px 16px;
}

.error-message {
  padding: 12px 16px;

  :deep(.el-alert) {
    padding: 8px 12px;
  }

  :deep(.el-alert__title) {
    font-size: 13px;
    line-height: 1.4;
  }
}

.structure-content {
  .structure-section {
    margin-bottom: 20px;
    background-color: var(--el-bg-color-page);
    border-radius: 8px;
    padding: 14px 16px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    .dark & {
      background-color: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color-light);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    [data-theme="light"] & {
      background-color: rgba(255, 255, 255, 0.9);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    h4 {
      margin: 0 0 10px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      padding-bottom: 8px;
      border-bottom: 1px solid var(--el-border-color-light);

      .dark & {
        color: var(--el-text-color-primary);
        border-bottom-color: var(--el-border-color);
      }
    }

    :deep(.el-table) {
      background-color: transparent;

      .dark & {
        background-color: transparent;
        color: var(--el-text-color-primary);
      }

      .el-table__header {
        background-color: var(--el-fill-color-lighter);

        .dark & {
          background-color: var(--el-fill-color);
          color: var(--el-text-color-primary);
        }

        th {
          .dark & {
            background-color: var(--el-fill-color) !important;
            color: var(--el-text-color-primary) !important;
            border-bottom-color: var(--el-border-color) !important;
          }
        }
      }

      .el-table__body {
        .dark & {
          color: var(--el-text-color-primary);
        }

        tr {
          .dark & {
            background-color: var(--el-bg-color);
            color: var(--el-text-color-primary);
          }

          &:hover {
            background-color: var(--el-fill-color-light);

            .dark & {
              background-color: var(--el-fill-color-light) !important;
            }
          }

          td {
            .dark & {
              background-color: transparent !important;
              color: var(--el-text-color-primary) !important;
              border-bottom-color: var(--el-border-color-lighter) !important;
            }
          }
        }
      }
    }
  }

  .table-info-footer {
    margin-top: 16px;
    padding: 10px 14px;
    background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, var(--el-color-primary-light-8) 100%);
    border-radius: 8px;
    font-size: 12px;
    color: var(--el-text-color-regular);
    border: 1px solid var(--el-color-primary-light-7);

    .dark & {
      background: var(--el-bg-color-overlay);
      border: 1px solid var(--el-border-color);
      color: var(--el-text-color-regular);
    }

    strong {
      color: var(--el-color-primary);
      font-weight: 600;
      font-size: 13px;

      .dark & {
        color: var(--el-color-primary-light-3);
      }
    }
  }
}

.no-columns {
  padding: 24px;
  text-align: center;
}
</style>
