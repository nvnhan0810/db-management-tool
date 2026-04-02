<template>
  <div class="default-layout">
    <CustomTitleBar
      @add-query="handleAddQuery"
      @new-connection="handleNewConnection"
      @select-database="handleSelectDatabase"
    />

    <div class="layout-content">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="routerViewRef" />
      </router-view>
    </div>

    <SavedConnectionsModal
      v-model="showSavedConnectionsModal"
      @new-connection="handleOpenConnectionForm"
      @select="handleSelectSavedConnection"
    />

    <ConnectionModal
      v-model="showConnectionModal"
      :connection-to-edit="connectionToEdit"
      @saved="handleConnectionSaved"
      @connected="handleConnectionConnected"
    />
  </div>
</template>

<script setup lang="ts">
import ConnectionModal from '@/presentation/components/ConnectionModal.vue';
import CustomTitleBar from '@/presentation/components/CustomTitleBar.vue';
import SavedConnectionsModal from '@/presentation/components/SavedConnectionsModal.vue';
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { useDatabase } from '@/presentation/composables/useDatabase';
import { ElMessage } from 'element-plus';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const routerViewRef = ref();
const connectionsStore = useConnectionsStore();
const connectionStore = useConnectionStore();
const { connect } = useDatabase();

const showSavedConnectionsModal = ref(false);
const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

const handleNewConnection = () => {
  showSavedConnectionsModal.value = true;
};

const handleOpenConnectionForm = () => {
  connectionToEdit.value = null;
  showConnectionModal.value = true;
};

const handleSelectSavedConnection = async (connection: SavedConnection) => {
  let loadingMessage: ReturnType<typeof ElMessage> | null = null;
  try {
    loadingMessage = ElMessage({ message: 'Connecting...', type: 'info', duration: 0 });
    const decryptedConnection = await connectionsStore.getDecryptedConnection(connection);
    const resp = await connect(decryptedConnection);

    if (resp.success) {
      await connectionsStore.updateLastUsed(connection.id);
      const connectionWithName = { ...decryptedConnection, name: connection.name };
      connectionsStore.setActiveConnection(connectionWithName);
      await connectionStore.addConnection(connectionWithName, connection.name);
      loadingMessage.close();
      showSavedConnectionsModal.value = false;
      await new Promise((r) => setTimeout(r, 100));
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      // Connection failed — open the edit form so the user can review/fix credentials.
      showSavedConnectionsModal.value = false;
      connectionToEdit.value = connection;
      showConnectionModal.value = true;
      ElMessage.warning(resp.error || 'Connection failed. Please check your credentials.');
    }
  } catch (err) {
    loadingMessage?.close();
    // Unexpected error (e.g. decryption failed) — open edit form for the user to re-enter.
    showSavedConnectionsModal.value = false;
    connectionToEdit.value = connection;
    showConnectionModal.value = true;
    ElMessage.warning(err instanceof Error ? err.message : 'Connection failed. Please check your credentials.');
  }
};

const handleConnectionSaved = () => {
  connectionsStore.loadSavedConnections();
  connectionToEdit.value = null;
};

const handleConnectionConnected = () => {
  connectionsStore.loadSavedConnections();
  showConnectionModal.value = false;
};

const handleSelectDatabase = () => {
  if (routerViewRef.value && typeof routerViewRef.value.handleSelectDatabase === 'function') {
    routerViewRef.value.handleSelectDatabase();
  }
};

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
