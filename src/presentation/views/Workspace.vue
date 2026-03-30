<template>
  <div id="workspace">
    <div class="workspace-container">
      <ConnectionSidebar v-if="showSidebar" />
      <ConnectionContent ref="connectionContentRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ConnectionContent from '@/presentation/components/ConnectionContent.vue';
import ConnectionSidebar from '@/presentation/components/ConnectionSidebar.vue';
import { useConnectionStore } from '@/presentation/stores/connectionStore';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

const connectionStore = useConnectionStore();
const { activeConnections } = storeToRefs(connectionStore);
const connectionContentRef = ref<InstanceType<typeof ConnectionContent> | null>(null);

const showSidebar = computed(() => activeConnections.value.length > 1);

defineExpose({
  handleAddQuery: () => {
    if (connectionContentRef.value && typeof connectionContentRef.value.handleAddQuery === 'function') {
      connectionContentRef.value.handleAddQuery();
    }
  },
  handleSelectDatabase: () => {
    if (connectionContentRef.value && typeof connectionContentRef.value.openDatabaseSelectModal === 'function') {
      connectionContentRef.value.openDatabaseSelectModal();
    }
  },
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
