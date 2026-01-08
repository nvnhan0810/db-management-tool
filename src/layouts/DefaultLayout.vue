<template>
  <div class="default-layout">
    <!-- Custom Title Bar -->
    <CustomTitleBar @add-query="handleAddQuery" />

    <!-- Main Content -->
    <div class="layout-content">
      <router-view v-slot="{ Component }">
        <component :is="Component" ref="routerViewRef" />
      </router-view>
    </div>
  </div>
</template>

<script setup lang="ts">
import CustomTitleBar from '@/components/CustomTitleBar.vue';
import { ref } from 'vue';

const routerViewRef = ref();

// Handle add query from CustomTitleBar
const handleAddQuery = () => {
  console.log('DefaultLayout: handleAddQuery called');
  // Try to call handleAddQuery on router view (Workspace)
  if (routerViewRef.value && typeof routerViewRef.value.handleAddQuery === 'function') {
    console.log('DefaultLayout: Calling Workspace handleAddQuery');
    routerViewRef.value.handleAddQuery();
  } else {
    console.warn('DefaultLayout: routerViewRef.value.handleAddQuery is not a function', routerViewRef.value);
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
