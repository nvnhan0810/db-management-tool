<template>
  <el-dialog
    v-model="visible"
    title="Saved Connections"
    width="520px"
    :close-on-click-modal="true"
    class="saved-connections-modal"
    @close="handleClose"
  >
    <div class="modal-body">
      <div v-if="isLoading" class="loading">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="hasConnections" class="connections-tree">
        <el-tree
          :data="treeData"
          node-key="key"
          default-expand-all
          highlight-current
          :props="treeProps"
          class="saved-connections-el-tree"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <div
              class="tree-row"
              :class="{
                selected: selectedConnectionId === data.connection.id,
              }"
              @dblclick.stop="() => handleDblClickConnect(data.connection)"
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

      <div v-else class="no-connections">
        <el-empty description="No saved connections">
          <el-button type="primary" size="small" @click="handleNewConnection">
            <span class="codicon codicon-add" aria-hidden="true" style="margin-right: 6px;" />
            New Connection
          </el-button>
        </el-empty>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <el-button size="small" type="primary" @click="handleNewConnection">
          <span class="codicon codicon-add" aria-hidden="true" style="margin-right: 4px;" />
          New
        </el-button>
        <el-button size="small" @click="visible = false">Cancel</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { SavedConnection } from '@/infrastructure/storage/storageService';
import { useConnectionsStore } from '@/presentation/stores/connectionsStore';
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'new-connection': [];
  select: [connection: SavedConnection];
}>();

const connectionsStore = useConnectionsStore();
const savedConnections = computed(() => connectionsStore.connections);
const isLoading = computed(() => connectionsStore.isLoading);
const hasConnections = computed(() => connectionsStore.hasConnections);

const selectedConnectionId = ref<string | null>(null);

type TreeNode = { key: string; label: string; connection: SavedConnection };

const treeProps = { label: 'label', children: 'children' };

const treeData = computed<TreeNode[]>(() =>
  savedConnections.value.map((c) => ({
    key: c.id,
    label: c.name,
    connection: c,
  }))
);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

watch(visible, (open) => {
  if (open) {
    connectionsStore.loadSavedConnections();
    selectedConnectionId.value = null;
  }
});

const handleClose = () => {
  visible.value = false;
};

const handleNewConnection = () => {
  emit('new-connection');
  visible.value = false;
};

const onNodeClick = (data: TreeNode) => {
  if (!data?.connection?.id) return;
  selectedConnectionId.value = data.connection.id;
};

const handleDblClickConnect = (connection: SavedConnection) => {
  emit('select', connection);
};
</script>

<style scoped lang="scss">
.modal-body {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.loading {
  padding: 1rem 0;
}

.connections-tree {
  width: 100%;
}

.saved-connections-el-tree {
  padding: 6px 0;
}

.tree-row {
  display: flex;
  align-items: flex-start;
  padding: 12px 8px;
  width: 100%;
  box-sizing: border-box;
}

:global(.saved-connections-el-tree .el-tree-node__content) {
  height: auto !important;
  min-height: 48px;
  align-items: stretch;
  padding: 0 !important;
}

:global(.saved-connections-el-tree .el-tree-node.is-current > .el-tree-node__content),
:global(.saved-connections-el-tree .el-tree-node__content:hover),
:global(.saved-connections-el-tree .el-tree-node__content:focus) {
  background: transparent !important;
}

:global(.saved-connections-el-tree .el-tree-node__expand-icon) {
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
  background: #3b82f6;
}

.conn-icon--mysql {
  background: #f59e0b;
}

.conn-icon--other {
  background: #64748b;
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

.no-connections {
  padding: 2rem 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
