<template>
  <div id="workspace">
    <div class="workspace-container">
      <!-- Sidebar: Only show if more than 1 connection -->
      <ConnectionSidebar v-if="showSidebar" />

      <!-- Main Content -->
      <ConnectionContent ref="connectionContentRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionContent from '@/components/ConnectionContent.vue';
import ConnectionSidebar from '@/components/ConnectionSidebar.vue';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { computed, ref } from 'vue';

const connectionsStore = useConnectionsStore();
const { activeConnections } = connectionsStore;
const connectionContentRef = ref<InstanceType<typeof ConnectionContent> | null>(null);

// Show sidebar only if there's more than 1 connection
const showSidebar = computed(() => activeConnections.length > 1);

// Expose method to parent (DefaultLayout)
defineExpose({
  handleAddQuery: () => {
    console.log('Workspace: handleAddQuery called');
    if (connectionContentRef.value && typeof connectionContentRef.value.handleAddQuery === 'function') {
      console.log('Workspace: Calling ConnectionContent handleAddQuery');
      connectionContentRef.value.handleAddQuery();
    } else {
      console.warn('Workspace: connectionContentRef.value.handleAddQuery is not a function', connectionContentRef.value);
    }
  }
});
</script>

<style scoped lang="scss">
#workspace {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
  overflow: hidden;

  .workspace-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }
}
</style>

