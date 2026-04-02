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

    <MissingCredentialsDialog
      v-model="missingCredOpen"
      :saved="missingCredCtx?.saved ?? null"
      :decrypted="missingCredCtx?.decrypted ?? null"
      :flags="missingCredCtx?.flags ?? null"
      @confirm="onMissingCredConfirm"
      @cancel="onMissingCredCancel"
    />
  </div>
</template>

<script setup lang="ts">
import type { DatabaseConnection } from '@/domain/connection/types';
import { computeMissingCredentials } from '@/domain/connection/missingCredentials';
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import ConnectionModal from '@/presentation/components/ConnectionModal.vue';
import CustomTitleBar from '@/presentation/components/CustomTitleBar.vue';
import MissingCredentialsDialog from '@/presentation/components/MissingCredentialsDialog.vue';
import SavedConnectionsModal from '@/presentation/components/SavedConnectionsModal.vue';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { useDatabase } from '@/presentation/composables/useDatabase';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { ElMessage } from 'element-plus';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const routerViewRef = ref();
const connectionsStore = useConnectionsStore();
const connectionStore = useConnectionStore();
const { connect } = useDatabase();
const { getDecryptedConnection, saveConnection } = connectionsStore;

const showSavedConnectionsModal = ref(false);
const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);

const missingCredOpen = ref(false);
const missingCredCtx = ref<{
  saved: SavedConnection;
  decrypted: DatabaseConnection & { name?: string };
  flags: ReturnType<typeof computeMissingCredentials>;
} | null>(null);
let missingCredResolve: ((v: DatabaseConnection | null) => void) | undefined;

function openMissingCredentialsDialog(
  saved: SavedConnection,
  decrypted: DatabaseConnection & { name?: string },
  flags: ReturnType<typeof computeMissingCredentials>
): Promise<DatabaseConnection | null> {
  return new Promise((resolve) => {
    missingCredResolve = resolve;
    missingCredCtx.value = { saved, decrypted, flags };
    missingCredOpen.value = true;
  });
}

function onMissingCredConfirm(conn: DatabaseConnection) {
  missingCredCtx.value = null;
  missingCredResolve?.(conn);
  missingCredResolve = undefined;
}

function onMissingCredCancel() {
  missingCredCtx.value = null;
  missingCredResolve?.(null);
  missingCredResolve = undefined;
}

function stripConnectionName(c: DatabaseConnection & { name?: string }): DatabaseConnection {
  const { name: _n, ...rest } = c;
  return rest as DatabaseConnection;
}

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
    const decryptedRaw = await getDecryptedConnection(connection);
    const flags = computeMissingCredentials(Boolean(connection.ssh?.enabled), decryptedRaw);
    let toConnect = stripConnectionName(decryptedRaw);
    let shouldPersistSecrets = false;

    if (flags.needDbPassword || flags.needSshAuth) {
      loadingMessage.close();
      loadingMessage = null;
      const merged = await openMissingCredentialsDialog(connection, decryptedRaw, flags);
      if (!merged) return;
      toConnect = merged;
      shouldPersistSecrets = true;
      loadingMessage = ElMessage({ message: 'Connecting...', type: 'info', duration: 0 });
    }

    const resp = await connect(toConnect);

    if (resp.success) {
      if (shouldPersistSecrets) {
        await saveConnection(toConnect, connection.name);
      }
      await connectionsStore.updateLastUsed(connection.id);
      const connectionWithName = { ...toConnect, name: connection.name };
      connectionsStore.setActiveConnection(connectionWithName);
      await connectionStore.addConnection(connectionWithName, connection.name);
      loadingMessage.close();
      showSavedConnectionsModal.value = false;
      await new Promise((r) => setTimeout(r, 100));
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      showSavedConnectionsModal.value = false;
      connectionToEdit.value = connection;
      showConnectionModal.value = true;
      await showErrorDialog({
        title: 'Connect failed',
        message: resp.error || 'Connection failed. Please check your credentials.',
      });
    }
  } catch (err) {
    loadingMessage?.close();
    showSavedConnectionsModal.value = false;
    connectionToEdit.value = connection;
    showConnectionModal.value = true;
    await showErrorDialog({
      title: 'Connect failed',
      message: err instanceof Error ? err.message : 'Connection failed. Please check your credentials.',
      details: err instanceof Error ? err.stack : undefined,
    });
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
