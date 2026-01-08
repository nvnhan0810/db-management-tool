<template>
  <div class="connection-sidebar">
    <div class="sidebar-header">
      <h3>Connections</h3>
    </div>
    <div class="sidebar-content">
      <div
        v-for="connection in sortedConnections"
        :key="connection.tabId"
        class="connection-item"
        :class="{ active: connection.tabId === currentTabId }"
        @click="handleSelectConnection(connection.tabId)"
      >
        <div class="connection-item-header">
          <div class="connection-icon">
            <el-icon>
              <Connection />
            </el-icon>
          </div>
          <div class="connection-info">
            <div class="connection-name">{{ connection.name || `${connection.type} - ${connection.host}` }}</div>
            <div class="connection-details">
              <span class="connection-type">{{ connection.type }}</span>
              <span class="connection-host">{{ connection.host }}:{{ connection.port }}</span>
            </div>
          </div>
        </div>
        <div class="connection-status">
          <el-tag :type="connection.isConnected ? 'success' : 'danger'" size="small">
            {{ connection.isConnected ? 'Connected' : 'Disconnected' }}
          </el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConnectionsStore } from '@/stores/connectionsStore';
import { Connection } from '@element-plus/icons-vue';

const connectionsStore = useConnectionsStore();
const {
  sortedConnections,
  currentTabId,
  switchToConnection,
} = connectionsStore;

const handleSelectConnection = (tabId: string) => {
  switchToConnection(tabId);
};
</script>

<style scoped lang="scss">
.connection-sidebar {
  width: 280px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color);
  overflow: hidden;

  .dark & {
    background-color: rgba(45, 55, 72, 0.6);
    border-right-color: rgba(74, 85, 104, 0.5);
  }

  [data-theme="light"] & {
    background-color: rgba(255, 255, 255, 0.8);
    border-right-color: rgba(226, 232, 240, 0.8);
  }

  .sidebar-header {
    padding: 16px;
    border-bottom: 1px solid var(--el-border-color-light);

    h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    .connection-item {
      padding: 12px;
      margin-bottom: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      background-color: transparent;
      border: 1px solid transparent;

      &:hover {
        background-color: var(--el-fill-color-light);
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
      }

      .connection-item-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 8px;

        .connection-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          background-color: var(--el-color-primary-light-9);
          color: var(--el-color-primary);
          flex-shrink: 0;

          .dark & {
            background-color: rgba(64, 158, 255, 0.2);
            color: #66b1ff;
          }

          [data-theme="light"] & {
            background-color: rgba(64, 158, 255, 0.1);
            color: #409eff;
          }
        }

        .connection-info {
          flex: 1;
          min-width: 0;

          .connection-name {
            font-size: 14px;
            font-weight: 600;
            color: var(--el-text-color-primary);
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .connection-details {
            display: flex;
            flex-direction: column;
            gap: 2px;
            font-size: 12px;
            color: var(--el-text-color-regular);

            .connection-type {
              text-transform: uppercase;
              font-weight: 500;
            }

            .connection-host {
              opacity: 0.8;
            }
          }
        }
      }

      .connection-status {
        display: flex;
        justify-content: flex-end;
      }
    }
  }
}
</style>

