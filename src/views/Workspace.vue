<template>
  <div id="workspace">
    <el-container>
      <el-header>
        <h2>Database Workspace</h2>
        <div class="header-actions">
          <el-button @click="handleDisconnect">Disconnect</el-button>
        </div>
      </el-header>

      <el-main>
        <div v-if="activeConnection" class="connection-info">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>Connected to: {{ connectionName }}</span>
              </div>
            </template>
            <div class="connection-details">
              <p><strong>Type:</strong> {{ activeConnection.type }}</p>
              <p><strong>Host:</strong> {{ activeConnection.host }}:{{ activeConnection.port }}</p>
              <p v-if="activeConnection.database"><strong>Database:</strong> {{ activeConnection.database }}</p>
              <p><strong>Username:</strong> {{ activeConnection.username }}</p>
            </div>
          </el-card>
        </div>

        <div v-else class="no-connection">
          <el-empty description="No active connection">
            <el-button type="primary" @click="goHome">Go to Home</el-button>
          </el-empty>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useDatabase } from '@/composables/useDatabase';
import { useConnectionStore } from '@/stores/connectionStore';
import { ElMessage } from 'element-plus';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const connectionStore = useConnectionStore();
const { disconnect } = useDatabase();

const activeConnection = computed(() => connectionStore.activeConnection);

const connectionName = computed(() => {
  if (!activeConnection.value) return '';
  return activeConnection.value.name || `${activeConnection.value.type} - ${activeConnection.value.host}`;
});

const handleDisconnect = async () => {
  try {
    await disconnect();
    connectionStore.setActiveConnection(null);
    ElMessage.success('Disconnected successfully');
    router.push({ name: 'home' });
  } catch (error) {
    console.error('Failed to disconnect:', error);
    ElMessage.error('Failed to disconnect');
  }
};

const goHome = () => {
  router.push({ name: 'home' });
};
</script>

<style scoped lang="scss">
#workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);

  .el-container {
    height: 100%;
  }

  .el-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--el-border-color);
    background-color: transparent;

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }
  }

  .el-main {
    padding: 20px;
    background-color: transparent;
  }

  .connection-info {
    max-width: 800px;
    margin: 0 auto;

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
    }

    :deep(.el-card__body) {
      padding: 16px;
      background-color: transparent;
    }

    .card-header {
      font-weight: 600;
      font-size: 16px;
      color: var(--el-text-color-primary);
    }

    .connection-details {
      p {
        margin: 8px 0;
        font-size: 14px;
        color: var(--el-text-color-primary);

        strong {
          font-weight: 600;
          color: var(--el-text-color-regular);
          margin-right: 8px;
        }
      }
    }
  }

  .no-connection {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
  }
}
</style>

