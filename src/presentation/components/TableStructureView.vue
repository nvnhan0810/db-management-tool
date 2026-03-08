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
          <el-empty description="No columns found" :image-size="80" />
        </div>
        <el-table v-else :data="structure.columns" border style="width: 100%" max-height="400">
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
        <el-table :data="structure.indexes" border style="width: 100%">
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
  padding: 20px;
}

.error-message {
  padding: 20px;
}

.structure-content {
  .structure-section {
    margin-bottom: 32px;
    background-color: var(--el-bg-color-page);
    border-radius: 8px;
    padding: 20px;
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

    h4 {
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--el-text-color-primary);
      padding-bottom: 12px;
      border-bottom: 2px solid var(--el-border-color-light);

      .dark & {
        color: #e2e8f0;
        border-bottom-color: rgba(74, 85, 104, 0.6);
      }
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

  .table-info-footer {
    margin-top: 24px;
    padding: 16px 20px;
    background: linear-gradient(135deg, var(--el-color-primary-light-9) 0%, var(--el-color-primary-light-8) 100%);
    border-radius: 8px;
    font-size: 14px;
    color: var(--el-text-color-regular);
    border: 1px solid var(--el-color-primary-light-7);

    .dark & {
      background: rgba(26, 32, 44, 0.9);
      border: 1px solid rgba(74, 85, 104, 0.6);
      color: #cbd5e0;
    }

    strong {
      color: var(--el-color-primary);
      font-weight: 600;
      font-size: 16px;

      .dark & {
        color: #66b1ff;
      }
    }
  }
}

.no-columns {
  padding: 40px;
  text-align: center;
}
</style>
