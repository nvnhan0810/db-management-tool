<template>
  <div id="home">
    <el-container>
      <header>
        <h1>Saved Connections</h1>
        <el-button type="primary" @click="handleNewConnection">
          <Plus />New
        </el-button>
      </header>

      <el-main>
        <div v-if="isLoading" class="loading-container">
          <el-skeleton :rows="3" animated />
        </div>

        <div v-else-if="!hasConnections" class="empty-state">
          <el-empty description="No saved connections">
            <el-button type="primary" @click="handleNewConnection">
              Create New Connection
            </el-button>
          </el-empty>
        </div>

        <div v-else class="connections-grid">
          <el-card
            v-for="connection in savedConnections"
            :key="connection.id"
            class="connection-card"
            shadow="hover"
            @click="handleLoadConnection(connection)"
          >
            <template #header>
              <div class="card-header">
                <div class="connection-name">
                  <el-icon class="connection-icon"><Connection /></el-icon>
                  <span>{{ connection.name }}</span>
                </div>
                <el-dropdown
                  trigger="click"
                  @command="(cmd: string) => handleCommand(cmd, connection)"
                  popper-class="connection-dropdown-menu"
                >
                  <el-button circle size="small" class="connection-action-btn" @click.stop>
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="edit" class="dropdown-item-edit">
                        <el-icon class="dropdown-icon"><Edit /></el-icon>
                        <span>Edit</span>
                      </el-dropdown-item>
                      <el-dropdown-item command="delete" divided class="dropdown-item-delete">
                        <el-icon class="dropdown-icon"><Delete /></el-icon>
                        <span>Delete</span>
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>

            <div class="connection-details">
              <div class="detail-item">
                <span class="label">Type:</span>
                <el-tag size="small">{{ connection.type }}</el-tag>
              </div>
              <div class="detail-item">
                <span class="label">Host:</span>
                <span class="value">{{ connection.host }}:{{ connection.port }}</span>
              </div>
              <div v-if="connection.database" class="detail-item">
                <span class="label">Database:</span>
                <span class="value">{{ connection.database }}</span>
              </div>
              <div v-if="connection.lastUsed" class="detail-item">
                <span class="label">Last Used:</span>
                <span class="value">{{ formatDate(connection.lastUsed) }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </el-main>
    </el-container>

    <ConnectionModal
      v-model="showConnectionModal"
      :connection-to-edit="connectionToEdit"
      @saved="handleConnectionSaved"
      @connected="handleConnectionConnected"
    />
  </div>
</template>

<script setup lang="ts">
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { useDatabase } from '@/presentation/composables/useDatabase';
import ConnectionModal from '@/presentation/components/ConnectionModal.vue';
import { Connection, Delete, Edit, MoreFilled, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const connectionStore = useConnectionStore();
const { connect } = useDatabase();
const connectionsStore = useConnectionsStore();

const savedConnections = computed(() => connectionStore.connections);
const isLoading = computed(() => connectionStore.isLoading);
const hasConnections = computed(() => connectionStore.hasConnections);
const {
  deleteConnection,
  getDecryptedConnection,
  updateLastUsed,
  loadSavedConnections,
} = connectionStore;

const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

const handleNewConnection = () => {
  connectionToEdit.value = null;
  showConnectionModal.value = true;
};

const handleConnectionSaved = () => {
  loadSavedConnections();
  connectionToEdit.value = null;
};

const handleConnectionConnected = () => {
  loadSavedConnections();
};

const handleLoadConnection = async (connection: SavedConnection) => {
  try {
    const loadingMessage = ElMessage({ message: 'Connecting...', type: 'info', duration: 0 });
    const decryptedConnection = await getDecryptedConnection(connection);
    const success = await connect(decryptedConnection);

    if (success) {
      await updateLastUsed(connection.id);
      const connectionWithName = { ...decryptedConnection, name: connection.name };
      connectionStore.setActiveConnection(connectionWithName);
      await connectionsStore.addConnection(connectionWithName, connection.name);
      loadingMessage.close();
      ElMessage.success(`Connected to ${connection.name}`);
      await new Promise((r) => setTimeout(r, 100));
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      ElMessage.error('Failed to connect to database');
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : 'Failed to connect to database');
  }
};

const handleCommand = async (command: string, connection: SavedConnection) => {
  if (command === 'edit') {
    connectionToEdit.value = connection;
    showConnectionModal.value = true;
  } else if (command === 'delete') {
    try {
      await ElMessageBox.confirm(
        `Are you sure you want to delete "${connection.name}"?`,
        'Delete Connection',
        {
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel',
          type: 'warning',
          confirmButtonClass: 'el-button--danger',
        }
      );
      await deleteConnection(connection.id);
      ElMessage.success('Connection deleted successfully');
    } catch (error) {
      if (error !== 'cancel') {
        ElMessage.error('Failed to delete connection');
      }
    }
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  return date.toLocaleDateString();
};
</script>

<style scoped lang="scss">
@use '@/styles/views/home.scss' as *;
</style>
