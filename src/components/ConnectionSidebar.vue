<template>
  <div class="connection-sidebar">
    <div class="sidebar-header">
      <h3>Connections</h3>
    </div>
    <div class="sidebar-content">
      <el-tooltip
        v-for="connection in displayedConnections"
        :key="connection.tabId"
        placement="right"
        :show-after="300"
      >
        <template #content>
          <div class="connection-tooltip">
            <div>Name: {{ connection.name || connection.host }}</div>
            <div>Host: {{ connection.host }}:{{ connection.port }}</div>
            <div v-if="connection.database">Database: {{ connection.database }}</div>
            <div v-if="connection.ssh?.host">SSH Host: {{ connection.ssh.host }}</div>
          </div>
        </template>
        <div
          class="connection-item"
          :class="{ active: connection.tabId === currentTabId }"
          @click="handleSelectConnection(connection.tabId)"
        >
          <div class="connection-icon">
            <el-icon><Connection /></el-icon>
          </div>
          <div class="connection-info">
            <span class="connection-name">{{ connection.name || `${connection.type} - ${connection.host}` }}</span>
            <span class="connection-host">{{ connection.host }}:{{ connection.port }}</span>
          </div>
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ActiveConnection } from '@/stores/connectionsStore';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { storeToRefs } from 'pinia';
import { Connection } from '@element-plus/icons-vue';
import { computed, ref, watch } from 'vue';

const connectionsStore = useConnectionsStore();
const { sortedConnections, currentTabId } = storeToRefs(connectionsStore);
const { switchToConnection } = connectionsStore;

// Giữ thứ tự hiển thị cố định - chỉ thêm mới khi có connection mới, không reorder khi switch
const displayOrder = ref<string[]>([]);

watch(
  sortedConnections,
  (conns) => {
    const tabIds = conns.map((c) => c.tabId);
    const current = new Set(displayOrder.value);
    const newIds = tabIds.filter((id) => !current.has(id));
    const removed = displayOrder.value.filter((id) => tabIds.includes(id));
    if (newIds.length > 0) {
      displayOrder.value = [...removed, ...newIds];
    } else {
      displayOrder.value = removed;
    }
  },
  { immediate: true, deep: true }
);

const displayedConnections = computed(() => {
  const conns = sortedConnections.value;
  const order = displayOrder.value;
  return order.map((tabId) => conns.find((c) => c.tabId === tabId)).filter(Boolean) as ActiveConnection[];
});

const handleSelectConnection = (tabId: string) => {
  switchToConnection(tabId);
};
</script>

<style scoped lang="scss">
.connection-sidebar {
  width: 140px;
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
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color-light);

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .connection-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
    background-color: transparent;
    border: 1px solid transparent;
    min-width: 0;

    &:hover {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary) inset;
      background-color: transparent;
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

    .connection-icon {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      background-color: var(--el-color-primary-light-9);
      color: var(--el-color-primary);

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
      max-width: 100px;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .connection-name {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .connection-host {
        font-size: 10px;
        color: var(--el-text-color-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
}

/* Tooltip content - rendered in popper, needs global or :deep */
:deep(.connection-tooltip) {
  div {
    line-height: 1.5;
    &:not(:last-child) {
      margin-bottom: 4px;
    }
  }
}
</style>

