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
const connectionStore = useConnectionStore();
const connectionsStore = useConnectionsStore();
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
  try {
    const loadingMessage = ElMessage({ message: 'Connecting...', type: 'info', duration: 0 });
    const decryptedConnection = await connectionStore.getDecryptedConnection(connection);
    const success = await connect(decryptedConnection);

    if (success) {
      await connectionStore.updateLastUsed(connection.id);
      const connectionWithName = { ...decryptedConnection, name: connection.name };
      connectionStore.setActiveConnection(connectionWithName);
      await connectionsStore.addConnection(connectionWithName, connection.name);
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
