<template>
  <div id="home">
    <el-container>
      <header>
        <el-input
          v-model="searchText"
          class="search-input"
          size="default"
          placeholder="Search connections…"
          clearable
        />
        <div class="header-actions">
          <el-button size="small" type="primary" @click="handleNewConnection">
            <span class="codicon codicon-add" aria-hidden="true" style="margin-right: 6px;" />
            New
          </el-button>
          <el-button size="small" type="success" @click="openExportDialog">
            <span class="codicon codicon-cloud-upload" aria-hidden="true" style="margin-right: 6px;" />
            Export
          </el-button>
          <el-button size="small" type="warning" @click="handleImportConnections">
            <span class="codicon codicon-cloud-download" aria-hidden="true" style="margin-right: 6px;" />
            Import
          </el-button>
        </div>
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

        <div v-else class="connections-tree">
          <el-tree
            :data="treeData"
            node-key="key"
            default-expand-all
            highlight-current
            draggable
            :allow-drop="allowDrop"
            :allow-drag="allowDrag"
            @node-drop="onNodeDrop"
            @node-click="onNodeClick"
            class="connections-el-tree"
          >
            <template #default="{ data }">
              <div
                class="tree-row"
                :class="{
                  selected: selectedConnectionId === data.connection.id,
                }"
                @contextmenu.prevent.stop="(e: MouseEvent) => onNodeContextMenu(e, data)"
                @dblclick.stop="() => handleLoadConnection(data.connection)"
              >
                <span
                  class="conn-icon"
                  :class="`conn-icon--${data.connection.type === 'postgresql' ? 'postgresql' : data.connection.type === 'mysql' ? 'mysql' : 'other'}`"
                >
                  {{ data.connection.type === 'postgresql' ? 'Pg' : data.connection.type === 'mysql' ? 'Ms' : 'DB' }}
                </span>
                <span class="conn-text">
                  <div class="conn-title">{{ data.connection.name }}</div>
                  <div class="conn-subtitle">
                    <template v-if="data.connection.ssh?.enabled">
                      SSH: {{ data.connection.ssh.host }} : {{ data.connection.database || '' }}
                    </template>
                    <template v-else>
                      {{ data.connection.host }}:{{ data.connection.port }}<span v-if="data.connection.database"> : {{ data.connection.database }}</span>
                    </template>
                  </div>
                </span>
              </div>
            </template>
          </el-tree>
        </div>
      </el-main>
    </el-container>

    <!-- Context menu for saved connection -->
    <teleport to="body">
      <div
        v-if="ctxMenuVisible"
        class="home-ctx-menu"
        :style="{ left: `${ctxMenuX}px`, top: `${ctxMenuY}px` }"
        @click.stop
      >
        <button class="home-ctx-item" type="button" @click="ctxCommand('edit', ctxMenuConnection)">Edit</button>
        <button class="home-ctx-item danger" type="button" @click="ctxCommand('delete', ctxMenuConnection)">Delete</button>
        <div class="home-ctx-divider" role="separator" aria-hidden="true" />
        <button class="home-ctx-item" type="button" @click="ctxCommand('export', ctxMenuConnection)">Export</button>
      </div>
    </teleport>

    <!-- Export selection dialog -->
    <el-dialog
      v-model="exportDialogVisible"
      title="Export connections"
      width="420px"
      :close-on-click-modal="false"
      class="export-connections-dialog"
    >
      <div class="export-dialog-body">
        <el-checkbox
          v-model="exportAllChecked"
          class="export-select-all"
          @change="toggleExportAll"
        >
          Select all
        </el-checkbox>

        <div class="export-list-section">
          <el-checkbox-group v-model="exportSelectedIds">
            <div v-for="c in savedConnections" :key="c.id" class="export-list-item">
              <el-checkbox :label="c.id">
                {{ c.name }}
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
      </div>

      <template #footer>
        <div class="export-dialog-footer">
          <el-button size="small" @click="exportDialogVisible = false">Cancel</el-button>
          <el-button size="small" type="success" @click="confirmExportSelected">Export</el-button>
        </div>
      </template>
    </el-dialog>

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
import MissingCredentialsDialog from '@/presentation/components/MissingCredentialsDialog.vue';
import { useDatabase } from '@/presentation/composables/useDatabase';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { showErrorDialog } from '@/presentation/utils/errorDialogs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const connectionsStore = useConnectionsStore();
const { connect } = useDatabase();
const connectionStore = useConnectionStore();

