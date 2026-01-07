<template>
  <div class="default-layout">
    <!-- Custom Title Bar -->
    <CustomTitleBar />

    <!-- Main Content -->
    <div class="layout-content">
      <router-view />
    </div>
  </div>
</template>

<script setup lang="ts">
import CustomTitleBar from '@/components/CustomTitleBar.vue';
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
