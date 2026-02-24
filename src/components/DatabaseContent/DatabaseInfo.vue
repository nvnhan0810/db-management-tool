<template>
  <div v-if="connection" class="connection-info-default">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon class="header-icon">
              <Connection />
            </el-icon>
            <span>{{ connection.name || `${connection.type} - ${connection.host}` }}</span>
          </div>
          <div class="header-right">
            <el-tag :type="connection.isConnected ? 'success' : 'danger'" size="default">
              {{ connection.isConnected ? 'Connected' : 'Disconnected' }}
            </el-tag>
          </div>
        </div>
      </template>
      <div class="connection-details">
        <div class="detail-item">
          <span class="detail-label">Type:</span>
          <span class="detail-value">{{ connection.type.toUpperCase() }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Host:</span>
          <span class="detail-value">{{ connection.host }}:{{ connection.port }}</span>
        </div>
        <div v-if="connection.database" class="detail-item">
          <span class="detail-label">Database:</span>
          <span class="detail-value">{{ connection.database }}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Username:</span>
          <span class="detail-value">{{ connection.username }}</span>
        </div>
        <div v-if="connection.lastActivity" class="detail-item">
          <span class="detail-label">Last Activity:</span>
          <span class="detail-value">{{ formatDate(connection.lastActivity) }}</span>
        </div>
      </div>
    </el-card>
  </div>
  <div v-else></div>
</template>

<script setup lang="ts">
import { useConnectionsStore } from '@/stores/connectionsStore';
import { Tab } from '@/stores/tableStore';
import { Connection } from '@element-plus/icons-vue';
import { ElCard, ElTag } from 'element-plus';
import { storeToRefs } from 'pinia';

const { currentConnection: connection } = storeToRefs(useConnectionsStore());

const props = defineProps<{
  tabs: Tab[];
}>();

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInMs = now.getTime() - d.getTime();
  const diffInMins = Math.floor(diffInMs / 60000);
  const diffInHours = Math.floor(diffInMs / 3600000);
  const diffInDays = Math.floor(diffInMs / 86400000);

  if (diffInMins < 1) return 'Just now';
  if (diffInMins < 60) return `${diffInMins} minute${diffInMins > 1 ? 's' : ''} ago`;
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;

  return d.toLocaleDateString();
};
</script>

<style scoped lang="scss">
.connection-info-default {
  flex: 1;
  padding: 20px;
  overflow-y: auto;

  :deep(.el-card) {
    border: 1px solid var(--el-border-color);
    background-color: var(--el-bg-color-page);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

    .dark & {
      background-color: rgba(45, 55, 72, 0.8);
      border-color: rgba(74, 85, 104, 0.5);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    [data-theme="light"] & {
      background-color: rgba(255, 255, 255, 0.9);
      border-color: rgba(226, 232, 240, 0.8);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
  }

  :deep(.el-card__header) {
    padding: 16px;
    background-color: transparent;
    border-bottom: 1px solid var(--el-border-color-light);

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 600;
        font-size: 16px;
        color: var(--el-text-color-primary);

        .header-icon {
          font-size: 20px;
          color: var(--el-color-primary);
        }
      }

      .header-right {
        display: flex;
        align-items: center;
      }
    }
  }

  :deep(.el-card__body) {
    padding: 16px;
    background-color: transparent;
  }

  .connection-details {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .detail-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border-radius: 6px;
      background-color: var(--el-fill-color-lighter);

      .dark & {
        background-color: rgba(74, 85, 104, 0.3);
      }

      [data-theme="light"] & {
        background-color: rgba(247, 250, 252, 0.8);
      }

      .detail-label {
        font-weight: 600;
        color: var(--el-text-color-regular);
        min-width: 120px;
        margin-right: 12px;
      }

      .detail-value {
        color: var(--el-text-color-primary);
        font-size: 14px;
      }
    }
  }
}
</style>