const savedConnections = computed(() => connectionsStore.connections);
const isLoading = computed(() => connectionsStore.isLoading);
const hasConnections = computed(() => connectionsStore.hasConnections);
const {
  deleteConnection,
  getDecryptedConnection,
  updateLastUsed,
  loadSavedConnections,
  exportConnectionsJson,
  importConnectionsJson,
  saveConnection,
} = connectionsStore;

const showConnectionModal = ref(false);
const connectionToEdit = ref<SavedConnection | null>(null);
const selectedConnectionId = ref<string | null>(null);
const searchText = ref('');

const exportDialogVisible = ref(false);
const exportSelectedIds = ref<string[]>([]);
const exportAllChecked = ref(true);

// context menu state
const ctxMenuVisible = ref(false);
const ctxMenuX = ref(0);
const ctxMenuY = ref(0);
const ctxMenuConnection = ref<SavedConnection | null>(null);

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

function safeFilename(name: string) {
  return (name || 'connections').replace(/[^a-zA-Z0-9_.-]/g, '_');
}

const openExportDialog = () => {
  exportDialogVisible.value = true;
  exportAllChecked.value = true;
  exportSelectedIds.value = savedConnections.value.map((c) => c.id);
};

const toggleExportAll = () => {
  exportSelectedIds.value = exportAllChecked.value ? savedConnections.value.map((c) => c.id) : [];
};

const confirmExportSelected = async () => {
  try {
    const selected = savedConnections.value.filter((c) => exportSelectedIds.value.includes(c.id));
    const json = exportConnectionsJson(selected);
    const r = (await window.electron?.invoke('dialog:saveJsonFile', {
      title: 'Export connections',
      defaultFilename: 'gl_database_connections.json',
      content: json,
    })) as { success?: boolean; canceled?: boolean; error?: string } | undefined;
    exportDialogVisible.value = false;
    if (!r || r.canceled) return;
    if (!r.success) {
      await showErrorDialog({ title: 'Export failed', message: r.error || 'Export failed' });
    }
  } catch (err) {
    await showErrorDialog({
      title: 'Export failed',
      message: err instanceof Error ? err.message : 'Export failed',
      details: err instanceof Error ? err.stack : undefined,
    });
  }
};

const exportSingleConnection = async (connection: SavedConnection) => {
  try {
    const json = exportConnectionsJson([connection]);
    const r = (await window.electron?.invoke('dialog:saveJsonFile', {
      title: 'Export connection',
      defaultFilename: `${safeFilename(connection.name || connection.database || 'connection')}_connections.json`,
      content: json,
    })) as { success?: boolean; canceled?: boolean; error?: string } | undefined;
    if (!r || r.canceled) return;
    if (!r.success) {
      await showErrorDialog({ title: 'Export failed', message: r.error || 'Export failed' });
    }
  } catch (err) {
    await showErrorDialog({
      title: 'Export failed',
      message: err instanceof Error ? err.message : 'Export failed',
      details: err instanceof Error ? err.stack : undefined,
    });
  }
};

const handleImportConnections = async () => {
  try {
    const r = (await window.electron?.invoke('dialog:openJsonFile')) as
      | { canceled: boolean; content?: string | null; error?: string }
      | undefined;
    if (!r || r.canceled) return;
    if (!r.content) {
      await showErrorDialog({ title: 'Import failed', message: r.error || 'Empty file' });
      return;
    }
    await importConnectionsJson(r.content);
  } catch (err) {
    await showErrorDialog({
      title: 'Import failed',
      message: err instanceof Error ? err.message : 'Import failed',
      details: err instanceof Error ? err.stack : undefined,
    });
  }
};

