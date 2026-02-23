<template>
  <div class="default-layout">
    <!-- Custom Title Bar -->
    <CustomTitleBar @add-query="handleAddQuery" @new-connection="handleNewConnection" />

    <!-- Main Content -->
    <div class="layout-content">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="routerViewRef" />
      </router-view>
    </div>

    <!-- Saved Connections Modal (from title bar "New Connection") -->
    <SavedConnectionsModal
      v-model="showSavedConnectionsModal"
      @new-connection="handleOpenConnectionForm"
      @select="handleSelectSavedConnection"
    />

    <!-- Connection form modal (New/Edit) when opened from Saved Connections Modal -->
    <ConnectionModal
      v-model="showConnectionModal"
      :connection-to-edit="connectionToEdit"
      @saved="handleConnectionSaved"
      @connected="handleConnectionConnected"
    />
  </div>
</template>

<script setup lang="ts">
import ConnectionModal from '@/components/ConnectionModal.vue';
import CustomTitleBar from '@/components/CustomTitleBar.vue';
import SavedConnectionsModal from '@/components/SavedConnectionsModal.vue';
import type { SavedConnection } from '@/services/storage';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { ElMessage } from 'element-plus';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDatabase } from '@/composables/useDatabase';

const router = useRouter();
const routerViewRef = ref();
const connectionStore = useConnectionStore();
const connectionsStore = useConnectionsStore();
const { connect } = useDatabase();

const showSavedConnectionsModal = ref(false);
const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

// Title bar: New Connection → open Saved Connections modal
const handleNewConnection = () => {
  showSavedConnectionsModal.value = true;
};

// Saved Connections modal: user clicked "New Connection" → open Connection form modal
const handleOpenConnectionForm = () => {
  connectionToEdit.value = null;
  showConnectionModal.value = true;
};

// Saved Connections modal: user selected a saved connection → connect and go to workspace
const handleSelectSavedConnection = async (connection: SavedConnection) => {
  try {
    const loadingMessage = ElMessage({ message: 'Connecting...', type: 'info', duration: 0 });
    const decryptedConnection = await connectionStore.getDecryptedConnection(connection);
    const success = await connect(decryptedConnection);

    if (success) {
      await connectionStore.updateLastUsed(connection.id);
      const connectionWithName = { ...decryptedConnection, name: connection.name };
      connectionStore.setActiveConnection(connectionWithName);
      const tabId = await connectionsStore.addConnection(connectionWithName, connection.name);
      loadingMessage.close();
      ElMessage.success(`Connected to ${connection.name}`);
      showSavedConnectionsModal.value = false;
      await new Promise((r) => setTimeout(r, 100));
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      ElMessage.error('Failed to connect to database');
    }
  } catch (err) {
    console.error('Failed to load connection:', err);
    ElMessage.error(err instanceof Error ? err.message : 'Failed to connect');
  }
};

const handleConnectionSaved = () => {
  connectionStore.loadSavedConnections();
  connectionToEdit.value = null;
};

const handleConnectionConnected = () => {
  connectionStore.loadSavedConnections();
  showConnectionModal.value = false;
};

// Handle add query from CustomTitleBar
const handleAddQuery = () => {
  if (routerViewRef.value && typeof routerViewRef.value.handleAddQuery === 'function') {
    routerViewRef.value.handleAddQuery();
  }
};
</script>

<style scoped>
.default-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.layout-content {
  flex: 1;
  overflow: auto;
}
</style>
