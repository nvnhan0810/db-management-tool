<template>
  <div id="workspace">
    <div class="workspace-container">
      <!-- Sidebar: Only show if more than 1 connection -->
      <ConnectionSidebar v-if="showSidebar" />

      <!-- Main Content -->
      <ConnectionContent />
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionContent from '@/components/ConnectionContent.vue';
import ConnectionSidebar from '@/components/ConnectionSidebar.vue';
import { useConnectionsStore } from '@/stores/connectionsStore';
import { computed } from 'vue';

const connectionsStore = useConnectionsStore();
const { activeConnections } = connectionsStore;

// Show sidebar only if there's more than 1 connection
const showSidebar = computed(() => activeConnections.length > 1);
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