const handleLoadConnection = async (connection: SavedConnection) => {
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
      await updateLastUsed(connection.id);
      const connectionWithName = { ...toConnect, name: connection.name };
      connectionsStore.setActiveConnection(connectionWithName);
      await connectionStore.addConnection(connectionWithName, connection.name);
      loadingMessage.close();
      await new Promise((r) => setTimeout(r, 100));
      router.push({ name: 'workspace' });
    } else {
      loadingMessage.close();
      await showErrorDialog({ title: 'Connect failed', message: resp.error || 'Failed to connect to database' });
    }
  } catch (error) {
    loadingMessage?.close();
    await showErrorDialog({
      title: 'Connect failed',
      message: error instanceof Error ? error.message : 'Failed to connect to database',
      details: error instanceof Error ? error.stack : undefined,
    });
  }
};

const closeCtxMenu = () => {
  ctxMenuVisible.value = false;
  ctxMenuConnection.value = null;
};

const ctxCommand = async (cmd: 'edit' | 'delete' | 'export', connection?: SavedConnection | null) => {
  const c = connection ?? ctxMenuConnection.value;
  closeCtxMenu();
  if (!c) return;
  if (cmd === 'export') {
    await exportSingleConnection(c);
    return;
  }
  await handleCommand(cmd, c);
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
      // success: no toast
    } catch (error) {
      if (error !== 'cancel') {
        await showErrorDialog({ title: 'Delete failed', message: 'Failed to delete connection' });
      }
    }
  }
};

type TreeNode = { key: string; kind: 'conn'; connection: SavedConnection; children?: undefined };

const treeData = computed<TreeNode[]>(() => {
  const q = searchText.value.trim().toLowerCase();
  const list = !q
    ? savedConnections.value
    : savedConnections.value.filter((c) => (c.name || '').toLowerCase().includes(q));
  return list.map((c) => ({ key: c.id, kind: 'conn', connection: c }));
});

const allowDrag = (node: any) => {
  return node?.data?.kind === 'conn';
};

const allowDrop = (dragging: any, drop: any, type: 'prev' | 'inner' | 'next') => {
  // Only reorder as sibling (prev/next)
  if (type === 'inner') return false;
  const d = dragging?.data;
  const t = drop?.data;
  if (!d || !t) return false;
  if (d.kind !== 'conn' || t.kind !== 'conn') return false;
  return true;
};

const onNodeDrop = async (_dragging: any, _drop: any) => {
  // After drop, rebuild order from current rendered order
  const ids = treeData.value.map((n) => n.connection.id);
  await connectionsStore.reorderConnections(ids);
};

const onNodeClick = (data: any) => {
  if (!data?.connection?.id) return;
  selectedConnectionId.value = data.connection.id;
};

const onNodeContextMenu = (e: MouseEvent, data: any) => {
  if (!data?.connection) return;
  selectedConnectionId.value = data.connection.id;
  ctxMenuConnection.value = data.connection;
  ctxMenuX.value = e.clientX;
  ctxMenuY.value = e.clientY;
  ctxMenuVisible.value = true;
};

function handleGlobalClick(e: MouseEvent) {
  if (!ctxMenuVisible.value) return;
  const node = e.target as Node | null;
  // Click can target a Text node inside <button>; Element.closest would skip it and we’d close the menu in capture phase before ctxCommand runs.
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  if (el?.closest('.home-ctx-menu')) {
    return;
  }
  closeCtxMenu();
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeCtxMenu();
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick, { capture: true });
  document.addEventListener('contextmenu', handleGlobalClick, { capture: true });
  document.addEventListener('keydown', handleGlobalKeydown, { capture: true });
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick, { capture: true } as any);
  document.removeEventListener('contextmenu', handleGlobalClick, { capture: true } as any);
  document.removeEventListener('keydown', handleGlobalKeydown, { capture: true } as any);
});
</script>

<style scoped lang="scss">
@use '@/styles/views/home.scss' as *;

.connections-tree {
  width: 100%;
}

