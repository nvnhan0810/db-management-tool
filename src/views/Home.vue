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
        <!-- Loading State -->
        <div v-if="isLoading" class="loading-container">
          <el-skeleton :rows="3" animated />
        </div>

        <!-- Empty State -->
        <div v-else-if="!hasConnections" class="empty-state">
          <el-empty description="No saved connections">
            <el-button type="primary" @click="handleNewConnection">
              Create New Connection
            </el-button>
          </el-empty>
        </div>

        <!-- Connections Grid -->
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
                  <el-button
                    circle
                    size="small"
                    class="connection-action-btn"
                    @click.stop
                  >
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

    <!-- Connection Modal -->
    <ConnectionModal
      v-model="showConnectionModal"
      :connection-to-edit="connectionToEdit"
      @saved="handleConnectionSaved"
      @connected="handleConnectionConnected"
    />
  </div>
</template>

<script setup lang="ts">
import type { SavedConnection } from '@/services/storage';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { Connection, Delete, Edit, MoreFilled, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ConnectionModal from '../components/ConnectionModal.vue';
import { useDatabase } from '../composables/useDatabase';

const router = useRouter();
const connectionStore = useConnectionStore();
const { connect } = useDatabase();
const connectionsStore = useConnectionsStore();

// Use store state and actions
const savedConnections = computed(() => connectionStore.connections);
const isLoading = computed(() => connectionStore.isLoading);
const hasConnections = computed(() => connectionStore.hasConnections);
const {
  deleteConnection,
  getDecryptedConnection,
  updateLastUsed,
  loadSavedConnections
} = connectionStore;

// Modal state
const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

// Handle new connection
const handleNewConnection = () => {
  connectionToEdit.value = null;
  showConnectionModal.value = true;
};

// Handle connection saved
const handleConnectionSaved = () => {
  // Reload saved connections to show the new one at the top
  loadSavedConnections();
  connectionToEdit.value = null;
};

// Handle connection connected
const handleConnectionConnected = () => {
  // Connection will navigate to workspace automatically
  // Just reload connections in case it was auto-saved
  loadSavedConnections();
};

// Handle load connection
const handleLoadConnection = async (connection: SavedConnection) => {
  try {
    const loadingMessage = ElMessage({
      message: 'Connecting...',
      type: 'info',
      duration: 0,
    });

    // Get decrypted connection
    const decryptedConnection = await getDecryptedConnection(connection);

    // Connect to database
    const success = await connect(decryptedConnection);

    if (success) {
      // Update last used timestamp
      await updateLastUsed(connection.id);

      // Set as active connection in store
      const connectionWithName = {
        ...decryptedConnection,
        name: connection.name,
      };
      connectionStore.setActiveConnection(connectionWithName);

      // Add to useConnections for multiple connections support
      const tabId = await connectionsStore.addConnection(connectionWithName, connection.name);
      console.log('Added connection with tabId:', tabId);

      loadingMessage.close();
      ElMessage.success(`Connected to ${connection.name}`);

      // Small delay to ensure state is updated before navigation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Navigate to workspace
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      ElMessage.error('Failed to connect to database');
    }
  } catch (error) {
    console.error('Failed to load connection:', error);
    ElMessage.error(error instanceof Error ? error.message : 'Failed to connect to database');
  }
};

// Handle dropdown commands
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
          buttonSize: 'default',
        }
      );

      await deleteConnection(connection.id);
      ElMessage.success('Connection deleted successfully');
    } catch (error) {
      if (error !== 'cancel') {
        console.error('Failed to delete connection:', error);
        ElMessage.error('Failed to delete connection');
      }
    }
  }
};

// Format date helper
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return 'Today';
  } else if (diffInDays === 1) {
    return 'Yesterday';
  } else if (diffInDays < 7) {
    return `${diffInDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};
</script>

<style scoped lang="scss">
@use '@/sass/views/home.scss' as *;
</style>