.search-input {
  max-width: 420px;
}

.header-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.header-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.tree-row {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.connections-el-tree {
  padding: 6px 0;
}

.tree-row {
  padding: 12px 8px;
  width: 100%;
  box-sizing: border-box;
}

/* Element Plus tree node height is fixed by default; override to support 2-line rows */
:global(.connections-el-tree .el-tree-node__content) {
  height: auto !important;
  min-height: 48px;
  align-items: stretch;
  padding: 0 !important;
}

/* Selected + hover must live on the same element (.tree-row). Element Plus hover is on
   .el-tree-node__content (full row incl. expand gutter) so it looked wider than .tree-row.selected. */
:global(.connections-el-tree .el-tree-node.is-current > .el-tree-node__content),
:global(.connections-el-tree .el-tree-node__content:hover),
:global(.connections-el-tree .el-tree-node__content:focus) {
  background: transparent !important;
}

:global(.connections-el-tree .el-tree-node__expand-icon) {
  align-self: center;
  margin-top: 0;
}

.tree-row:hover:not(.selected) {
  background: rgba(64, 158, 255, 0.1);
  border-radius: 6px;
}

.tree-row.selected {
  background: rgba(64, 158, 255, 0.14);
  border-radius: 6px;
  outline: 1px solid rgba(64, 158, 255, 0.38);
}

.tree-row.selected:hover {
  background: rgba(64, 158, 255, 0.18);
}

.conn-icon {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
  margin-right: 10px;
  color: #fff;
}

.conn-icon--postgresql {
  background: #3b82f6; /* blue */
}

.conn-icon--mysql {
  background: #f59e0b; /* orange */
}

.conn-icon--other {
  background: #64748b; /* slate */
}

.conn-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.conn-title {
  font-size: 13px;
  line-height: 1.2;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conn-subtitle {
  font-size: 12px;
  line-height: 1.2;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

:global(.home-ctx-menu) {
  position: fixed;
  z-index: 9999;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 6px;
  min-width: 160px;
  box-shadow: var(--el-box-shadow-light);
}

:global(.home-ctx-divider) {
  height: 1px;
  margin: 6px 4px;
  background: var(--el-border-color);
}

:global(.home-ctx-item) {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--el-text-color-primary);
  border-radius: 6px;
  cursor: pointer;
}

:global(.home-ctx-item:hover) {
  background: rgba(64, 158, 255, 0.12);
}

:global(.home-ctx-item.danger:hover) {
  background: rgba(245, 108, 108, 0.12);
}

.export-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.export-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.export-select-all {
  flex-shrink: 0;
}

.export-list-section {
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 10px 12px;
  max-height: 320px;
  overflow-y: auto;
}

.export-list-item {
  margin: 0;

  &:first-child {
    margin-top: 0;
  }

  &:last-child {
    margin-bottom: 0;
  }
}
</style>

<style lang="scss">
/* Element Plus: checked checkbox label uses --el-checkbox-checked-text-color (= primary blue by default) */
.export-connections-dialog .el-checkbox {
  --el-checkbox-checked-text-color: var(--el-text-color-primary);
}

/* Teleported dialog — force readable white copy in dark theme (Element vars + title span) */
html.dark .export-connections-dialog {
  --el-text-color-primary: #ffffff;
  --el-text-color-regular: #ffffff;
  --el-checkbox-text-color: #ffffff;
  /* Checked state defaults to primary blue — force white to match dialog */
  --el-checkbox-checked-text-color: #ffffff;
  color: #ffffff;
}

html.dark .export-connections-dialog .el-dialog__title {
  color: #ffffff !important;
}

html.dark .export-connections-dialog .el-dialog__body {
  color: #ffffff !important;
}

html.dark .export-connections-dialog .el-checkbox {
  --el-checkbox-text-color: #ffffff;
  --el-checkbox-checked-text-color: #ffffff;
  color: #ffffff;
}

html.dark .export-connections-dialog .el-checkbox.is-checked .el-checkbox__label {
  color: #ffffff !important;
}
</style>
